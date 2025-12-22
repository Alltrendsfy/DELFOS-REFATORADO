import { db } from "../db";
import { franchise_exchange_accounts, franchises, FranchiseExchangeAccount } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "./encryptionService";
import crypto from 'crypto';

interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
}

interface CreateExchangeAccountParams {
  franchiseId: string;
  exchange?: string;
  exchangeLabel?: string;
  credentials: ExchangeCredentials;
  canReadBalance?: boolean;
  canTrade?: boolean;
  canWithdraw?: boolean;
  createdBy?: string;
}

interface UpdateExchangeAccountParams {
  exchangeLabel?: string;
  credentials?: ExchangeCredentials;
  canReadBalance?: boolean;
  canTrade?: boolean;
  isActive?: boolean;
}

export class FranchiseExchangeService {

  async createExchangeAccount(params: CreateExchangeAccountParams): Promise<FranchiseExchangeAccount> {
    const franchise = await db
      .select()
      .from(franchises)
      .where(eq(franchises.id, params.franchiseId))
      .limit(1);

    if (!franchise.length) {
      throw new Error(`Franchise not found: ${params.franchiseId}`);
    }

    const existing = await db
      .select()
      .from(franchise_exchange_accounts)
      .where(
        and(
          eq(franchise_exchange_accounts.franchise_id, params.franchiseId),
          eq(franchise_exchange_accounts.exchange, params.exchange || "kraken")
        )
      )
      .limit(1);

    if (existing.length) {
      throw new Error(`Exchange account already exists for ${params.exchange || "kraken"}`);
    }

    const [account] = await db
      .insert(franchise_exchange_accounts)
      .values({
        franchise_id: params.franchiseId,
        exchange: params.exchange || "kraken",
        exchange_label: params.exchangeLabel,
        api_key_encrypted: encrypt(params.credentials.apiKey),
        api_secret_encrypted: encrypt(params.credentials.apiSecret),
        api_passphrase_encrypted: params.credentials.apiPassphrase 
          ? encrypt(params.credentials.apiPassphrase) 
          : null,
        can_read_balance: params.canReadBalance ?? true,
        can_trade: params.canTrade ?? false,
        can_withdraw: params.canWithdraw ?? false,
        created_by: params.createdBy,
      })
      .returning();

    console.log(`[FranchiseExchange] Created ${params.exchange || "kraken"} account for franchise ${params.franchiseId}`);
    return account;
  }

  async updateExchangeAccount(
    franchiseId: string,
    exchange: string,
    params: UpdateExchangeAccountParams
  ): Promise<FranchiseExchangeAccount | null> {
    const updateData: Record<string, any> = {
      updated_at: new Date(),
    };

    if (params.exchangeLabel !== undefined) {
      updateData.exchange_label = params.exchangeLabel;
    }

    if (params.credentials) {
      updateData.api_key_encrypted = encrypt(params.credentials.apiKey);
      updateData.api_secret_encrypted = encrypt(params.credentials.apiSecret);
      if (params.credentials.apiPassphrase) {
        updateData.api_passphrase_encrypted = encrypt(params.credentials.apiPassphrase);
      }
      updateData.is_verified = false;
      updateData.verified_at = null;
    }

    if (params.canReadBalance !== undefined) {
      updateData.can_read_balance = params.canReadBalance;
    }

    if (params.canTrade !== undefined) {
      updateData.can_trade = params.canTrade;
    }

    if (params.isActive !== undefined) {
      updateData.is_active = params.isActive;
    }

    const [updated] = await db
      .update(franchise_exchange_accounts)
      .set(updateData)
      .where(
        and(
          eq(franchise_exchange_accounts.franchise_id, franchiseId),
          eq(franchise_exchange_accounts.exchange, exchange)
        )
      )
      .returning();

    return updated || null;
  }

  async getExchangeAccount(
    franchiseId: string,
    exchange: string = "kraken"
  ): Promise<FranchiseExchangeAccount | null> {
    const [account] = await db
      .select()
      .from(franchise_exchange_accounts)
      .where(
        and(
          eq(franchise_exchange_accounts.franchise_id, franchiseId),
          eq(franchise_exchange_accounts.exchange, exchange)
        )
      )
      .limit(1);

    return account || null;
  }

  async getDecryptedCredentials(
    franchiseId: string,
    exchange: string = "kraken"
  ): Promise<ExchangeCredentials | null> {
    const account = await this.getExchangeAccount(franchiseId, exchange);

    if (!account || !account.is_active) {
      return null;
    }

    try {
      return {
        apiKey: decrypt(account.api_key_encrypted),
        apiSecret: decrypt(account.api_secret_encrypted),
        apiPassphrase: account.api_passphrase_encrypted 
          ? decrypt(account.api_passphrase_encrypted) 
          : undefined,
      };
    } catch (error) {
      console.error(`[FranchiseExchange] Failed to decrypt credentials for franchise ${franchiseId}:`, error);
      return null;
    }
  }

  async getAllExchangeAccounts(franchiseId: string): Promise<FranchiseExchangeAccount[]> {
    return db
      .select()
      .from(franchise_exchange_accounts)
      .where(eq(franchise_exchange_accounts.franchise_id, franchiseId));
  }

  async verifyExchangeAccount(
    franchiseId: string,
    exchange: string = "kraken"
  ): Promise<{ success: boolean; message: string }> {
    const credentials = await this.getDecryptedCredentials(franchiseId, exchange);

    if (!credentials) {
      return { success: false, message: "No credentials found or account inactive" };
    }

    try {
      if (exchange === "kraken") {
        const result = await this.testKrakenCredentials(credentials);
        
        if (result.success) {
          await db
            .update(franchise_exchange_accounts)
            .set({
              is_verified: true,
              verified_at: new Date(),
              consecutive_errors: 0,
              last_error: null,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(franchise_exchange_accounts.franchise_id, franchiseId),
                eq(franchise_exchange_accounts.exchange, exchange)
              )
            );
        }

        return result;
      }

      return { success: false, message: `Exchange ${exchange} not supported for verification` };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db
        .update(franchise_exchange_accounts)
        .set({
          consecutive_errors: 1,
          last_error: errorMessage,
          last_error_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(franchise_exchange_accounts.franchise_id, franchiseId),
            eq(franchise_exchange_accounts.exchange, exchange)
          )
        );

      return { success: false, message: errorMessage };
    }
  }

  private async testKrakenCredentials(
    credentials: ExchangeCredentials
  ): Promise<{ success: boolean; message: string }> {
    const apiUrl = "https://api.kraken.com";
    const path = "/0/private/Balance";
    const nonce = Date.now() * 1000;

    try {
      const postData = `nonce=${nonce}`;
      const message = `${nonce}${postData}`;
      const secretBuffer = Buffer.from(credentials.apiSecret, 'base64');
      const hash = crypto.createHash('sha256').update(message).digest();
      const hmac = crypto.createHmac('sha512', secretBuffer);
      hmac.update(Buffer.concat([Buffer.from(path), hash]));
      const signature = hmac.digest('base64');

      const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: {
          'API-Key': credentials.apiKey,
          'API-Sign': signature,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: postData,
      });

      const data = await response.json() as { error?: string[]; result?: Record<string, unknown> };

      if (data.error && data.error.length > 0) {
        return { success: false, message: data.error.join(", ") };
      }

      return { success: true, message: "Credentials verified successfully" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Connection failed";
      return { success: false, message: errorMessage };
    }
  }

  async deleteExchangeAccount(
    franchiseId: string,
    exchange: string = "kraken"
  ): Promise<boolean> {
    const result = await db
      .delete(franchise_exchange_accounts)
      .where(
        and(
          eq(franchise_exchange_accounts.franchise_id, franchiseId),
          eq(franchise_exchange_accounts.exchange, exchange)
        )
      )
      .returning();

    return result.length > 0;
  }

  async recordApiUsage(
    franchiseId: string,
    exchange: string = "kraken"
  ): Promise<void> {
    await db
      .update(franchise_exchange_accounts)
      .set({
        last_used_at: new Date(),
        last_request_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(franchise_exchange_accounts.franchise_id, franchiseId),
          eq(franchise_exchange_accounts.exchange, exchange)
        )
      );
  }

  async recordApiError(
    franchiseId: string,
    exchange: string,
    errorMessage: string
  ): Promise<void> {
    const account = await this.getExchangeAccount(franchiseId, exchange);
    if (!account) return;

    const newErrorCount = (account.consecutive_errors || 0) + 1;
    const shouldDeactivate = newErrorCount >= 5;

    await db
      .update(franchise_exchange_accounts)
      .set({
        consecutive_errors: newErrorCount,
        last_error: errorMessage,
        last_error_at: new Date(),
        is_active: shouldDeactivate ? false : account.is_active,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(franchise_exchange_accounts.franchise_id, franchiseId),
          eq(franchise_exchange_accounts.exchange, exchange)
        )
      );

    if (shouldDeactivate) {
      console.warn(`[FranchiseExchange] Account deactivated due to consecutive errors: franchise=${franchiseId}, exchange=${exchange}`);
    }
  }

  async clearApiErrors(
    franchiseId: string,
    exchange: string = "kraken"
  ): Promise<void> {
    await db
      .update(franchise_exchange_accounts)
      .set({
        consecutive_errors: 0,
        last_error: null,
        last_error_at: null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(franchise_exchange_accounts.franchise_id, franchiseId),
          eq(franchise_exchange_accounts.exchange, exchange)
        )
      );
  }
}

export const franchiseExchangeService = new FranchiseExchangeService();
