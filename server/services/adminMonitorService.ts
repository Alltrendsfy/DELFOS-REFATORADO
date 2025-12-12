import { db } from '../db';
import { eq, desc, sql, and, gte, count } from 'drizzle-orm';
import * as schema from '@shared/schema';

interface GlobalMetrics {
  totalUsers: number;
  activeUsers: number;
  totalCampaigns: number;
  activeCampaigns: number;
  paperCampaigns: number;
  realCampaigns: number;
  totalCapitalManaged: number;
  totalEquity: number;
  overallPnL: number;
  overallPnLPercentage: number;
  unreadAlerts: number;
}

interface UserCampaignDetail {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  portfolioId: string;
  portfolioName: string;
  portfolioMode: string;
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  initialCapital: number;
  currentEquity: number;
  pnl: number;
  pnlPercentage: number;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}

interface AlertWithUser {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  details: any;
  isRead: boolean;
  createdAt: Date;
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  campaign?: {
    id: string;
    name: string;
  } | null;
}

class AdminMonitorService {
  async getGlobalMetrics(): Promise<GlobalMetrics> {
    const [userStats] = await db.select({
      totalUsers: count(),
    }).from(schema.users);

    const [activeUserStats] = await db.select({
      activeUsers: count(),
    }).from(schema.users)
    .where(gte(schema.users.updatedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));

    const campaignStats = await db.select({
      status: schema.campaigns.status,
      count: count(),
      totalCapital: sql<string>`COALESCE(SUM(CAST(initial_capital AS DECIMAL)), 0)`,
      totalEquity: sql<string>`COALESCE(SUM(CAST(current_equity AS DECIMAL)), 0)`,
    })
    .from(schema.campaigns)
    .groupBy(schema.campaigns.status);

    const portfolioModeStats = await db.select({
      mode: schema.portfolios.trading_mode,
      count: count(),
    })
    .from(schema.campaigns)
    .innerJoin(schema.portfolios, eq(schema.campaigns.portfolio_id, schema.portfolios.id))
    .where(eq(schema.campaigns.status, 'active'))
    .groupBy(schema.portfolios.trading_mode);

    const [unreadAlertCount] = await db.select({
      count: count(),
    }).from(schema.admin_alerts)
    .where(eq(schema.admin_alerts.is_read, false));

    let totalCampaigns = 0;
    let activeCampaigns = 0;
    let totalCapitalManaged = 0;
    let totalEquity = 0;

    for (const stat of campaignStats) {
      totalCampaigns += Number(stat.count);
      totalCapitalManaged += parseFloat(stat.totalCapital) || 0;
      totalEquity += parseFloat(stat.totalEquity) || 0;
      if (stat.status === 'active') {
        activeCampaigns = Number(stat.count);
      }
    }

    let paperCampaigns = 0;
    let realCampaigns = 0;
    for (const stat of portfolioModeStats) {
      if (stat.mode === 'paper') {
        paperCampaigns = Number(stat.count);
      } else if (stat.mode === 'live') {
        realCampaigns = Number(stat.count);
      }
    }

    const overallPnL = totalEquity - totalCapitalManaged;
    const overallPnLPercentage = totalCapitalManaged > 0 
      ? (overallPnL / totalCapitalManaged) * 100 
      : 0;

    return {
      totalUsers: userStats.totalUsers,
      activeUsers: activeUserStats.activeUsers,
      totalCampaigns,
      activeCampaigns,
      paperCampaigns,
      realCampaigns,
      totalCapitalManaged,
      totalEquity,
      overallPnL,
      overallPnLPercentage,
      unreadAlerts: unreadAlertCount.count,
    };
  }

  async getDetailedCampaigns(filters?: {
    status?: string;
    mode?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<UserCampaignDetail[]> {
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(schema.campaigns.status, filters.status));
    }
    if (filters?.mode) {
      conditions.push(eq(schema.portfolios.trading_mode, filters.mode));
    }
    if (filters?.userId) {
      conditions.push(eq(schema.users.id, filters.userId));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const queryLimit = filters?.limit || 100;
    const queryOffset = filters?.offset || 0;

    const results = await db.select({
      userId: schema.users.id,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      portfolioId: schema.portfolios.id,
      portfolioName: schema.portfolios.name,
      portfolioMode: schema.portfolios.trading_mode,
      campaignId: schema.campaigns.id,
      campaignName: schema.campaigns.name,
      campaignStatus: schema.campaigns.status,
      initialCapital: schema.campaigns.initial_capital,
      currentEquity: schema.campaigns.current_equity,
      startDate: schema.campaigns.start_date,
      endDate: schema.campaigns.end_date,
      createdAt: schema.campaigns.created_at,
    })
    .from(schema.campaigns)
    .innerJoin(schema.portfolios, eq(schema.campaigns.portfolio_id, schema.portfolios.id))
    .innerJoin(schema.users, eq(schema.portfolios.user_id, schema.users.id))
    .where(whereClause)
    .orderBy(desc(schema.campaigns.created_at))
    .limit(queryLimit)
    .offset(queryOffset);

    return results.map(row => {
      const initialCapital = parseFloat(row.initialCapital);
      const currentEquity = parseFloat(row.currentEquity);
      const pnl = currentEquity - initialCapital;
      const pnlPercentage = initialCapital > 0 ? (pnl / initialCapital) * 100 : 0;

      return {
        userId: row.userId,
        email: row.email || '',
        firstName: row.firstName,
        lastName: row.lastName,
        portfolioId: row.portfolioId,
        portfolioName: row.portfolioName,
        portfolioMode: row.portfolioMode,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        campaignStatus: row.campaignStatus,
        initialCapital,
        currentEquity,
        pnl,
        pnlPercentage,
        startDate: row.startDate,
        endDate: row.endDate,
        createdAt: row.createdAt,
      };
    });
  }

  async getAlerts(options?: {
    unreadOnly?: boolean;
    limit?: number;
  }): Promise<AlertWithUser[]> {
    const queryLimit = options?.limit || 50;
    
    let whereClause = options?.unreadOnly 
      ? eq(schema.admin_alerts.is_read, false)
      : undefined;

    const results = await db.select({
      id: schema.admin_alerts.id,
      alertType: schema.admin_alerts.alert_type,
      severity: schema.admin_alerts.severity,
      title: schema.admin_alerts.title,
      message: schema.admin_alerts.message,
      details: schema.admin_alerts.details,
      isRead: schema.admin_alerts.is_read,
      createdAt: schema.admin_alerts.created_at,
      userId: schema.users.id,
      userEmail: schema.users.email,
      userFirstName: schema.users.firstName,
      userLastName: schema.users.lastName,
      campaignId: schema.campaigns.id,
      campaignName: schema.campaigns.name,
    })
    .from(schema.admin_alerts)
    .innerJoin(schema.users, eq(schema.admin_alerts.user_id, schema.users.id))
    .leftJoin(schema.campaigns, eq(schema.admin_alerts.campaign_id, schema.campaigns.id))
    .where(whereClause)
    .orderBy(desc(schema.admin_alerts.created_at))
    .limit(queryLimit);

    return results.map(row => ({
      id: row.id,
      alertType: row.alertType,
      severity: row.severity,
      title: row.title,
      message: row.message,
      details: row.details,
      isRead: row.isRead,
      createdAt: row.createdAt,
      user: {
        id: row.userId,
        email: row.userEmail,
        firstName: row.userFirstName,
        lastName: row.userLastName,
      },
      campaign: row.campaignId ? {
        id: row.campaignId,
        name: row.campaignName || '',
      } : null,
    }));
  }

  async createAlert(data: {
    userId: string;
    alertType: 'user_login' | 'campaign_created_paper' | 'campaign_created_real';
    severity?: 'info' | 'warning' | 'important';
    title: string;
    message: string;
    campaignId?: string;
    portfolioId?: string;
    details?: Record<string, any>;
  }): Promise<schema.AdminAlert> {
    const [alert] = await db.insert(schema.admin_alerts).values({
      user_id: data.userId,
      alert_type: data.alertType,
      severity: data.severity || 'info',
      title: data.title,
      message: data.message,
      campaign_id: data.campaignId || null,
      portfolio_id: data.portfolioId || null,
      details: data.details || null,
      is_read: false,
    }).returning();

    console.log(`[AdminMonitor] Alert created: ${data.alertType} for user ${data.userId}`);
    return alert;
  }

  async markAlertAsRead(alertId: string, adminUserId: string): Promise<void> {
    await db.update(schema.admin_alerts)
      .set({
        is_read: true,
        read_at: new Date(),
        read_by: adminUserId,
      })
      .where(eq(schema.admin_alerts.id, alertId));
  }

  async markAllAlertsAsRead(adminUserId: string): Promise<number> {
    const result = await db.update(schema.admin_alerts)
      .set({
        is_read: true,
        read_at: new Date(),
        read_by: adminUserId,
      })
      .where(eq(schema.admin_alerts.is_read, false))
      .returning();

    return result.length;
  }

  async notifyUserLogin(userId: string, userEmail: string): Promise<void> {
    await this.createAlert({
      userId,
      alertType: 'user_login',
      severity: 'info',
      title: 'Usuário fez login',
      message: `${userEmail} acabou de fazer login na plataforma`,
      details: {
        email: userEmail,
        loginTime: new Date().toISOString(),
      },
    });
  }

  async notifyCampaignCreated(
    userId: string,
    userEmail: string,
    campaignId: string,
    campaignName: string,
    portfolioId: string,
    portfolioMode: 'paper' | 'real',
    initialCapital: number
  ): Promise<void> {
    const alertType = portfolioMode === 'real' 
      ? 'campaign_created_real' 
      : 'campaign_created_paper';
    
    const severity = portfolioMode === 'real' ? 'important' : 'info';
    const modeLabel = portfolioMode === 'real' ? 'REAL' : 'PAPER';

    await this.createAlert({
      userId,
      alertType,
      severity,
      title: `Nova campanha ${modeLabel} criada`,
      message: `${userEmail} criou a campanha "${campaignName}" em modo ${modeLabel} com capital de $${initialCapital.toFixed(2)}`,
      campaignId,
      portfolioId,
      details: {
        email: userEmail,
        campaignName,
        portfolioMode,
        initialCapital,
        createdAt: new Date().toISOString(),
      },
    });
  }
}

export const adminMonitorService = new AdminMonitorService();
