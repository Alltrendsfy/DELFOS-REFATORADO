import crypto from 'crypto';
import { db } from '../../db';
import { eq, and, inArray } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { campaignGovernanceService } from './campaignGovernanceService';

interface KrakenOpenOrder {
  orderId: string;
  pair: string;
  side: string;
  type: string;
  price: string;
  volume: string;
  status: string;
}

interface KrakenPosition {
  pair: string;
  side: string;
  volume: string;
  avgPrice: string;
}

interface DELFOSPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: string;
  entry_price: string;
  state: string;
}

interface DELFOSOrder {
  id: string;
  symbol: string;
  side: string;
  order_type: string;
  quantity: string;
  status: string;
  exchange_order_id: string | null;
}

interface Discrepancy {
  type: 'position_mismatch' | 'order_mismatch' | 'balance_mismatch' | 'orphan_exchange' | 'orphan_delfos';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  delfos_data?: Record<string, any>;
  exchange_data?: Record<string, any>;
  suggested_action: string;
}

interface ReconciliationResult {
  status: 'completed' | 'mismatch_detected' | 'failed';
  discrepancies: Discrepancy[];
  delfosSnapshot: {
    positions: DELFOSPosition[];
    orders: DELFOSOrder[];
    positionCount: number;
    orderCount: number;
  };
  exchangeSnapshot: {
    positions: KrakenPosition[];
    orders: KrakenOpenOrder[];
    positionCount: number;
    orderCount: number;
  };
  reconciliationHash: string;
  completedAt: Date;
}

const KRAKEN_API_URL = 'https://api.kraken.com';

function generateKrakenSignature(path: string, nonce: string, postData: string, apiSecret: Buffer): string {
  const sha256Hash = crypto.createHash('sha256').update(nonce + postData).digest();
  const hmac = crypto.createHmac('sha512', apiSecret).update(path + sha256Hash.toString('binary'), 'binary').digest('base64');
  return hmac;
}

async function krakenPrivateRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
  const apiKey = process.env.KRAKEN_API_KEY;
  const apiSecretRaw = process.env.KRAKEN_API_SECRET;
  
  if (!apiKey || !apiSecretRaw) {
    throw new Error('KRAKEN_API_KEY and KRAKEN_API_SECRET must be configured');
  }
  
  const apiSecret = Buffer.from(apiSecretRaw, 'base64');
  const path = `/0/private/${endpoint}`;
  const url = KRAKEN_API_URL + path;
  const nonce = Date.now().toString();
  
  const postData = new URLSearchParams({ nonce, ...params }).toString();
  const signature = generateKrakenSignature(path, nonce, postData, apiSecret);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'API-Key': apiKey,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  });
  
  if (!response.ok) {
    throw new Error(`Kraken API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json() as T;
}

function normalizeKrakenPair(krakenPair: string): string {
  let normalized = krakenPair;
  if (normalized.startsWith('XBT')) {
    normalized = normalized.replace('XBT', 'BTC');
  }
  if (normalized.length > 6 && !normalized.includes('/')) {
    const base = normalized.slice(0, -3);
    const quote = normalized.slice(-3);
    normalized = `${base}/${quote}`;
  }
  return normalized;
}

class ExchangeReconciliationService {

  async reconcileCampaign(campaignId: string): Promise<ReconciliationResult> {
    console.log(`[Reconciliation] Starting reconciliation for campaign ${campaignId}`);
    
    const [reconciliationRecord] = await db.insert(schema.exchange_reconciliations).values({
      campaign_id: campaignId,
      reconciliation_type: 'full',
      status: 'in_progress',
      delfos_snapshot: {},
      exchange_snapshot: {},
      reconciliation_hash: '',
    }).returning();

    try {
      const [delfosPositions, delfosOrders] = await Promise.all([
        this.getDELFOSPositions(campaignId),
        this.getDELFOSOrders(campaignId),
      ]);

      const [exchangeOrders, exchangeBalance] = await Promise.all([
        this.getKrakenOpenOrders(),
        this.getKrakenBalance(),
      ]);

      const delfosSnapshot = {
        positions: delfosPositions,
        orders: delfosOrders,
        positionCount: delfosPositions.length,
        orderCount: delfosOrders.length,
      };

      const exchangeSnapshot = {
        positions: [] as KrakenPosition[],
        orders: exchangeOrders,
        positionCount: 0,
        orderCount: exchangeOrders.length,
        balance: exchangeBalance,
      };

      const discrepancies = this.findDiscrepancies(delfosSnapshot, exchangeSnapshot);

      const reconciliationHash = this.generateReconciliationHash(delfosSnapshot, exchangeSnapshot);

      const status = discrepancies.length > 0 ? 'mismatch_detected' : 'completed';

      await db.update(schema.exchange_reconciliations)
        .set({
          status,
          delfos_snapshot: delfosSnapshot,
          exchange_snapshot: exchangeSnapshot,
          discrepancies: discrepancies.length > 0 ? discrepancies : null,
          discrepancy_count: discrepancies.length,
          reconciliation_hash: reconciliationHash,
          completed_at: new Date(),
        })
        .where(eq(schema.exchange_reconciliations.id, reconciliationRecord.id));

      await db.update(schema.campaigns)
        .set({
          last_reconciled_at: new Date(),
          reconciliation_status: status === 'completed' ? 'ok' : 'mismatch',
          reconciliation_hash: reconciliationHash,
        })
        .where(eq(schema.campaigns.id, campaignId));

      await campaignGovernanceService.logReconciliationCompleted(
        campaignId,
        reconciliationRecord.id,
        { status, discrepancy_count: discrepancies.length }
      );

      console.log(`[Reconciliation] Completed for campaign ${campaignId} | Status: ${status} | Discrepancies: ${discrepancies.length}`);

      return {
        status,
        discrepancies,
        delfosSnapshot,
        exchangeSnapshot,
        reconciliationHash,
        completedAt: new Date(),
      };

    } catch (error: any) {
      console.error(`[Reconciliation] Failed for campaign ${campaignId}:`, error.message);

      await db.update(schema.exchange_reconciliations)
        .set({
          status: 'failed',
          discrepancies: [{ type: 'error', description: error.message }],
          completed_at: new Date(),
        })
        .where(eq(schema.exchange_reconciliations.id, reconciliationRecord.id));

      throw error;
    }
  }

  private async getDELFOSPositions(campaignId: string): Promise<DELFOSPosition[]> {
    const positions = await db.select({
      id: schema.campaign_positions.id,
      symbol: schema.campaign_positions.symbol,
      side: schema.campaign_positions.side,
      quantity: schema.campaign_positions.quantity,
      entry_price: schema.campaign_positions.entry_price,
      state: schema.campaign_positions.state,
    }).from(schema.campaign_positions)
      .where(and(
        eq(schema.campaign_positions.campaign_id, campaignId),
        eq(schema.campaign_positions.state, 'open')
      ));

    return positions;
  }

  private async getDELFOSOrders(campaignId: string): Promise<DELFOSOrder[]> {
    const orders = await db.select({
      id: schema.campaign_orders.id,
      symbol: schema.campaign_orders.symbol,
      side: schema.campaign_orders.side,
      order_type: schema.campaign_orders.order_type,
      quantity: schema.campaign_orders.quantity,
      status: schema.campaign_orders.status,
      exchange_order_id: schema.campaign_orders.exchange_order_id,
    }).from(schema.campaign_orders)
      .where(and(
        eq(schema.campaign_orders.campaign_id, campaignId),
        eq(schema.campaign_orders.status, 'open')
      ));

    return orders;
  }

  private async getKrakenOpenOrders(): Promise<KrakenOpenOrder[]> {
    try {
      const response = await krakenPrivateRequest<{
        error: string[];
        result?: { open?: Record<string, any> };
      }>('OpenOrders');

      if (response.error?.length > 0) {
        console.error('[Reconciliation] Kraken OpenOrders error:', response.error);
        return [];
      }

      const openOrders = response.result?.open || {};
      
      return Object.entries(openOrders).map(([orderId, order]: [string, any]) => ({
        orderId,
        pair: normalizeKrakenPair(order.descr?.pair || ''),
        side: order.descr?.type || '',
        type: order.descr?.ordertype || '',
        price: order.descr?.price || '0',
        volume: order.vol || '0',
        status: order.status || 'open',
      }));
    } catch (error) {
      console.error('[Reconciliation] Failed to fetch Kraken orders:', error);
      return [];
    }
  }

  private async getKrakenBalance(): Promise<Record<string, string>> {
    try {
      const response = await krakenPrivateRequest<{
        error: string[];
        result?: Record<string, string>;
      }>('Balance');

      if (response.error?.length > 0) {
        console.error('[Reconciliation] Kraken Balance error:', response.error);
        return {};
      }

      return response.result || {};
    } catch (error) {
      console.error('[Reconciliation] Failed to fetch Kraken balance:', error);
      return {};
    }
  }

  private findDiscrepancies(
    delfos: { positions: DELFOSPosition[]; orders: DELFOSOrder[] },
    exchange: { orders: KrakenOpenOrder[] }
  ): Discrepancy[] {
    const discrepancies: Discrepancy[] = [];

    for (const delfosOrder of delfos.orders) {
      if (!delfosOrder.exchange_order_id) {
        discrepancies.push({
          type: 'order_mismatch',
          severity: 'medium',
          description: `DELFOS order ${delfosOrder.id} has no exchange_order_id`,
          delfos_data: delfosOrder,
          suggested_action: 'Verify if order was submitted to exchange or sync order ID',
        });
        continue;
      }

      const exchangeOrder = exchange.orders.find(o => o.orderId === delfosOrder.exchange_order_id);
      if (!exchangeOrder) {
        discrepancies.push({
          type: 'orphan_delfos',
          severity: 'high',
          description: `DELFOS order ${delfosOrder.id} not found on exchange (exchange_order_id: ${delfosOrder.exchange_order_id})`,
          delfos_data: delfosOrder,
          suggested_action: 'Order may have been filled/cancelled. Update DELFOS state.',
        });
      }
    }

    const delfosExchangeIds = new Set(delfos.orders.map(o => o.exchange_order_id).filter(Boolean));
    for (const exchangeOrder of exchange.orders) {
      if (!delfosExchangeIds.has(exchangeOrder.orderId)) {
        discrepancies.push({
          type: 'orphan_exchange',
          severity: 'medium',
          description: `Exchange order ${exchangeOrder.orderId} not tracked in DELFOS`,
          exchange_data: exchangeOrder,
          suggested_action: 'May be from another system or manual trade. Consider tracking or ignoring.',
        });
      }
    }

    return discrepancies;
  }

  private generateReconciliationHash(
    delfos: Record<string, any>,
    exchange: Record<string, any>
  ): string {
    const hashInput = JSON.stringify({
      delfos,
      exchange,
      timestamp: new Date().toISOString(),
    });
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  async getReconciliationHistory(
    campaignId: string,
    limit: number = 20
  ): Promise<schema.ExchangeReconciliation[]> {
    return db.select()
      .from(schema.exchange_reconciliations)
      .where(eq(schema.exchange_reconciliations.campaign_id, campaignId))
      .orderBy(schema.exchange_reconciliations.started_at)
      .limit(limit);
  }

  async getLastReconciliation(campaignId: string): Promise<schema.ExchangeReconciliation | null> {
    const [last] = await db.select()
      .from(schema.exchange_reconciliations)
      .where(eq(schema.exchange_reconciliations.campaign_id, campaignId))
      .orderBy(schema.exchange_reconciliations.started_at)
      .limit(1);
    
    return last || null;
  }

  async resolveDiscrepancy(
    reconciliationId: string,
    resolution: string,
    resolvedBy: string
  ): Promise<void> {
    await db.update(schema.exchange_reconciliations)
      .set({
        resolution_status: 'resolved',
        resolution_notes: resolution,
        resolved_at: new Date(),
        resolved_by: resolvedBy,
      })
      .where(eq(schema.exchange_reconciliations.id, reconciliationId));
  }
}

export const exchangeReconciliationService = new ExchangeReconciliationService();
