import type { IStorage } from "../../storage";
import type { TaxProfile, InsertTaxProfile, InsertTradeCost } from "@shared/schema";

/**
 * Tax calculation result
 */
export interface TaxCalculation {
  grossPnl: number;
  netPnlBeforeTax: number;
  taxOwed: number;
  netAfterTax: number;
  taxRateApplied: number;
  taxProfileId: string | null;
}

/**
 * Tax regime definitions by country
 */
export const TAX_REGIMES = {
  // Brazil - Day Trading
  BR_DAY_TRADING: {
    countryCode: 'BR',
    regime: 'day_trading',
    shortTermRate: 15.0, // 15% on net daily profit
    longTermRate: 0.0,
    minimumTaxable: 0.0, // No minimum for day trading
    description: 'Brasil - Day Trading (15% sobre lucro líquido diário)',
  },
  // United States - Short-term capital gains
  US_SHORT_TERM: {
    countryCode: 'US',
    regime: 'short_term_gains',
    shortTermRate: 37.0, // Top federal bracket
    longTermRate: 20.0, // Long-term gains
    minimumTaxable: 0.0,
    description: 'United States - Short-term Capital Gains',
  },
  // UAE - Tax-free
  AE_EXEMPT: {
    countryCode: 'AE',
    regime: 'crypto_exempt',
    shortTermRate: 0.0,
    longTermRate: 0.0,
    minimumTaxable: 0.0,
    description: 'UAE - Crypto Tax Exempt',
  },
  // Singapore - Tax-free for individuals
  SG_EXEMPT: {
    countryCode: 'SG',
    regime: 'crypto_exempt',
    shortTermRate: 0.0,
    longTermRate: 0.0,
    minimumTaxable: 0.0,
    description: 'Singapore - Crypto Tax Exempt (Individual)',
  },
  // European Union - General capital gains
  EU_CAPITAL_GAINS: {
    countryCode: 'EU',
    regime: 'capital_gains',
    shortTermRate: 30.0, // Average EU rate
    longTermRate: 30.0,
    minimumTaxable: 0.0,
    description: 'EU - Capital Gains Tax (varies by country)',
  },
} as const;

export class TaxService {
  constructor(private storage: IStorage) {}

  /**
   * Get active tax profile for a user
   */
  async getActiveTaxProfile(userId: string, taxYear?: number): Promise<TaxProfile | null> {
    const year = taxYear || new Date().getFullYear();
    return await this.storage.getActiveTaxProfile(userId, year);
  }

  /**
   * Create or update tax profile for a user
   */
  async upsertTaxProfile(userId: string, profile: Omit<InsertTaxProfile, 'user_id'>): Promise<TaxProfile> {
    // Deactivate existing profiles for this user and tax year
    await this.storage.deactivateTaxProfiles(userId, profile.tax_year);
    
    // Create new active profile
    const newProfile: InsertTaxProfile = {
      user_id: userId,
      ...profile,
      is_active: true,
    };
    
    return await this.storage.createTaxProfile(newProfile);
  }

  /**
   * Calculate tax for a single trade based on user's active tax profile.
   * 
   * IMPORTANT TAX REGIME HANDLING:
   * - Brazil (BR): NO per-trade tax. Tax calculated daily in getPortfolioTaxSummary().
   *   Returns taxOwed=0 but stores costs for later daily aggregation.
   * - US/EU: Per-trade tax using short-term rate (holding period tracking pending).
   * - AE/SG: Tax-exempt, always returns taxOwed=0.
   * - No profile: Falls back to zero tax.
   */
  async calculateTax(
    userId: string,
    grossPnl: number,
    totalCosts: number,
    taxYear?: number
  ): Promise<TaxCalculation> {
    const profile = await this.getActiveTaxProfile(userId, taxYear);
    
    // No profile = use default zero-tax fallback
    if (!profile) {
      console.warn(`[TAX] No active tax profile for user ${userId}. Defaulting to 0% tax.`);
      return {
        grossPnl,
        netPnlBeforeTax: grossPnl - totalCosts,
        taxOwed: 0,
        netAfterTax: grossPnl - totalCosts,
        taxRateApplied: 0,
        taxProfileId: null,
      };
    }

    const netPnlBeforeTax = grossPnl - totalCosts;
    const countryCode = profile.country_code;
    let taxOwed = 0;
    let taxRate = 0;

    // Apply country-specific tax logic
    if (netPnlBeforeTax > 0) {
      const minimumTaxable = parseFloat(profile.minimum_taxable_amount);
      
      if (netPnlBeforeTax >= minimumTaxable) {
        switch (countryCode) {
          case 'BR':
            // Brazil: Tax calculated DAILY in getPortfolioTaxSummary()
            // Do NOT tax per-trade to avoid double taxation
            // Store gross costs only; tax applied later on daily net profit
            taxRate = 0; // Will be applied at daily aggregation
            taxOwed = 0; // No per-trade tax for Brazil
            console.log(`[TAX] Brazil regime: Deferring tax calculation to daily aggregation`);
            break;
            
          case 'US':
            // US: Short-term (<=1 year) or long-term (>1 year) capital gains
            // Per-trade uses short-term rate; holding period tracking needed for accuracy
            taxRate = parseFloat(profile.short_term_rate_pct);
            taxOwed = (netPnlBeforeTax * taxRate) / 100;
            break;
            
          case 'EU':
            // EU: Capital gains (rates vary by country, using configured rate)
            taxRate = parseFloat(profile.short_term_rate_pct);
            taxOwed = (netPnlBeforeTax * taxRate) / 100;
            break;
            
          case 'AE':
          case 'SG':
            // UAE & Singapore: Tax-exempt for crypto trading
            taxRate = 0;
            taxOwed = 0;
            break;
            
          default:
            // Unknown country: Use configured short-term rate as fallback
            console.warn(`[TAX] Unknown country code: ${countryCode}. Using short-term rate.`);
            taxRate = parseFloat(profile.short_term_rate_pct);
            taxOwed = (netPnlBeforeTax * taxRate) / 100;
        }
      }
    } else {
      // Losses: No tax owed
      taxRate = 0;
      taxOwed = 0;
    }

    const netAfterTax = netPnlBeforeTax - taxOwed;

    return {
      grossPnl,
      netPnlBeforeTax,
      taxOwed,
      netAfterTax,
      taxRateApplied: taxRate,
      taxProfileId: profile.id,
    };
  }

  /**
   * Record trade costs and tax calculation
   */
  async recordTradeCost(tradeCost: InsertTradeCost): Promise<void> {
    await this.storage.createTradeCost(tradeCost);
  }

  /**
   * Get all trade costs for a portfolio (for tax reports)
   */
  async getPortfolioTradeCosts(portfolioId: string, startDate?: Date, endDate?: Date) {
    return await this.storage.getTradeCostsByPortfolio(portfolioId, startDate, endDate);
  }

  /**
   * Get tax summary for a portfolio (aggregated with daily netting for Brazil)
   */
  async getPortfolioTaxSummary(portfolioId: string, taxYear: number) {
    const startDate = new Date(taxYear, 0, 1); // Jan 1
    const endDate = new Date(taxYear, 11, 31, 23, 59, 59); // Dec 31
    
    const costs = await this.getPortfolioTradeCosts(portfolioId, startDate, endDate);
    
    // Get portfolio to determine user and tax profile
    const portfolio = await this.storage.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error("Portfolio not found");
    }
    
    const taxProfile = await this.getActiveTaxProfile(portfolio.user_id, taxYear);
    
    let totalGrossPnl = 0;
    let totalNetPnl = 0;
    let totalTaxOwed = 0;
    let totalNetAfterTax = 0;
    let totalFees = 0;
    let totalSlippage = 0;
    let totalCosts = 0;
    let tradesCount = costs.length;
    let profitableTrades = 0;

    // Brazil-specific: Group by day for daily netting
    if (taxProfile && taxProfile.country_code === 'BR') {
      const dailyNetPnl = new Map<string, number>();
      const dailyCosts = new Map<string, number>();
      
      for (const cost of costs) {
        // Group by date (YYYY-MM-DD)
        const tradeDate = cost.created_at.toISOString().split('T')[0];
        
        const grossPnl = parseFloat(cost.gross_pnl_usd);
        const fees = parseFloat(cost.total_fees_usd);
        const slippage = parseFloat(cost.total_slippage_usd);
        const totalCost = fees + slippage;
        
        dailyNetPnl.set(tradeDate, (dailyNetPnl.get(tradeDate) || 0) + grossPnl);
        dailyCosts.set(tradeDate, (dailyCosts.get(tradeDate) || 0) + totalCost);
        
        totalGrossPnl += grossPnl;
        totalFees += fees;
        totalSlippage += slippage;
        totalCosts += totalCost;
      }
      
      // Calculate tax on daily net profit (Brazil rule: 15% on positive daily net)
      const taxRate = parseFloat(taxProfile.short_term_rate_pct) / 100;
      
      for (const [date, dailyGrossPnl] of dailyNetPnl.entries()) {
        const dailyCost = dailyCosts.get(date) || 0;
        const dailyNet = dailyGrossPnl - dailyCost;
        
        if (dailyNet > 0) {
          const dailyTax = dailyNet * taxRate;
          totalTaxOwed += dailyTax;
          profitableTrades++;
        }
        
        totalNetPnl += dailyNet;
        totalNetAfterTax += (dailyNet - (dailyNet > 0 ? dailyNet * taxRate : 0));
      }
    } else {
      // Non-Brazil: Simple aggregation (per-trade tax already calculated)
      for (const cost of costs) {
        const grossPnl = parseFloat(cost.gross_pnl_usd);
        const netPnl = parseFloat(cost.net_pnl_usd);
        const taxOwed = parseFloat(cost.tax_owed_usd);
        const netAfterTax = parseFloat(cost.net_after_tax_usd);
        const fees = parseFloat(cost.total_fees_usd);
        const slippage = parseFloat(cost.total_slippage_usd);
        const totalCost = parseFloat(cost.total_cost_usd);

        totalGrossPnl += grossPnl;
        totalNetPnl += netPnl;
        totalTaxOwed += taxOwed;
        totalNetAfterTax += netAfterTax;
        totalFees += fees;
        totalSlippage += slippage;
        totalCosts += totalCost;
        
        if (netAfterTax > 0) profitableTrades++;
      }
    }

    return {
      taxYear,
      tradesCount,
      profitableTrades,
      totalGrossPnl,
      totalNetPnl,
      totalTaxOwed,
      totalNetAfterTax,
      totalFees,
      totalSlippage,
      totalCosts,
      effectiveTaxRate: totalNetPnl > 0 ? (totalTaxOwed / totalNetPnl) * 100 : 0,
      countryCode: taxProfile?.country_code || 'N/A',
      regime: taxProfile?.tax_regime || 'N/A',
    };
  }
}
