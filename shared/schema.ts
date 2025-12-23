import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (REQUIRED for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table - stores user authentication and profile data (REQUIRED for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  preferred_language: text("preferred_language").default("en").notNull(), // en, es, pt-BR
  whatsapp_number: text("whatsapp_number"),
  notifications_enabled: boolean("notifications_enabled").default(true).notNull(),
  kraken_api_key: text("kraken_api_key"), // Encrypted Kraken API key for trading
  kraken_api_secret: text("kraken_api_secret"), // Encrypted Kraken API secret for trading
  is_beta_approved: boolean("is_beta_approved").default(false).notNull(), // Beta access control
  is_admin: boolean("is_admin").default(false).notNull(), // Admin role for platform management
  beta_code_used: varchar("beta_code_used"), // The invite code used by this user
  // Global role: franchisor (platform owner), franchise_owner, franchisee, user
  global_role: varchar("global_role", { length: 20 }).default("user").notNull(),
  
  // ========== GOVERNANCE FIELDS (Super Aggressive / Full Profiles) ==========
  // Performance Risk Score (0-100) - updated by system based on trading performance
  prs_score: decimal("prs_score", { precision: 5, scale: 2 }).default("50.00").notNull(),
  // Number of antifraud flags in last 90 days
  antifraud_flags_count: integer("antifraud_flags_count").default(0).notNull(),
  // Strong audit mode enabled (required for Super Aggressive/Full profiles)
  strong_audit_enabled: boolean("strong_audit_enabled").default(false).notNull(),
  // Legal acceptance for high-risk profiles
  high_risk_accepted_at: timestamp("high_risk_accepted_at"),
  high_risk_acceptance_version: varchar("high_risk_acceptance_version", { length: 20 }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Beta invite codes table - manages access codes for beta testers
export const betaCodes = pgTable("beta_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(), // The invite code (e.g., DELFOS-BETA-ABC123)
  max_uses: integer("max_uses").default(1).notNull(), // How many times this code can be used
  current_uses: integer("current_uses").default(0).notNull(), // How many times it has been used
  is_active: boolean("is_active").default(true).notNull(), // Can be deactivated by admin
  expires_at: timestamp("expires_at"), // Optional expiration date
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertBetaCodeSchema = createInsertSchema(betaCodes).omit({
  id: true,
  current_uses: true,
  created_at: true,
});
export type InsertBetaCode = z.infer<typeof insertBetaCodeSchema>;
export type BetaCode = typeof betaCodes.$inferSelect;

// Authorized emails table - whitelist of pre-approved beta tester emails
export const authorizedEmails = pgTable("authorized_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  added_by: varchar("added_by").references(() => users.id), // Admin who added this email
  notes: text("notes"), // Optional notes about this beta tester
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuthorizedEmailSchema = createInsertSchema(authorizedEmails).omit({
  id: true,
  created_at: true,
});
export type InsertAuthorizedEmail = z.infer<typeof insertAuthorizedEmailSchema>;
export type AuthorizedEmail = typeof authorizedEmails.$inferSelect;

// API Tokens table - for external agent authentication
export const apiTokens = pgTable("api_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token_hash: varchar("token_hash", { length: 128 }).notNull().unique(), // SHA-256 hash of the token
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(), // Descriptive name (e.g., "CRYPTOTRADER INSIDER")
  permissions: text("permissions").array().default([]).notNull(), // Array of permissions: ['read', 'trade', 'admin']
  is_active: boolean("is_active").default(true).notNull(),
  last_used_at: timestamp("last_used_at"),
  expires_at: timestamp("expires_at"), // Optional expiration
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: varchar("created_by").references(() => users.id), // Admin who created this token
});

export const insertApiTokenSchema = createInsertSchema(apiTokens).omit({
  id: true,
  last_used_at: true,
  created_at: true,
});
export type InsertApiToken = z.infer<typeof insertApiTokenSchema>;
export type ApiToken = typeof apiTokens.$inferSelect;

// Portfolios table - stores crypto portfolio data
// V2.0+: franchise_id added for tenant isolation - each franchise has separate portfolios
export const portfolios = pgTable("portfolios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  franchise_id: varchar("franchise_id"), // V2.0+: Links portfolio to specific franchise for tenant isolation
  name: text("name").notNull(),
  trading_mode: text("trading_mode").default("paper").notNull(), // 'paper' or 'live'
  total_value_usd: decimal("total_value_usd", { precision: 20, scale: 2 }).default("0").notNull(),
  // V2.0+ Governance: Available cash not allocated to any campaign (updated when campaigns start/end)
  available_cash: decimal("available_cash", { precision: 20, scale: 2 }).default("0").notNull(),
  daily_pnl: decimal("daily_pnl", { precision: 20, scale: 2 }).default("0").notNull(),
  daily_pnl_percentage: decimal("daily_pnl_percentage", { precision: 10, scale: 4 }).default("0").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_portfolios_franchise").on(table.franchise_id),
]);

// Positions table - stores active trading positions
// V2.0+: franchise_id added for tenant isolation
export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  franchise_id: varchar("franchise_id"), // V2.0+: Direct link for efficient querying and isolation
  symbol: text("symbol").notNull(), // e.g., BTC/USD, ETH/USD
  side: text("side").notNull(), // long or short
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  entry_price: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  current_price: decimal("current_price", { precision: 20, scale: 8 }).notNull(),
  unrealized_pnl: decimal("unrealized_pnl", { precision: 20, scale: 2 }).default("0").notNull(),
  unrealized_pnl_percentage: decimal("unrealized_pnl_percentage", { precision: 10, scale: 4 }).default("0").notNull(),
  stop_loss: decimal("stop_loss", { precision: 20, scale: 8 }),
  take_profit: decimal("take_profit", { precision: 20, scale: 8 }),
  opened_at: timestamp("opened_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_positions_franchise").on(table.franchise_id),
]);

// Trades table - stores completed trades history
// V2.0+: franchise_id added for tenant isolation
export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  franchise_id: varchar("franchise_id"), // V2.0+: Direct link for efficient querying and isolation
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // long or short
  entry_price: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  exit_price: decimal("exit_price", { precision: 20, scale: 8 }).notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  realized_pnl: decimal("realized_pnl", { precision: 20, scale: 2 }).notNull(),
  realized_pnl_percentage: decimal("realized_pnl_percentage", { precision: 10, scale: 4 }).notNull(),
  fees: decimal("fees", { precision: 20, scale: 8 }).default("0").notNull(),
  opened_at: timestamp("opened_at").notNull(),
  closed_at: timestamp("closed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_trades_franchise").on(table.franchise_id),
]);

// Alerts table - stores price alerts and notifications
export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  symbol: text("symbol").notNull(),
  condition: text("condition").notNull(), // above, below
  target_price: decimal("target_price", { precision: 20, scale: 8 }).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  triggered_at: timestamp("triggered_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Risk parameters table - stores risk management settings
export const risk_parameters = pgTable("risk_parameters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }).unique(),
  max_position_size_percentage: decimal("max_position_size_percentage", { precision: 5, scale: 2 }).default("10").notNull(),
  max_daily_loss_percentage: decimal("max_daily_loss_percentage", { precision: 5, scale: 2 }).default("5").notNull(),
  max_portfolio_heat_percentage: decimal("max_portfolio_heat_percentage", { precision: 5, scale: 2 }).default("20").notNull(),
  circuit_breaker_enabled: boolean("circuit_breaker_enabled").default(true).notNull(),
  circuit_breaker_triggered: boolean("circuit_breaker_triggered").default(false).notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_risk_params_portfolio").on(table.portfolio_id),
]);

// Asset-level circuit breakers - blocks individual assets after repeated losses
export const asset_breakers = pgTable("asset_breakers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  symbol: text("symbol").notNull(), // e.g., BTC/USD
  is_triggered: boolean("is_triggered").default(false).notNull(),
  trigger_reason: text("trigger_reason"),
  consecutive_losses: integer("consecutive_losses").default(0).notNull(),
  total_loss_amount: decimal("total_loss_amount", { precision: 20, scale: 2 }).default("0").notNull(),
  // Thresholds - stored to reconstruct trigger conditions
  max_consecutive_losses: integer("max_consecutive_losses").default(3).notNull(),
  max_total_loss_usd: decimal("max_total_loss_usd", { precision: 20, scale: 2 }).default("500").notNull(),
  triggered_at: timestamp("triggered_at"),
  auto_reset_at: timestamp("auto_reset_at"),
  auto_reset_hours: integer("auto_reset_hours").default(24).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_asset_breakers_portfolio").on(table.portfolio_id),
  index("idx_asset_breakers_symbol").on(table.symbol),
  index("idx_asset_breakers_triggered").on(table.is_triggered),
  index("idx_asset_breakers_auto_reset").on(table.auto_reset_at),
]);

// Cluster-level circuit breakers - blocks entire K-means clusters under stress
export const cluster_breakers = pgTable("cluster_breakers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  cluster_number: integer("cluster_number").notNull(),
  is_triggered: boolean("is_triggered").default(false).notNull(),
  trigger_reason: text("trigger_reason"),
  aggregate_loss_percentage: decimal("aggregate_loss_percentage", { precision: 10, scale: 4 }).default("0").notNull(),
  affected_assets_count: integer("affected_assets_count").default(0).notNull(),
  // Thresholds
  max_aggregate_loss_percentage: decimal("max_aggregate_loss_percentage", { precision: 10, scale: 4 }).default("15").notNull(),
  triggered_at: timestamp("triggered_at"),
  auto_reset_at: timestamp("auto_reset_at"),
  auto_reset_hours: integer("auto_reset_hours").default(12).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_cluster_breakers_portfolio").on(table.portfolio_id),
  index("idx_cluster_breakers_cluster").on(table.cluster_number),
  index("idx_cluster_breakers_triggered").on(table.is_triggered),
  index("idx_cluster_breakers_auto_reset").on(table.auto_reset_at),
]);

// Circuit breaker events log - comprehensive audit trail for all breaker activities
export const circuit_breaker_events = pgTable("circuit_breaker_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  breaker_level: text("breaker_level").notNull(), // "asset", "cluster", "global"
  breaker_id: varchar("breaker_id"), // Reference to asset_breaker, cluster_breaker, or risk_parameters
  event_type: text("event_type").notNull(), // "triggered", "reset", "auto_reset"
  symbol: text("symbol"), // For asset-level events
  cluster_number: integer("cluster_number"), // For cluster-level events
  reason: text("reason").notNull(),
  metadata: jsonb("metadata"), // Additional context (losses, thresholds, etc.)
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_cb_events_portfolio").on(table.portfolio_id),
  index("idx_cb_events_level").on(table.breaker_level),
  index("idx_cb_events_created").on(table.created_at),
]);

// Market data cache table - stores recent price data for offline access
export const market_data_cache = pgTable("market_data_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull().unique(),
  current_price: decimal("current_price", { precision: 20, scale: 8 }).notNull(),
  volume_24h: decimal("volume_24h", { precision: 20, scale: 2 }).notNull(),
  change_24h_percentage: decimal("change_24h_percentage", { precision: 10, scale: 4 }).notNull(),
  high_24h: decimal("high_24h", { precision: 20, scale: 8 }).notNull(),
  low_24h: decimal("low_24h", { precision: 20, scale: 8 }).notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_market_data_symbol").on(table.symbol),
  index("idx_market_data_updated").on(table.updated_at),
]);

// News feed table - stores crypto news from Twitter/X
export const news_feed = pgTable("news_feed", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tweet_id: text("tweet_id").notNull().unique(),
  author: text("author").notNull(),
  author_username: text("author_username").notNull(),
  content: text("content").notNull(),
  url: text("url").notNull(),
  created_at: timestamp("created_at").notNull(),
  fetched_at: timestamp("fetched_at").defaultNow().notNull(),
}, (table) => [
  index("idx_news_created").on(table.created_at),
  index("idx_news_fetched").on(table.fetched_at),
]);

// AI conversations table - stores chat history and audit trail
export const ai_conversations = pgTable("ai_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  user_message: text("user_message").notNull(),
  ai_response: text("ai_response").notNull(),
  model_used: text("model_used").notNull(), // gpt-4o-mini, gpt-4o
  tokens_used: integer("tokens_used").notNull(),
  market_symbols: text("market_symbols").array(), // Symbols included in context
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_conv_user").on(table.user_id),
  index("idx_ai_conv_created").on(table.created_at),
]);

// Performance snapshots table - tracks portfolio equity over time for drawdown calculation
export const performance_snapshots = pgTable("performance_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  equity_usd: decimal("equity_usd", { precision: 20, scale: 2 }).notNull(),
  realized_pnl: decimal("realized_pnl", { precision: 20, scale: 2 }).notNull(),
  unrealized_pnl: decimal("unrealized_pnl", { precision: 20, scale: 2 }).notNull(),
  cumulative_fees: decimal("cumulative_fees", { precision: 20, scale: 8 }).notNull(),
  snapshot_at: timestamp("snapshot_at").defaultNow().notNull(),
}, (table) => [
  index("idx_perf_snap_portfolio").on(table.portfolio_id),
  index("idx_perf_snap_time").on(table.snapshot_at),
]);

// Orders table - stores all orders (pending, filled, cancelled)
// V2.0+: franchise_id added for tenant isolation
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  franchise_id: varchar("franchise_id"), // V2.0+: Direct link for efficient querying and isolation
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // buy or sell
  type: text("type").notNull(), // market, limit, stop, stop_limit
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 20, scale: 8 }),
  stop_price: decimal("stop_price", { precision: 20, scale: 8 }),
  status: text("status").notNull(), // pending, filled, partially_filled, cancelled, rejected
  filled_quantity: decimal("filled_quantity", { precision: 20, scale: 8 }).default("0").notNull(),
  average_fill_price: decimal("average_fill_price", { precision: 20, scale: 8 }),
  exchange_order_id: text("exchange_order_id"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  filled_at: timestamp("filled_at"),
}, (table) => [
  index("idx_orders_portfolio").on(table.portfolio_id),
  index("idx_orders_franchise").on(table.franchise_id),
  index("idx_orders_symbol").on(table.symbol),
  index("idx_orders_status").on(table.status),
  index("idx_orders_created").on(table.created_at),
]);

// ========== TIME-SERIES MARKET DATA TABLES ==========
// Note: High-frequency data (ticks, L1, L2, bars_1s) are stored in Redis for performance.
// PostgreSQL stores only aggregated data and metadata to stay within Neon's write limits.

// Bars 1m table - stores 1-minute OHLCV candles (manageable: ~100 inserts/min)
export const bars_1m = pgTable("bars_1m", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exchange: text("exchange").notNull(),
  symbol: text("symbol").notNull(),
  open: decimal("open", { precision: 20, scale: 8 }).notNull(),
  high: decimal("high", { precision: 20, scale: 8 }).notNull(),
  low: decimal("low", { precision: 20, scale: 8 }).notNull(),
  close: decimal("close", { precision: 20, scale: 8 }).notNull(),
  volume: decimal("volume", { precision: 20, scale: 8 }).notNull(),
  trades_count: integer("trades_count").default(0).notNull(),
  vwap: decimal("vwap", { precision: 20, scale: 8 }), // Volume-weighted average price
  bar_ts: timestamp("bar_ts").notNull(), // Start of the 1m interval
  processing_ts: timestamp("processing_ts").defaultNow().notNull(),
}, (table) => [
  index("idx_bars_1m_exchange_symbol_time").on(table.exchange, table.symbol, table.bar_ts),
  index("idx_bars_1m_symbol_time").on(table.symbol, table.bar_ts),
]);

// Bars 1h table - stores 1-hour OHLCV candles (long-term analysis)
export const bars_1h = pgTable("bars_1h", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exchange: text("exchange").notNull(),
  symbol: text("symbol").notNull(),
  open: decimal("open", { precision: 20, scale: 8 }).notNull(),
  high: decimal("high", { precision: 20, scale: 8 }).notNull(),
  low: decimal("low", { precision: 20, scale: 8 }).notNull(),
  close: decimal("close", { precision: 20, scale: 8 }).notNull(),
  volume: decimal("volume", { precision: 20, scale: 8 }).notNull(),
  trades_count: integer("trades_count").default(0).notNull(),
  vwap: decimal("vwap", { precision: 20, scale: 8 }),
  bar_ts: timestamp("bar_ts").notNull(), // Start of the 1h interval
  processing_ts: timestamp("processing_ts").defaultNow().notNull(),
}, (table) => [
  index("idx_bars_1h_exchange_symbol_time").on(table.exchange, table.symbol, table.bar_ts),
  index("idx_bars_1h_symbol_time").on(table.symbol, table.bar_ts),
]);

// ========== OBSERVABILITY AND AUDIT TABLES ==========

// Decision log table - stores trading decisions with reasoning
export const decision_log = pgTable("decision_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").references(() => portfolios.id, { onDelete: 'cascade' }),
  symbol: text("symbol").notNull(),
  decision_type: text("decision_type").notNull(), // entry, exit, hold, skip
  signal_strength: decimal("signal_strength", { precision: 5, scale: 2 }),
  reasoning: jsonb("reasoning"), // JSON with signal details, indicators, etc.
  parameters: jsonb("parameters"), // Trading parameters at decision time
  outcome: text("outcome"), // success, failure, pending
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_decision_log_portfolio").on(table.portfolio_id),
  index("idx_decision_log_symbol").on(table.symbol),
  index("idx_decision_log_created").on(table.created_at),
]);

// Staleness log table - tracks data freshness issues
export const staleness_log = pgTable("staleness_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exchange: text("exchange").notNull(),
  symbol: text("symbol"),
  feed_type: text("feed_type").notNull(), // ws_tick, ws_l1, ws_l2, rest
  staleness_seconds: integer("staleness_seconds").notNull(),
  severity: text("severity").notNull(), // warn, hard, kill_switch
  action_taken: text("action_taken"), // blocked_entries, zeroed_signals, paused_global
  detected_at: timestamp("detected_at").defaultNow().notNull(),
}, (table) => [
  index("idx_staleness_exchange").on(table.exchange),
  index("idx_staleness_detected").on(table.detected_at),
]);

// Slippage estimates table - tracks slippage by symbol
export const slippage_estimates = pgTable("slippage_estimates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  avg_slippage_bps: decimal("avg_slippage_bps", { precision: 10, scale: 4 }).notNull(),
  max_slippage_bps: decimal("max_slippage_bps", { precision: 10, scale: 4 }).notNull(),
  sample_size: integer("sample_size").notNull(),
  time_window_hours: integer("time_window_hours").default(24).notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_slippage_symbol").on(table.symbol),
]);

// Audit trail table - immutable log of all critical actions
export const audit_trail = pgTable("audit_trail", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").references(() => users.id),
  action_type: text("action_type").notNull(), // order_created, position_opened, risk_breaker_triggered, etc.
  entity_type: text("entity_type").notNull(), // order, position, portfolio, risk_param
  entity_id: varchar("entity_id"),
  details: jsonb("details"), // Full snapshot of the action
  ip_address: text("ip_address"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_audit_user").on(table.user_id),
  index("idx_audit_action").on(table.action_type),
  index("idx_audit_created").on(table.created_at),
]);

// Risk Profile Configuration - stores predefined risk profiles (C, M, A, SA, F)
// C = Conservative, M = Moderate, A = Aggressive, SA = Super Aggressive, F = Full Custom
export const risk_profile_config = pgTable("risk_profile_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profile_code: varchar("profile_code", { length: 2 }).notNull().unique(), // C, M, A, SA, F
  profile_name: varchar("profile_name", { length: 50 }).notNull(), // Conservador, Moderado, Agressivo, Super Agressivo, Full
  
  // ========== GOVERNANCE REQUIREMENTS (for SA and F profiles) ==========
  // Minimum plan required: starter, pro, enterprise, full
  min_plan_code: varchar("min_plan_code", { length: 20 }),
  // Minimum days in the DELFOS system
  min_days_in_system: integer("min_days_in_system").default(0).notNull(),
  // Minimum PRS score (0-100)
  min_prs_score: decimal("min_prs_score", { precision: 5, scale: 2 }).default("0").notNull(),
  // Requires zero antifraud flags (last 90 days)
  requires_no_antifraud_flags: boolean("requires_no_antifraud_flags").default(false).notNull(),
  // Requires strong audit mode enabled
  requires_strong_audit: boolean("requires_strong_audit").default(false).notNull(),
  // Requires double confirmation at creation
  requires_double_confirm: boolean("requires_double_confirm").default(false).notNull(),
  // Requires explicit legal acceptance
  requires_legal_acceptance: boolean("requires_legal_acceptance").default(false).notNull(),
  // Is customizable (only FULL profile)
  is_customizable: boolean("is_customizable").default(false).notNull(),
  // Baseline profile for customizable profiles (null or profile_code like "SA")
  baseline_profile_code: varchar("baseline_profile_code", { length: 2 }),
  
  // ========== CLUSTER RESTRICTIONS ==========
  // Blocked clusters (cannot trade in these)
  blocked_clusters: integer("blocked_clusters").array(),
  // Priority clusters (prefer these for allocation)
  priority_clusters: integer("priority_clusters").array(),
  
  // ========== LEVERAGE CONTROL ==========
  leverage_allowed: boolean("leverage_allowed").default(false).notNull(),
  max_leverage: decimal("max_leverage", { precision: 5, scale: 2 }).default("1.00").notNull(),
  
  // ========== AUDIT FREQUENCY ==========
  min_audit_frequency_hours: integer("min_audit_frequency_hours").default(24).notNull(),
  
  // Risk per trade
  risk_per_trade_pct: decimal("risk_per_trade_pct", { precision: 5, scale: 2 }).notNull(), // 0.20, 0.50, 1.00
  max_loss_per_pair_r: integer("max_loss_per_pair_r").notNull(), // 2R, 3R, 4R
  
  // Daily limits
  max_daily_loss_pct: decimal("max_daily_loss_pct", { precision: 5, scale: 2 }).notNull(), // 2.0, 4.0, 7.0
  max_drawdown_30d_pct: decimal("max_drawdown_30d_pct", { precision: 5, scale: 2 }).notNull(), // 8.0, 12.0, 20.0
  
  // Trailing drawdown
  use_trailing_dd: boolean("use_trailing_dd").default(true).notNull(),
  trailing_dd_pct_on_profit: decimal("trailing_dd_pct_on_profit", { precision: 5, scale: 2 }).notNull(), // 20.0, 25.0, 30.0
  
  // Position limits
  max_open_positions: integer("max_open_positions").notNull(), // 5, 10, 20
  max_trades_per_day: integer("max_trades_per_day").notNull(), // 15, 30, 60
  cooldown_minutes_after_cb: integer("cooldown_minutes_after_cb").notNull(), // 60, 30, 15
  
  // Position management
  allow_add_position: boolean("allow_add_position").default(false).notNull(),
  max_adds_per_trade: integer("max_adds_per_trade").default(0).notNull(), // 0, 1, 2
  
  // Circuit breakers
  cb_pair_enabled: boolean("cb_pair_enabled").default(true).notNull(),
  cb_pair_loss_threshold_r: integer("cb_pair_loss_threshold_r").notNull(), // 2R, 3R, 4R
  cb_daily_enabled: boolean("cb_daily_enabled").default(true).notNull(),
  cb_daily_loss_threshold_pct: decimal("cb_daily_loss_threshold_pct", { precision: 5, scale: 2 }).notNull(),
  cb_campaign_enabled: boolean("cb_campaign_enabled").default(true).notNull(),
  cb_campaign_dd_threshold_pct: decimal("cb_campaign_dd_threshold_pct", { precision: 5, scale: 2 }).notNull(),
  // VaR/ES circuit breaker (V2.0+ Governance)
  cb_var_es_enabled: boolean("cb_var_es_enabled").default(true).notNull(),
  cb_var_threshold_pct: decimal("cb_var_threshold_pct", { precision: 5, scale: 2 }).default("15.00").notNull(), // Max VaR 95% threshold
  cb_es_threshold_pct: decimal("cb_es_threshold_pct", { precision: 5, scale: 2 }).default("20.00").notNull(), // Max ES 95% threshold
  lock_day_after_cb_daily: boolean("lock_day_after_cb_daily").default(true).notNull(),
  lock_campaign_after_cb_campaign: boolean("lock_campaign_after_cb_campaign").default(true).notNull(),
  
  // ATR sizing
  use_atr_sizing: boolean("use_atr_sizing").default(true).notNull(),
  atr_lookback_period: integer("atr_lookback_period").default(14).notNull(),
  target_atr_pct_reference: decimal("target_atr_pct_reference", { precision: 5, scale: 2 }).notNull(), // 1.5, 2.5, 5.0
  min_atr_pct_tradable: decimal("min_atr_pct_tradable", { precision: 5, scale: 2 }).notNull(), // 0.5, 1.0, 2.0
  max_atr_pct_tradable: decimal("max_atr_pct_tradable", { precision: 5, scale: 2 }).notNull(), // 3.0, 5.0, 8.0
  max_position_pct_capital_per_pair: decimal("max_position_pct_capital_per_pair", { precision: 5, scale: 2 }).notNull(), // 5.0, 10.0, 15.0
  
  // Selection filters (differentiated by profile)
  min_volume_24h_usd: decimal("min_volume_24h_usd", { precision: 20, scale: 2 }).notNull(), // 150M, 80M, 50M
  max_spread_pct: decimal("max_spread_pct", { precision: 5, scale: 4 }).notNull(), // 0.05, 0.08, 0.15
  min_depth_usd: decimal("min_depth_usd", { precision: 20, scale: 2 }).notNull(), // 1M, 500k, 300k
  
  // Take Profit multipliers (ATR-based)
  tp_atr_multiplier: decimal("tp_atr_multiplier", { precision: 5, scale: 2 }).notNull(), // 1.5, 2.0, 3.0
  sl_atr_multiplier: decimal("sl_atr_multiplier", { precision: 5, scale: 2 }).default("1.0").notNull(),
  
  // Max slippage allowed
  max_slippage_pct: decimal("max_slippage_pct", { precision: 5, scale: 4 }).notNull(), // 0.05, 0.10, 0.20
  
  // Max risk per cluster
  max_cluster_risk_pct: decimal("max_cluster_risk_pct", { precision: 5, scale: 2 }).notNull(), // 6.0, 10.0, 15.0
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Campaigns table - stores 30-day trading campaigns
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  investor_profile: varchar("investor_profile", { length: 2 }).default("M").notNull(), // C, M, A, SA, F
  start_date: timestamp("start_date").notNull(),
  end_date: timestamp("end_date").notNull(),
  initial_capital: decimal("initial_capital", { precision: 20, scale: 2 }).notNull(),
  current_equity: decimal("current_equity", { precision: 20, scale: 2 }).notNull(),
  max_drawdown_percentage: decimal("max_drawdown_percentage", { precision: 5, scale: 2 }).default("-10").notNull(),
  status: text("status").notNull(), // active, paused, completed, stopped
  risk_config: jsonb("risk_config"), // Snapshot of risk parameters from risk_profile_config
  selection_config: jsonb("selection_config"), // Asset selection criteria
  created_at: timestamp("created_at").defaultNow().notNull(),
  completed_at: timestamp("completed_at"),
  
  // ========== GOVERNANCE FIELDS (Super Aggressive / Full) ==========
  // Double confirmation required for high-risk profiles
  double_confirmed: boolean("double_confirmed").default(false).notNull(),
  double_confirmed_at: timestamp("double_confirmed_at"),
  // Legal acceptance for high-risk profiles
  legal_acceptance_hash: varchar("legal_acceptance_hash", { length: 64 }),
  legal_accepted_at: timestamp("legal_accepted_at"),
  legal_acceptance_version: varchar("legal_acceptance_version", { length: 20 }),
  // Reference to custom profile (only for F = Full profile)
  custom_profile_id: varchar("custom_profile_id"),
  // Parameters locked after campaign start (for FULL profiles)
  parameters_locked_at: timestamp("parameters_locked_at"),
  
  // ========== IMMUTABLE GOVERNANCE V2.0+ ==========
  // Immutable hash created at campaign creation - prevents tampering
  creation_hash: varchar("creation_hash", { length: 64 }), // SHA-256 of initial params
  // Lock flag - once true, campaign parameters CANNOT be modified
  is_locked: boolean("is_locked").default(false).notNull(),
  locked_at: timestamp("locked_at"),
  locked_by: varchar("locked_by"), // system or user_id who locked
  // Hash of all immutable parameters at lock time (verification)
  lock_hash: varchar("lock_hash", { length: 64 }), // SHA-256 for integrity verification
  // Last reconciliation with exchange
  last_reconciled_at: timestamp("last_reconciled_at"),
  reconciliation_status: varchar("reconciliation_status", { length: 20 }), // ok, mismatch, pending
  reconciliation_hash: varchar("reconciliation_hash", { length: 64 }), // Hash of last reconciliation
  
  // ========== ANTIFRAUDE FIELDS (Franchise System) ==========
  // Soft delete flag (campaigns cannot be hard deleted)
  is_deleted: boolean("is_deleted").default(false).notNull(),
  deleted_at: timestamp("deleted_at"),
  deleted_reason: text("deleted_reason"),
  // Franchise link (optional - only for franchise users)
  franchise_id: varchar("franchise_id").references(() => franchises.id, { onDelete: 'set null' }),
  
  // ========== RBM (Risk-Based Multiplier) FIELDS ==========
  // Multiplier requested by user (1.0 to 5.0)
  rbm_requested: decimal("rbm_requested", { precision: 3, scale: 1 }).default("1.0"),
  // Multiplier approved after Quality Gate validation (may be lower than requested)
  rbm_approved: decimal("rbm_approved", { precision: 3, scale: 1 }).default("1.0"),
  // RBM status: INACTIVE (default), PENDING (awaiting QG), ACTIVE (approved), REDUCED (auto-rollback)
  rbm_status: varchar("rbm_status", { length: 20 }).default("INACTIVE").notNull(),
  // Timestamp when RBM was approved
  rbm_approved_at: timestamp("rbm_approved_at"),
  // Timestamp when RBM was reduced (rollback)
  rbm_reduced_at: timestamp("rbm_reduced_at"),
  // Reason for RBM reduction (rollback trigger)
  rbm_reduced_reason: text("rbm_reduced_reason"),
}, (table) => [
  index("idx_campaigns_portfolio").on(table.portfolio_id),
  index("idx_campaigns_status").on(table.status),
  index("idx_campaigns_profile").on(table.investor_profile),
  index("idx_campaigns_franchise").on(table.franchise_id),
  index("idx_campaigns_deleted").on(table.is_deleted),
  index("idx_campaigns_custom_profile").on(table.custom_profile_id),
  index("idx_campaigns_rbm_status").on(table.rbm_status),
]);

// ========== RBM EVENTS TABLE (Audit Trail) ==========
// Tracks all RBM-related events for audit and compliance
export const rbm_events = pgTable("rbm_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  
  // Event type: REQUEST, APPROVE, DENY, REDUCE, RESTORE
  event_type: varchar("event_type", { length: 20 }).notNull(),
  
  // Value changes
  previous_value: decimal("previous_value", { precision: 3, scale: 1 }), // RBM before event
  new_value: decimal("new_value", { precision: 3, scale: 1 }), // RBM after event
  
  // Reason for the event
  reason: text("reason"),
  
  // Quality Gate snapshot at time of event (for REQUEST/APPROVE/DENY)
  quality_gate_snapshot: jsonb("quality_gate_snapshot"), // { ok: boolean, reasons: string[], metrics: object }
  
  // Audit fields
  triggered_by: varchar("triggered_by", { length: 20 }), // 'user', 'system', 'quality_gate', 'monitor'
  user_id: varchar("user_id"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_rbm_events_campaign").on(table.campaign_id),
  index("idx_rbm_events_type").on(table.event_type),
  index("idx_rbm_events_created").on(table.created_at),
]);

// RBM Event types and schemas
export const RBM_EVENT_TYPES = ['REQUEST', 'APPROVE', 'DENY', 'REDUCE', 'RESTORE'] as const;
export type RbmEventType = typeof RBM_EVENT_TYPES[number];

export const RBM_STATUS_VALUES = ['INACTIVE', 'PENDING', 'ACTIVE', 'REDUCED'] as const;
export type RbmStatus = typeof RBM_STATUS_VALUES[number];

// Validation constants
export const RBM_MIN = 1.0;
export const RBM_MAX = 5.0;

export const insertRbmEventSchema = createInsertSchema(rbm_events).omit({
  id: true,
  created_at: true,
}).extend({
  event_type: z.enum(RBM_EVENT_TYPES),
  previous_value: z.string().optional(),
  new_value: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return num >= RBM_MIN && num <= RBM_MAX;
    },
    { message: `RBM value must be between ${RBM_MIN} and ${RBM_MAX}` }
  ).optional(),
});
export type InsertRbmEvent = z.infer<typeof insertRbmEventSchema>;
export type RbmEvent = typeof rbm_events.$inferSelect;

// RBM request validation schema (for API)
export const rbmRequestSchema = z.object({
  campaignId: z.string().uuid(),
  multiplier: z.number().min(RBM_MIN).max(RBM_MAX),
});
export type RbmRequest = z.infer<typeof rbmRequestSchema>;

// Clusters table - stores asset clustering data
export const clusters = pgTable("clusters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaign_id: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  cluster_number: integer("cluster_number").notNull(),
  assets: text("assets").array().notNull(), // Array of symbols
  avg_volatility: decimal("avg_volatility", { precision: 10, scale: 6 }),
  avg_correlation: decimal("avg_correlation", { precision: 5, scale: 4 }),
  daily_pnl: decimal("daily_pnl", { precision: 20, scale: 2 }).default("0").notNull(),
  circuit_breaker_active: boolean("circuit_breaker_active").default(false).notNull(),
  paused_until: timestamp("paused_until"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_clusters_campaign").on(table.campaign_id),
]);

// ========== ASSET SELECTION TABLES ==========

// Exchanges table - stores supported cryptocurrency exchanges
export const exchanges = pgTable("exchanges", {
  id: varchar("id").primaryKey(), // kraken, okx, bybit, kucoin
  name: text("name").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  priority: integer("priority").notNull(), // 1=Kraken (preferential), 2=OKX, 3=Bybit, 4=KuCoin
});

// Symbols table - stores tradable cryptocurrency pairs with metrics
export const symbols = pgTable("symbols", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exchange_id: varchar("exchange_id").notNull().references(() => exchanges.id),
  symbol: text("symbol").notNull(), // BTC/USD, ETH/USD (normalized format)
  exchange_symbol: text("exchange_symbol").notNull(), // XBTUSD (Kraken format)
  // Semantic cluster assignment (1-10)
  cluster_id: integer("cluster_id"), // 1=Liquidity, 2=VolModerate, 3=Explosive, 4=Momentum, 5=Scalping, 6=Narrative, 7=Trend, 8=Sideways, 9=Altcoin, 10=Hybrid
  // Tradability metrics (cached, updated periodically)
  volume_24h_usd: decimal("volume_24h_usd", { precision: 20, scale: 2 }),
  real_volume_ratio: decimal("real_volume_ratio", { precision: 5, scale: 4 }), // Ratio of real vs reported volume (0.0000-1.0000, NULL = not calculated)
  spread_mid_pct: decimal("spread_mid_pct", { precision: 10, scale: 6 }),
  depth_top10_usd: decimal("depth_top10_usd", { precision: 20, scale: 2 }),
  atr_daily_pct: decimal("atr_daily_pct", { precision: 10, scale: 6 }),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_symbols_symbol").on(table.symbol),
  index("idx_symbols_real_volume").on(table.real_volume_ratio),
  index("idx_symbols_cluster").on(table.cluster_id),
]);

// Symbol rankings table - stores multi-factor scoring results
export const symbol_rankings = pgTable("symbol_rankings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol_id: varchar("symbol_id").notNull().references(() => symbols.id, { onDelete: 'cascade' }),
  run_id: varchar("run_id").notNull(), // Group rankings from same selection run
  rank: integer("rank").notNull(), // 1-100 for selected assets
  score: decimal("score", { precision: 10, scale: 4 }).notNull(),
  cluster_number: integer("cluster_number"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_rankings_run").on(table.run_id),
]);

// Asset selection filters - stores user-customizable filters for asset selection
export const asset_selection_filters = pgTable("asset_selection_filters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Volume filters
  min_volume_24h_usd: decimal("min_volume_24h_usd", { precision: 20, scale: 2 }).default("5000000").notNull(), // $5M default
  
  // Spread filters
  max_spread_mid_pct: decimal("max_spread_mid_pct", { precision: 10, scale: 6 }).default("0.10").notNull(), // 10% default
  
  // Liquidity/Depth filters
  min_depth_top10_usd: decimal("min_depth_top10_usd", { precision: 20, scale: 2 }).default("100000").notNull(), // $100k default
  
  // Volatility filters (ATR)
  min_atr_daily_pct: decimal("min_atr_daily_pct", { precision: 10, scale: 6 }).default("0.01").notNull(), // 1% min volatility
  max_atr_daily_pct: decimal("max_atr_daily_pct", { precision: 10, scale: 6 }).default("0.50").notNull(), // 50% max volatility
  
  // Clustering config
  num_clusters: integer("num_clusters").default(5).notNull(), // K for K-means
  target_assets_count: integer("target_assets_count").default(30).notNull(), // Target ~30 tradable pairs
  
  // Metadata
  is_default: boolean("is_default").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_filters_user").on(table.user_id),
  index("idx_filters_default").on(table.is_default),
  uniqueIndex("idx_filters_user_default").on(table.user_id, table.is_default), // One default filter per user
]);

// ========== SPRINT 4: FEES & REBALANCING TABLES ==========

// Fees tables - stores trading fees and slippage by exchange and symbol
export const fees_tables = pgTable("fees_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exchange_id: varchar("exchange_id").notNull().references(() => exchanges.id),
  symbol: text("symbol"), // NULL = default fees for exchange, specific symbol = override
  maker_fee_pct: decimal("maker_fee_pct", { precision: 6, scale: 4 }).notNull(), // e.g., 0.0016 = 0.16%
  taker_fee_pct: decimal("taker_fee_pct", { precision: 6, scale: 4 }).notNull(), // e.g., 0.0026 = 0.26%
  avg_slippage_pct: decimal("avg_slippage_pct", { precision: 6, scale: 4 }).notNull(), // Average slippage based on spread tier
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_fees_exchange").on(table.exchange_id),
  index("idx_fees_symbol").on(table.symbol),
  uniqueIndex("idx_fees_unique").on(table.exchange_id, table.symbol), // One fee config per exchange+symbol
]);

// Rebalance logs table - audit trail of portfolio rebalancing operations (every 8h)
export const rebalance_logs = pgTable("rebalance_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  campaign_id: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }), // Optional: for campaign-driven rebalancing
  run_id: varchar("run_id"), // Optional: Links to symbol_rankings.run_id for this rebalance
  status: text("status").notNull(), // dry_run, completed, failed
  trades_executed: integer("trades_executed").default(0).notNull(),
  total_cost_usd: decimal("total_cost_usd", { precision: 20, scale: 2 }).default("0").notNull(),
  reason: text("reason").notNull(), // scheduled_8h, manual, circuit_breaker_reset, etc.
  metadata: jsonb("metadata"), // Full rebalance plan: { clusterExposures, trades, totalEquity }
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_rebalance_portfolio").on(table.portfolio_id),
  index("idx_rebalance_campaign").on(table.campaign_id),
  index("idx_rebalance_status").on(table.status),
  index("idx_rebalance_time").on(table.created_at),
]);

// ========== TAX & COST TRACKING TABLES ==========

// Tax profiles - stores tax configuration per user based on country
export const tax_profiles = pgTable("tax_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  country_code: text("country_code").notNull(), // ISO 3166-1 alpha-2 (BR, US, AE, SG, etc.)
  tax_regime: text("tax_regime").notNull(), // day_trading, swing_trading, crypto_exempt
  short_term_rate_pct: decimal("short_term_rate_pct", { precision: 5, scale: 2 }).notNull(), // e.g., 15.00 for Brazil day trading
  long_term_rate_pct: decimal("long_term_rate_pct", { precision: 5, scale: 2 }).default("0").notNull(), // e.g., 0.00 for Brazil day trading
  minimum_taxable_amount: decimal("minimum_taxable_amount", { precision: 20, scale: 2 }).default("0").notNull(), // Minimum profit to trigger tax
  tax_year: integer("tax_year").notNull(), // e.g., 2025
  is_active: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"), // Extra config: { quarterly_payments, deductions, etc. }
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tax_user").on(table.user_id),
  index("idx_tax_country").on(table.country_code),
  index("idx_tax_active").on(table.is_active),
  uniqueIndex("idx_tax_unique").on(table.user_id, table.tax_year, table.is_active), // One active profile per user per year
]);

// Trade costs - detailed cost breakdown per trade
export const trade_costs = pgTable("trade_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trade_id: varchar("trade_id").notNull().references(() => trades.id, { onDelete: 'cascade' }),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  
  // Entry costs
  entry_fee_usd: decimal("entry_fee_usd", { precision: 20, scale: 8 }).default("0").notNull(),
  entry_slippage_usd: decimal("entry_slippage_usd", { precision: 20, scale: 8 }).default("0").notNull(),
  
  // Exit costs
  exit_fee_usd: decimal("exit_fee_usd", { precision: 20, scale: 8 }).default("0").notNull(),
  exit_slippage_usd: decimal("exit_slippage_usd", { precision: 20, scale: 8 }).default("0").notNull(),
  
  // Total costs
  total_fees_usd: decimal("total_fees_usd", { precision: 20, scale: 8 }).default("0").notNull(),
  total_slippage_usd: decimal("total_slippage_usd", { precision: 20, scale: 8 }).default("0").notNull(),
  total_cost_usd: decimal("total_cost_usd", { precision: 20, scale: 8 }).default("0").notNull(), // Sum of all costs
  
  // Tax calculation
  gross_pnl_usd: decimal("gross_pnl_usd", { precision: 20, scale: 8 }).default("0").notNull(), // Before costs
  net_pnl_usd: decimal("net_pnl_usd", { precision: 20, scale: 8 }).default("0").notNull(), // After costs, before tax
  tax_owed_usd: decimal("tax_owed_usd", { precision: 20, scale: 8 }).default("0").notNull(),
  net_after_tax_usd: decimal("net_after_tax_usd", { precision: 20, scale: 8 }).default("0").notNull(), // Final profit/loss
  
  // Metadata
  tax_rate_applied_pct: decimal("tax_rate_applied_pct", { precision: 5, scale: 2 }), // Rate used for this trade
  tax_profile_id: varchar("tax_profile_id").references(() => tax_profiles.id),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_costs_trade").on(table.trade_id),
  index("idx_costs_portfolio").on(table.portfolio_id),
  index("idx_costs_time").on(table.created_at),
  uniqueIndex("idx_costs_unique").on(table.trade_id), // One cost record per trade
]);

// ========== ZOD SCHEMAS & TYPES ==========

// Users (Replit Auth)
export const upsertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof users.$inferSelect;

// Portfolios
export const insertPortfolioSchema = createInsertSchema(portfolios).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolios.$inferSelect;

// Positions
export const insertPositionSchema = createInsertSchema(positions).omit({
  id: true,
  opened_at: true,
  updated_at: true,
});
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positions.$inferSelect;

// Trades
export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  closed_at: true,
});
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

// Alerts
export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  created_at: true,
  triggered_at: true,
});
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;

// Risk Parameters
export const insertRiskParametersSchema = createInsertSchema(risk_parameters).omit({
  id: true,
  updated_at: true,
});
export type InsertRiskParameters = z.infer<typeof insertRiskParametersSchema>;
export type RiskParameters = typeof risk_parameters.$inferSelect;

// Asset Breakers
export const insertAssetBreakerSchema = createInsertSchema(asset_breakers).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertAssetBreaker = z.infer<typeof insertAssetBreakerSchema>;
export type AssetBreaker = typeof asset_breakers.$inferSelect;

// Cluster Breakers
export const insertClusterBreakerSchema = createInsertSchema(cluster_breakers).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertClusterBreaker = z.infer<typeof insertClusterBreakerSchema>;
export type ClusterBreaker = typeof cluster_breakers.$inferSelect;

// Circuit Breaker Events
export const insertCircuitBreakerEventSchema = createInsertSchema(circuit_breaker_events).omit({
  id: true,
  created_at: true,
});
export type InsertCircuitBreakerEvent = z.infer<typeof insertCircuitBreakerEventSchema>;
export type CircuitBreakerEvent = typeof circuit_breaker_events.$inferSelect;

// Market Data Cache
export const insertMarketDataCacheSchema = createInsertSchema(market_data_cache).omit({
  id: true,
  updated_at: true,
});
export type InsertMarketDataCache = z.infer<typeof insertMarketDataCacheSchema>;
export type MarketDataCache = typeof market_data_cache.$inferSelect;

// News Feed
export const insertNewsFeedSchema = createInsertSchema(news_feed).omit({
  id: true,
  fetched_at: true,
});
export type InsertNewsFeed = z.infer<typeof insertNewsFeedSchema>;
export type NewsFeed = typeof news_feed.$inferSelect;

// AI Conversations
export const insertAIConversationSchema = createInsertSchema(ai_conversations).omit({
  id: true,
  created_at: true,
});
export type InsertAIConversation = z.infer<typeof insertAIConversationSchema>;
export type AIConversation = typeof ai_conversations.$inferSelect;

// Performance Snapshots
export const insertPerformanceSnapshotSchema = createInsertSchema(performance_snapshots).omit({
  id: true,
  snapshot_at: true,
});
export type InsertPerformanceSnapshot = z.infer<typeof insertPerformanceSnapshotSchema>;
export type PerformanceSnapshot = typeof performance_snapshots.$inferSelect;

// Orders
export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  created_at: true,
  updated_at: true,
  filled_at: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Bars 1m
export const insertBars1mSchema = createInsertSchema(bars_1m).omit({
  id: true,
  processing_ts: true,
});
export type InsertBars1m = z.infer<typeof insertBars1mSchema>;
export type Bars1m = typeof bars_1m.$inferSelect;

// Bars 1h
export const insertBars1hSchema = createInsertSchema(bars_1h).omit({
  id: true,
  processing_ts: true,
});
export type InsertBars1h = z.infer<typeof insertBars1hSchema>;
export type Bars1h = typeof bars_1h.$inferSelect;

// Decision Log
export const insertDecisionLogSchema = createInsertSchema(decision_log).omit({
  id: true,
  created_at: true,
});
export type InsertDecisionLog = z.infer<typeof insertDecisionLogSchema>;
export type DecisionLog = typeof decision_log.$inferSelect;

// Staleness Log
export const insertStalenessLogSchema = createInsertSchema(staleness_log).omit({
  id: true,
  detected_at: true,
});
export type InsertStalenessLog = z.infer<typeof insertStalenessLogSchema>;
export type StalenessLog = typeof staleness_log.$inferSelect;

// Slippage Estimates
export const insertSlippageEstimateSchema = createInsertSchema(slippage_estimates).omit({
  id: true,
  updated_at: true,
});
export type InsertSlippageEstimate = z.infer<typeof insertSlippageEstimateSchema>;
export type SlippageEstimate = typeof slippage_estimates.$inferSelect;

// Audit Trail
export const insertAuditTrailSchema = createInsertSchema(audit_trail).omit({
  id: true,
  created_at: true,
});
export type InsertAuditTrail = z.infer<typeof insertAuditTrailSchema>;
export type AuditTrail = typeof audit_trail.$inferSelect;

// Risk Profile Config
export const insertRiskProfileConfigSchema = createInsertSchema(risk_profile_config).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertRiskProfileConfig = z.infer<typeof insertRiskProfileConfigSchema>;
export type RiskProfileConfig = typeof risk_profile_config.$inferSelect;

// Campaigns
export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  created_at: true,
  completed_at: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

// Clusters
export const insertClusterSchema = createInsertSchema(clusters).omit({
  id: true,
  updated_at: true,
});
export type InsertCluster = z.infer<typeof insertClusterSchema>;
export type Cluster = typeof clusters.$inferSelect;

// Exchanges
export const insertExchangeSchema = createInsertSchema(exchanges);
export type InsertExchange = z.infer<typeof insertExchangeSchema>;
export type Exchange = typeof exchanges.$inferSelect;

// Symbols
export const insertSymbolSchema = createInsertSchema(symbols).omit({
  id: true,
  updated_at: true,
});
export type InsertSymbol = z.infer<typeof insertSymbolSchema>;
export type Symbol = typeof symbols.$inferSelect;

// Symbol Rankings
export const insertSymbolRankingSchema = createInsertSchema(symbol_rankings).omit({
  id: true,
  created_at: true,
});
export type InsertSymbolRanking = z.infer<typeof insertSymbolRankingSchema>;
export type SymbolRanking = typeof symbol_rankings.$inferSelect;

// Asset Selection Filters
export const insertAssetSelectionFiltersSchema = createInsertSchema(asset_selection_filters).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertAssetSelectionFilters = z.infer<typeof insertAssetSelectionFiltersSchema>;
export type AssetSelectionFilters = typeof asset_selection_filters.$inferSelect;

// ========== TRADING SIGNALS SYSTEM ==========

// Signal Configurations - ATR-based parameters per asset
export const signal_configs = pgTable("signal_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  symbol: text("symbol").notNull(),
  // Long signal: (Price - EMA12) > N×ATR
  long_threshold_atr_multiplier: decimal("long_threshold_atr_multiplier", { precision: 10, scale: 2 }).default("2.0").notNull(),
  // Short signal: (EMA12 - Price) > N×ATR
  short_threshold_atr_multiplier: decimal("short_threshold_atr_multiplier", { precision: 10, scale: 2 }).default("1.5").notNull(),
  // OCO targets
  tp1_atr_multiplier: decimal("tp1_atr_multiplier", { precision: 10, scale: 2 }).default("1.2").notNull(),
  tp2_atr_multiplier: decimal("tp2_atr_multiplier", { precision: 10, scale: 2 }).default("2.5").notNull(),
  sl_atr_multiplier: decimal("sl_atr_multiplier", { precision: 10, scale: 2 }).default("1.0").notNull(),
  // Position sizing
  tp1_close_percentage: decimal("tp1_close_percentage", { precision: 5, scale: 2 }).default("50.00").notNull(),
  risk_per_trade_bps: integer("risk_per_trade_bps").default(20).notNull(), // 20 bps = 0.20%
  // Metadata
  timeframe: text("timeframe").default("1m").notNull(), // For future multi-timeframe support
  enabled: boolean("enabled").default(true).notNull(),
  last_calculated_at: timestamp("last_calculated_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Indexes for performance
  idx_signal_configs_portfolio: index("idx_signal_configs_portfolio").on(table.portfolio_id),
  idx_signal_configs_symbol: index("idx_signal_configs_symbol").on(table.symbol),
  idx_signal_configs_enabled: index("idx_signal_configs_enabled").on(table.enabled),
  // CRITICAL: UNIQUE constraint - only one config per (portfolio, symbol)
  uniq_signal_configs_portfolio_symbol: uniqueIndex("uniq_signal_configs_portfolio_symbol").on(table.portfolio_id, table.symbol),
}));

// Trading Signals - Generated by SignalEngine
export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  symbol: text("symbol").notNull(),
  signal_type: text("signal_type").notNull(), // 'long' | 'short'
  
  // Market state at signal generation
  price_at_signal: decimal("price_at_signal", { precision: 20, scale: 8 }).notNull(),
  ema12: decimal("ema12", { precision: 20, scale: 8 }).notNull(),
  ema36: decimal("ema36", { precision: 20, scale: 8 }).notNull(),
  atr: decimal("atr", { precision: 20, scale: 8 }).notNull(),
  
  // CRITICAL: Immutable snapshot of config used (for audit/telemetry)
  signal_config_id: varchar("signal_config_id").notNull().references(() => signal_configs.id, { onDelete: 'cascade' }),
  config_snapshot: jsonb("config_snapshot").notNull(), // Full config at generation time
  
  // Calculated targets (based on config snapshot)
  calculated_tp1: decimal("calculated_tp1", { precision: 20, scale: 8 }).notNull(),
  calculated_tp2: decimal("calculated_tp2", { precision: 20, scale: 8 }).notNull(),
  calculated_sl: decimal("calculated_sl", { precision: 20, scale: 8 }).notNull(),
  calculated_position_size: decimal("calculated_position_size", { precision: 20, scale: 8 }).notNull(),
  
  // Risk/Circuit Breaker context (for telemetry)
  risk_per_trade_bps_used: integer("risk_per_trade_bps_used").notNull(),
  circuit_breaker_state: jsonb("circuit_breaker_state"), // Snapshot of breaker states at signal time
  
  // Lifecycle tracking
  status: text("status").default("pending").notNull(), // pending, executed, expired, cancelled
  position_id: varchar("position_id").references(() => positions.id, { onDelete: 'set null' }),
  execution_price: decimal("execution_price", { precision: 20, scale: 8 }),
  execution_reason: text("execution_reason"),
  expiration_reason: text("expiration_reason"),
  
  // Timestamps
  generated_at: timestamp("generated_at").defaultNow().notNull(),
  executed_at: timestamp("executed_at"),
  expired_at: timestamp("expired_at"),
}, (table) => [
  index("idx_signals_portfolio").on(table.portfolio_id),
  index("idx_signals_symbol").on(table.symbol),
  index("idx_signals_status").on(table.status),
  // CRITICAL: Compound indexes for high-volume queries
  index("idx_signals_portfolio_status_time").on(table.portfolio_id, table.status, table.generated_at),
  index("idx_signals_symbol_time").on(table.symbol, table.generated_at),
  index("idx_signals_config").on(table.signal_config_id),
]);

// Zod schemas for Signal Configs
export const insertSignalConfigSchema = createInsertSchema(signal_configs).omit({
  id: true,
  created_at: true,
  updated_at: true,
  last_calculated_at: true,
});
export type InsertSignalConfig = z.infer<typeof insertSignalConfigSchema>;
export type SignalConfig = typeof signal_configs.$inferSelect;

// Zod schemas for Signals
export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  generated_at: true,
  executed_at: true,
  expired_at: true,
});
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signals.$inferSelect;

// System Metadata table - stores internal configuration and tracking data
export const system_metadata = pgTable("system_metadata", {
  key: varchar("key").primaryKey(),
  value: jsonb("value").notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// ========== SPRINT 4: FEES & REBALANCING ZOD SCHEMAS ==========

// Fees Tables
export const insertFeesTablesSchema = createInsertSchema(fees_tables).omit({
  id: true,
  updated_at: true,
});
export type InsertFeesTables = z.infer<typeof insertFeesTablesSchema>;
export type FeesTables = typeof fees_tables.$inferSelect;

// Rebalance Logs
export const insertRebalanceLogSchema = createInsertSchema(rebalance_logs).omit({
  id: true,
  created_at: true,
});
export type InsertRebalanceLog = z.infer<typeof insertRebalanceLogSchema>;
export type RebalanceLog = typeof rebalance_logs.$inferSelect;

// Tax Profiles
export const insertTaxProfileSchema = createInsertSchema(tax_profiles).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertTaxProfile = z.infer<typeof insertTaxProfileSchema>;
export type TaxProfile = typeof tax_profiles.$inferSelect;

// Trade Costs
export const insertTradeCostSchema = createInsertSchema(trade_costs).omit({
  id: true,
  created_at: true,
});
export type InsertTradeCost = z.infer<typeof insertTradeCostSchema>;
export type TradeCost = typeof trade_costs.$inferSelect;

// ========== TOPIC 13: BACKTEST & SIMULATION TABLES ==========

// Backtest Runs - stores backtest execution configuration and summary
export const backtest_runs = pgTable("backtest_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  portfolio_id: varchar("portfolio_id").references(() => portfolios.id, { onDelete: 'set null' }),
  
  // Configuration
  name: text("name").notNull(),
  start_date: timestamp("start_date").notNull(),
  end_date: timestamp("end_date").notNull(),
  initial_capital: decimal("initial_capital", { precision: 20, scale: 2 }).notNull(),
  symbols: text("symbols").array().notNull(), // Array of symbols to backtest
  
  // Strategy parameters (JSON for flexibility) - optional, defaults provided by backend
  strategy_params: jsonb("strategy_params"), // ema_fast, ema_slow, atr_period, tp/sl multipliers
  risk_params: jsonb("risk_params"), // risk_per_trade_bps, cluster_cap_pct, breaker thresholds
  cost_params: jsonb("cost_params"), // fee_roundtrip_pct, slippage_pct, tax_rate
  
  // Execution status
  status: text("status").default("pending").notNull(), // pending, running, completed, failed
  progress_percentage: decimal("progress_percentage", { precision: 5, scale: 2 }).default("0").notNull(),
  error_message: text("error_message"),
  
  // Whether to apply circuit breakers (for A/B comparison)
  apply_breakers: boolean("apply_breakers").default(true).notNull(),
  
  // Summary metrics (computed after completion)
  total_trades: integer("total_trades").default(0).notNull(),
  winning_trades: integer("winning_trades").default(0).notNull(),
  losing_trades: integer("losing_trades").default(0).notNull(),
  final_equity: decimal("final_equity", { precision: 20, scale: 2 }),
  total_pnl: decimal("total_pnl", { precision: 20, scale: 2 }),
  total_pnl_percentage: decimal("total_pnl_percentage", { precision: 10, scale: 4 }),
  total_fees: decimal("total_fees", { precision: 20, scale: 8 }),
  total_slippage: decimal("total_slippage", { precision: 20, scale: 8 }),
  
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_backtest_runs_user").on(table.user_id),
  index("idx_backtest_runs_portfolio").on(table.portfolio_id),
  index("idx_backtest_runs_status").on(table.status),
  index("idx_backtest_runs_created").on(table.created_at),
]);

// Backtest Trades - individual simulated trades within a backtest run
export const backtest_trades = pgTable("backtest_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  backtest_run_id: varchar("backtest_run_id").notNull().references(() => backtest_runs.id, { onDelete: 'cascade' }),
  
  symbol: text("symbol").notNull(),
  cluster_number: integer("cluster_number"),
  side: text("side").notNull(), // long or short
  
  // Entry details
  entry_price: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  entry_time: timestamp("entry_time").notNull(),
  entry_signal_strength: decimal("entry_signal_strength", { precision: 10, scale: 4 }),
  
  // Exit details
  exit_price: decimal("exit_price", { precision: 20, scale: 8 }),
  exit_time: timestamp("exit_time"),
  exit_reason: text("exit_reason"), // tp1, tp2, sl, trailing_sl, breaker, end_of_period
  
  // Position sizing
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  notional_value: decimal("notional_value", { precision: 20, scale: 2 }).notNull(),
  
  // PnL and costs
  gross_pnl: decimal("gross_pnl", { precision: 20, scale: 2 }),
  fees: decimal("fees", { precision: 20, scale: 8 }),
  slippage: decimal("slippage", { precision: 20, scale: 8 }),
  net_pnl: decimal("net_pnl", { precision: 20, scale: 2 }),
  net_pnl_percentage: decimal("net_pnl_percentage", { precision: 10, scale: 4 }),
  
  // ATR/EMA context at entry
  atr_at_entry: decimal("atr_at_entry", { precision: 20, scale: 8 }),
  ema_fast_at_entry: decimal("ema_fast_at_entry", { precision: 20, scale: 8 }),
  ema_slow_at_entry: decimal("ema_slow_at_entry", { precision: 20, scale: 8 }),
  
  // OCO levels
  stop_loss: decimal("stop_loss", { precision: 20, scale: 8 }),
  take_profit_1: decimal("take_profit_1", { precision: 20, scale: 8 }),
  take_profit_2: decimal("take_profit_2", { precision: 20, scale: 8 }),
  
  // Breaker interactions
  breaker_triggered: boolean("breaker_triggered").default(false).notNull(),
  breaker_type: text("breaker_type"), // asset, cluster, global
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_backtest_trades_run").on(table.backtest_run_id),
  index("idx_backtest_trades_symbol").on(table.symbol),
  index("idx_backtest_trades_entry_time").on(table.entry_time),
  index("idx_backtest_trades_cluster").on(table.cluster_number),
]);

// Backtest Metrics - detailed performance metrics and risk analysis
export const backtest_metrics = pgTable("backtest_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  backtest_run_id: varchar("backtest_run_id").notNull().references(() => backtest_runs.id, { onDelete: 'cascade' }).unique(),
  
  // Return metrics
  mean_return: decimal("mean_return", { precision: 20, scale: 8 }),
  stdev_return: decimal("stdev_return", { precision: 20, scale: 8 }),
  sharpe_ratio: decimal("sharpe_ratio", { precision: 10, scale: 4 }),
  sortino_ratio: decimal("sortino_ratio", { precision: 10, scale: 4 }),
  
  // Risk metrics
  var_95: decimal("var_95", { precision: 20, scale: 8 }),
  var_99: decimal("var_99", { precision: 20, scale: 8 }),
  es_95: decimal("es_95", { precision: 20, scale: 8 }),
  es_99: decimal("es_99", { precision: 20, scale: 8 }),
  max_drawdown: decimal("max_drawdown", { precision: 20, scale: 2 }),
  max_drawdown_percentage: decimal("max_drawdown_percentage", { precision: 10, scale: 4 }),
  max_drawdown_duration_hours: integer("max_drawdown_duration_hours"),
  
  // Trade metrics
  hit_rate: decimal("hit_rate", { precision: 10, scale: 4 }),
  avg_win: decimal("avg_win", { precision: 20, scale: 2 }),
  avg_loss: decimal("avg_loss", { precision: 20, scale: 2 }),
  profit_factor: decimal("profit_factor", { precision: 10, scale: 4 }),
  payoff_ratio: decimal("payoff_ratio", { precision: 10, scale: 4 }),
  expectancy: decimal("expectancy", { precision: 20, scale: 2 }),
  
  // Turnover and costs
  turnover: decimal("turnover", { precision: 20, scale: 2 }),
  fees_percentage: decimal("fees_percentage", { precision: 10, scale: 4 }),
  slippage_bp: decimal("slippage_bp", { precision: 10, scale: 2 }),
  cost_drag_percentage: decimal("cost_drag_percentage", { precision: 10, scale: 4 }),
  
  // Breaker statistics
  asset_breakers_triggered: integer("asset_breakers_triggered").default(0).notNull(),
  cluster_breakers_triggered: integer("cluster_breakers_triggered").default(0).notNull(),
  global_breakers_triggered: integer("global_breakers_triggered").default(0).notNull(),
  trades_blocked_by_breakers: integer("trades_blocked_by_breakers").default(0).notNull(),
  
  // Monte Carlo simulation results (JSON for flexibility)
  monte_carlo_results: jsonb("monte_carlo_results"), // scenarios, confidence intervals
  
  // Validation criteria
  es95_improved: boolean("es95_improved"), // ES95 better with breakers vs without
  var99_improved: boolean("var99_improved"), // VaR99 reduced in stress with breakers
  pnl_net_positive: boolean("pnl_net_positive"), // PnL líquido positivo
  validation_passed: boolean("validation_passed").default(false).notNull(),
  validation_notes: text("validation_notes"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_backtest_metrics_run").on(table.backtest_run_id),
  index("idx_backtest_metrics_validation").on(table.validation_passed),
]);

// ========== MULTI-CAMPAIGN ENGINE TABLES ==========

// Campaign Risk State - tracks real-time risk state per campaign (isolated)
export const campaign_risk_states = pgTable("campaign_risk_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }).unique(),
  
  // Equity tracking
  current_equity: decimal("current_equity", { precision: 20, scale: 2 }).notNull(),
  equity_high_watermark: decimal("equity_high_watermark", { precision: 20, scale: 2 }).notNull(),
  
  // Daily PnL tracking (resets at 00:00 UTC)
  daily_pnl: decimal("daily_pnl", { precision: 20, scale: 2 }).default("0").notNull(),
  daily_pnl_pct: decimal("daily_pnl_pct", { precision: 10, scale: 4 }).default("0").notNull(),
  daily_loss_pct: decimal("daily_loss_pct", { precision: 10, scale: 4 }).default("0").notNull(),
  
  // Drawdown tracking
  current_dd_pct: decimal("current_dd_pct", { precision: 10, scale: 4 }).default("0").notNull(),
  max_dd_pct: decimal("max_dd_pct", { precision: 10, scale: 4 }).default("0").notNull(),
  
  // R-based loss tracking per pair (JSON map: symbol -> loss in R units)
  loss_in_r_by_pair: jsonb("loss_in_r_by_pair").default({}).notNull(),
  
  // Daily counters
  trades_today: integer("trades_today").default(0).notNull(),
  positions_open: integer("positions_open").default(0).notNull(),
  
  // Circuit breaker states
  cb_pair_triggered: jsonb("cb_pair_triggered").default({}).notNull(), // symbol -> boolean
  cb_daily_triggered: boolean("cb_daily_triggered").default(false).notNull(),
  cb_campaign_triggered: boolean("cb_campaign_triggered").default(false).notNull(),
  cb_var_es_triggered: boolean("cb_var_es_triggered").default(false).notNull(), // VaR/ES based CB (V2.0+)
  cb_cooldown_until: timestamp("cb_cooldown_until"),
  
  // VaR/ES tracking for circuit breaker (V2.0+ Governance)
  current_var_95: decimal("current_var_95", { precision: 10, scale: 4 }), // Latest calculated VaR 95%
  current_es_95: decimal("current_es_95", { precision: 10, scale: 4 }), // Latest calculated ES 95%
  var_es_last_calculated: timestamp("var_es_last_calculated"), // When VaR/ES was last calculated
  
  // Current tradable set (symbols in the operatable subset)
  current_tradable_set: text("current_tradable_set").array().default([]).notNull(),
  
  // Scheduler timestamps
  last_rebalance_ts: timestamp("last_rebalance_ts"),
  last_audit_ts: timestamp("last_audit_ts"),
  last_daily_reset_ts: timestamp("last_daily_reset_ts"),
  
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_campaign_risk_campaign").on(table.campaign_id),
  index("idx_campaign_risk_cb_daily").on(table.cb_daily_triggered),
  index("idx_campaign_risk_cb_campaign").on(table.cb_campaign_triggered),
]);

// Campaign Asset Universe - tracks assets assigned to each campaign
export const campaign_asset_universes = pgTable("campaign_asset_universes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  symbol: text("symbol").notNull(),
  
  // Weight and ranking
  initial_weight: decimal("initial_weight", { precision: 10, scale: 6 }),
  current_weight: decimal("current_weight", { precision: 10, scale: 6 }),
  
  // Status tracking
  is_active: boolean("is_active").default(true).notNull(),
  is_in_tradable_set: boolean("is_in_tradable_set").default(false).notNull(),
  
  // Scoring data (from last rebalance)
  last_score: decimal("last_score", { precision: 10, scale: 4 }),
  last_rank: integer("last_rank"),
  cluster_number: integer("cluster_number"),
  
  // Problem tracking
  is_problematic: boolean("is_problematic").default(false).notNull(),
  problem_reason: text("problem_reason"),
  
  // Timestamps
  last_rebalance_at: timestamp("last_rebalance_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_campaign_universe_campaign").on(table.campaign_id),
  index("idx_campaign_universe_symbol").on(table.symbol),
  index("idx_campaign_universe_active").on(table.is_active),
  index("idx_campaign_universe_tradable").on(table.is_in_tradable_set),
  uniqueIndex("idx_campaign_universe_unique").on(table.campaign_id, table.symbol),
]);

// Campaign Daily Report - 24h audit report per campaign
export const campaign_daily_reports = pgTable("campaign_daily_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  report_date: timestamp("report_date").notNull(),
  
  // Trade performance metrics
  trades_count: integer("trades_count").default(0).notNull(),
  winning_trades: integer("winning_trades").default(0).notNull(),
  losing_trades: integer("losing_trades").default(0).notNull(),
  hit_rate: decimal("hit_rate", { precision: 10, scale: 4 }),
  
  // Payoff and expectancy
  avg_win: decimal("avg_win", { precision: 20, scale: 2 }),
  avg_loss: decimal("avg_loss", { precision: 20, scale: 2 }),
  payoff_ratio: decimal("payoff_ratio", { precision: 10, scale: 4 }),
  expectancy: decimal("expectancy", { precision: 20, scale: 2 }),
  
  // PnL
  pnl_day: decimal("pnl_day", { precision: 20, scale: 2 }).default("0").notNull(),
  pnl_cumulative: decimal("pnl_cumulative", { precision: 20, scale: 2 }).default("0").notNull(),
  pnl_day_pct: decimal("pnl_day_pct", { precision: 10, scale: 4 }),
  
  // Risk metrics
  dd_current: decimal("dd_current", { precision: 10, scale: 4 }),
  dd_max: decimal("dd_max", { precision: 10, scale: 4 }),
  var_95: decimal("var_95", { precision: 20, scale: 2 }),
  es_95: decimal("es_95", { precision: 20, scale: 2 }),
  
  // Costs
  avg_slippage: decimal("avg_slippage", { precision: 10, scale: 6 }),
  fees_total: decimal("fees_total", { precision: 20, scale: 8 }).default("0").notNull(),
  funding_total: decimal("funding_total", { precision: 20, scale: 8 }).default("0").notNull(),
  
  // Circuit breaker activity
  cb_pair_triggers: integer("cb_pair_triggers").default(0).notNull(),
  cb_daily_trigger: boolean("cb_daily_trigger").default(false).notNull(),
  cb_campaign_trigger: boolean("cb_campaign_trigger").default(false).notNull(),
  
  // Problematic assets
  problematic_assets: text("problematic_assets").array().default([]).notNull(),
  
  // Notes and alerts
  notes: text("notes"),
  risk_alerts: jsonb("risk_alerts").default([]).notNull(),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_campaign_report_campaign").on(table.campaign_id),
  index("idx_campaign_report_date").on(table.report_date),
  uniqueIndex("idx_campaign_report_unique").on(table.campaign_id, table.report_date),
]);

// Campaign Orders - orders specific to a campaign (isolated order book)
export const campaign_orders = pgTable("campaign_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  internal_order_id: varchar("internal_order_id").notNull(),
  exchange_order_id: text("exchange_order_id"),
  
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // buy, sell
  order_type: text("order_type").notNull(), // market, limit, stop_loss, take_profit, oco
  
  // Order details
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 20, scale: 8 }),
  stop_price: decimal("stop_price", { precision: 20, scale: 8 }),
  limit_price: decimal("limit_price", { precision: 20, scale: 8 }),
  
  // OCO linking
  oco_group_id: varchar("oco_group_id"),
  is_sl_order: boolean("is_sl_order").default(false).notNull(),
  is_tp_order: boolean("is_tp_order").default(false).notNull(),
  
  // Status tracking
  status: text("status").notNull(), // pending, open, filled, partially_filled, cancelled, expired, rejected
  filled_quantity: decimal("filled_quantity", { precision: 20, scale: 8 }).default("0").notNull(),
  average_fill_price: decimal("average_fill_price", { precision: 20, scale: 8 }),
  
  // Fees and costs
  fees: decimal("fees", { precision: 20, scale: 8 }).default("0").notNull(),
  slippage: decimal("slippage", { precision: 20, scale: 8 }).default("0").notNull(),
  
  // Reason for cancellation/rejection
  cancel_reason: text("cancel_reason"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  filled_at: timestamp("filled_at"),
}, (table) => [
  index("idx_campaign_orders_campaign").on(table.campaign_id),
  index("idx_campaign_orders_symbol").on(table.symbol),
  index("idx_campaign_orders_status").on(table.status),
  index("idx_campaign_orders_oco").on(table.oco_group_id),
  index("idx_campaign_orders_created").on(table.created_at),
]);

// Campaign Positions - positions specific to a campaign (isolated position book)
export const campaign_positions = pgTable("campaign_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // long, short
  
  // Position sizing
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  entry_price: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  current_price: decimal("current_price", { precision: 20, scale: 8 }).notNull(),
  
  // OCO levels (mandatory)
  stop_loss: decimal("stop_loss", { precision: 20, scale: 8 }).notNull(),
  take_profit: decimal("take_profit", { precision: 20, scale: 8 }).notNull(),
  
  // ATR context at entry (for R calculation)
  atr_at_entry: decimal("atr_at_entry", { precision: 20, scale: 8 }),
  risk_amount: decimal("risk_amount", { precision: 20, scale: 2 }), // Entry - SL in USD (1R)
  
  // Position adds tracking
  adds_count: integer("adds_count").default(0).notNull(),
  avg_entry_price: decimal("avg_entry_price", { precision: 20, scale: 8 }),
  
  // PnL tracking
  unrealized_pnl: decimal("unrealized_pnl", { precision: 20, scale: 2 }).default("0").notNull(),
  unrealized_pnl_pct: decimal("unrealized_pnl_pct", { precision: 10, scale: 4 }).default("0").notNull(),
  realized_pnl: decimal("realized_pnl", { precision: 20, scale: 2 }).default("0").notNull(),
  
  // Slippage tracking (for audit metrics)
  estimated_entry_price: decimal("estimated_entry_price", { precision: 20, scale: 8 }), // Price at signal generation
  actual_fill_price: decimal("actual_fill_price", { precision: 20, scale: 8 }), // Actual execution price
  entry_slippage_bps: decimal("entry_slippage_bps", { precision: 10, scale: 4 }).default("0"), // Basis points slippage
  exit_slippage_bps: decimal("exit_slippage_bps", { precision: 10, scale: 4 }).default("0"), // Basis points slippage on exit
  
  // Lifecycle
  state: text("state").notNull(), // open, closing, closed
  close_reason: text("close_reason"), // sl_hit, tp_hit, signal_exit, rebalance_exit, breaker_exit, manual
  
  opened_at: timestamp("opened_at").defaultNow().notNull(),
  closed_at: timestamp("closed_at"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_campaign_positions_campaign").on(table.campaign_id),
  index("idx_campaign_positions_symbol").on(table.symbol),
  index("idx_campaign_positions_state").on(table.state),
  index("idx_campaign_positions_opened").on(table.opened_at),
]);

// Monte Carlo Scenarios - individual stress test scenarios
export const monte_carlo_scenarios = pgTable("monte_carlo_scenarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  backtest_run_id: varchar("backtest_run_id").notNull().references(() => backtest_runs.id, { onDelete: 'cascade' }),
  
  scenario_number: integer("scenario_number").notNull(),
  scenario_type: text("scenario_type").notNull(), // normal, stress_intra_corr, stress_inter_corr, black_swan
  
  // Correlation parameters used
  intra_cluster_correlation: decimal("intra_cluster_correlation", { precision: 5, scale: 4 }),
  inter_cluster_correlation: decimal("inter_cluster_correlation", { precision: 5, scale: 4 }),
  
  // Results
  final_equity: decimal("final_equity", { precision: 20, scale: 2 }),
  total_pnl: decimal("total_pnl", { precision: 20, scale: 2 }),
  max_drawdown: decimal("max_drawdown", { precision: 20, scale: 2 }),
  var_95: decimal("var_95", { precision: 20, scale: 8 }),
  es_95: decimal("es_95", { precision: 20, scale: 8 }),
  breakers_activated: integer("breakers_activated").default(0).notNull(),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_monte_carlo_run").on(table.backtest_run_id),
  index("idx_monte_carlo_scenario_type").on(table.scenario_type),
]);

// Backtest Zod Schemas
export const insertBacktestRunSchema = createInsertSchema(backtest_runs).omit({
  id: true,
  progress_percentage: true,
  total_trades: true,
  winning_trades: true,
  losing_trades: true,
  final_equity: true,
  total_pnl: true,
  total_pnl_percentage: true,
  total_fees: true,
  total_slippage: true,
  started_at: true,
  completed_at: true,
  created_at: true,
});
export type InsertBacktestRun = z.infer<typeof insertBacktestRunSchema>;
export type BacktestRun = typeof backtest_runs.$inferSelect;

export const insertBacktestTradeSchema = createInsertSchema(backtest_trades).omit({
  id: true,
  created_at: true,
});
export type InsertBacktestTrade = z.infer<typeof insertBacktestTradeSchema>;
export type BacktestTrade = typeof backtest_trades.$inferSelect;

export const insertBacktestMetricsSchema = createInsertSchema(backtest_metrics).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertBacktestMetrics = z.infer<typeof insertBacktestMetricsSchema>;
export type BacktestMetrics = typeof backtest_metrics.$inferSelect;

export const insertMonteCarloScenarioSchema = createInsertSchema(monte_carlo_scenarios).omit({
  id: true,
  created_at: true,
});
export type InsertMonteCarloScenario = z.infer<typeof insertMonteCarloScenarioSchema>;
export type MonteCarloScenario = typeof monte_carlo_scenarios.$inferSelect;

// ========== MULTI-CAMPAIGN ENGINE ZOD SCHEMAS ==========

// Campaign Risk State
export const insertCampaignRiskStateSchema = createInsertSchema(campaign_risk_states).omit({
  id: true,
  updated_at: true,
});
export type InsertCampaignRiskState = z.infer<typeof insertCampaignRiskStateSchema>;
export type CampaignRiskState = typeof campaign_risk_states.$inferSelect;

// Campaign Asset Universe
export const insertCampaignAssetUniverseSchema = createInsertSchema(campaign_asset_universes).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertCampaignAssetUniverse = z.infer<typeof insertCampaignAssetUniverseSchema>;
export type CampaignAssetUniverse = typeof campaign_asset_universes.$inferSelect;

// Campaign Daily Report
export const insertCampaignDailyReportSchema = createInsertSchema(campaign_daily_reports).omit({
  id: true,
  created_at: true,
});
export type InsertCampaignDailyReport = z.infer<typeof insertCampaignDailyReportSchema>;
export type CampaignDailyReport = typeof campaign_daily_reports.$inferSelect;

// Campaign Orders
export const insertCampaignOrderSchema = createInsertSchema(campaign_orders).omit({
  id: true,
  created_at: true,
  updated_at: true,
  filled_at: true,
});
export type InsertCampaignOrder = z.infer<typeof insertCampaignOrderSchema>;
export type CampaignOrder = typeof campaign_orders.$inferSelect;

// Campaign Positions
export const insertCampaignPositionSchema = createInsertSchema(campaign_positions).omit({
  id: true,
  opened_at: true,
  closed_at: true,
  updated_at: true,
});
export type InsertCampaignPosition = z.infer<typeof insertCampaignPositionSchema>;
export type CampaignPosition = typeof campaign_positions.$inferSelect;

// ========== CAMPAIGN AUDIT LEDGER (Immutable Governance V2.0+) ==========

// Campaign Audit Ledger - append-only immutable log with hash chain for governance
export const campaign_audit_ledger = pgTable("campaign_audit_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Campaign reference
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  
  // Sequence number (monotonically increasing per campaign)
  sequence_number: integer("sequence_number").notNull(),
  
  // Event type: campaign_created, campaign_locked, campaign_started, campaign_paused, 
  // campaign_stopped, campaign_completed, position_opened, position_closed, 
  // circuit_breaker_triggered, reconciliation_completed, rebalance_executed, 
  // audit_24h_completed, parameter_change_blocked, integrity_violation
  event_type: varchar("event_type", { length: 50 }).notNull(),
  
  // Event severity: info, warning, critical, audit
  severity: varchar("severity", { length: 20 }).default("info").notNull(),
  
  // Immutable event data snapshot
  event_data: jsonb("event_data").notNull(),
  
  // Hash chain for integrity verification
  previous_hash: varchar("previous_hash", { length: 64 }), // SHA-256 of previous entry (null for first)
  entry_hash: varchar("entry_hash", { length: 64 }).notNull(), // SHA-256 of this entry
  
  // Digital signature (critical events)
  signature: text("signature"),
  signature_algorithm: varchar("signature_algorithm", { length: 20 }), // HMAC-SHA256, ED25519
  signed_by: varchar("signed_by", { length: 50 }), // system, admin_id, service_name
  
  // Actor context
  actor_type: varchar("actor_type", { length: 20 }).notNull(), // system, user, admin, robot
  actor_id: varchar("actor_id"), // user_id or service name
  
  // Immutable timestamp
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_campaign_audit_campaign").on(table.campaign_id),
  index("idx_campaign_audit_sequence").on(table.campaign_id, table.sequence_number),
  index("idx_campaign_audit_type").on(table.event_type),
  index("idx_campaign_audit_severity").on(table.severity),
  index("idx_campaign_audit_created").on(table.created_at),
  index("idx_campaign_audit_hash").on(table.entry_hash),
]);

export const insertCampaignAuditLedgerSchema = createInsertSchema(campaign_audit_ledger).omit({
  id: true,
  created_at: true,
});
export type InsertCampaignAuditLedger = z.infer<typeof insertCampaignAuditLedgerSchema>;
export type CampaignAuditLedger = typeof campaign_audit_ledger.$inferSelect;

// Exchange Reconciliation Records - tracks DELFOS vs Exchange position reconciliation
export const exchange_reconciliations = pgTable("exchange_reconciliations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Campaign reference
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  
  // Reconciliation type: positions, orders, balances, full
  reconciliation_type: varchar("reconciliation_type", { length: 20 }).notNull(),
  
  // Status: pending, in_progress, completed, failed, mismatch_detected
  status: varchar("status", { length: 30 }).notNull(),
  
  // Snapshot of DELFOS state at reconciliation time
  delfos_snapshot: jsonb("delfos_snapshot").notNull(),
  
  // Snapshot of Exchange state at reconciliation time
  exchange_snapshot: jsonb("exchange_snapshot").notNull(),
  
  // Discrepancies found (if any)
  discrepancies: jsonb("discrepancies"),
  discrepancy_count: integer("discrepancy_count").default(0).notNull(),
  
  // Resolution
  resolution_status: varchar("resolution_status", { length: 20 }), // null, auto_resolved, manual_required, resolved
  resolution_notes: text("resolution_notes"),
  resolved_at: timestamp("resolved_at"),
  resolved_by: varchar("resolved_by"),
  
  // Integrity hash
  reconciliation_hash: varchar("reconciliation_hash", { length: 64 }).notNull(),
  
  // Timestamps
  started_at: timestamp("started_at").defaultNow().notNull(),
  completed_at: timestamp("completed_at"),
}, (table) => [
  index("idx_exchange_recon_campaign").on(table.campaign_id),
  index("idx_exchange_recon_status").on(table.status),
  index("idx_exchange_recon_type").on(table.reconciliation_type),
  index("idx_exchange_recon_started").on(table.started_at),
]);

export const insertExchangeReconciliationSchema = createInsertSchema(exchange_reconciliations).omit({
  id: true,
  started_at: true,
  completed_at: true,
  resolved_at: true,
});
export type InsertExchangeReconciliation = z.infer<typeof insertExchangeReconciliationSchema>;
export type ExchangeReconciliation = typeof exchange_reconciliations.$inferSelect;

// ========== ROBOT ACTIVITY LOGS (Real-time Trading Feed) ==========

// Robot Activity Logs - stores real-time robot decisions and explanations
export const robot_activity_logs = pgTable("robot_activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  
  // Event classification
  event_type: text("event_type").notNull(), // signal_analysis, position_open, position_close, circuit_breaker, rebalance, error, info
  severity: text("severity").notNull().default("info"), // info, warning, success, error
  
  // Symbol context (optional, for trading events)
  symbol: text("symbol"),
  
  // Human-readable message (translation key or direct text)
  message_key: text("message_key").notNull(), // Translation key for i18n
  
  // Technical details (for detailed view)
  details: jsonb("details"), // { atr, ema12, ema36, signal, slAtr, tpAtr, price, side, quantity, pnl, etc. }
  
  // Timestamps
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_robot_activity_campaign").on(table.campaign_id),
  index("idx_robot_activity_type").on(table.event_type),
  index("idx_robot_activity_created").on(table.created_at),
  index("idx_robot_activity_symbol").on(table.symbol),
]);

export const insertRobotActivityLogSchema = createInsertSchema(robot_activity_logs).omit({
  id: true,
  created_at: true,
});
export type InsertRobotActivityLog = z.infer<typeof insertRobotActivityLogSchema>;
export type RobotActivityLog = typeof robot_activity_logs.$inferSelect;

// ========== ADMIN ALERTS (User Monitoring System) ==========

// Admin Alerts - stores notifications for admin about user activity
export const admin_alerts = pgTable("admin_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User who triggered the alert
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Alert type: user_login, campaign_created_paper, campaign_created_real
  alert_type: text("alert_type").notNull(),
  
  // Alert severity: info, warning, important
  severity: text("severity").notNull().default("info"),
  
  // Related entity (optional)
  campaign_id: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  portfolio_id: varchar("portfolio_id").references(() => portfolios.id, { onDelete: 'set null' }),
  
  // Alert details
  title: text("title").notNull(),
  message: text("message").notNull(),
  details: jsonb("details"), // Additional context data
  
  // Read status
  is_read: boolean("is_read").default(false).notNull(),
  read_at: timestamp("read_at"),
  read_by: varchar("read_by").references(() => users.id),
  
  // Timestamps
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_admin_alerts_user").on(table.user_id),
  index("idx_admin_alerts_type").on(table.alert_type),
  index("idx_admin_alerts_created").on(table.created_at),
  index("idx_admin_alerts_unread").on(table.is_read),
]);

export const insertAdminAlertSchema = createInsertSchema(admin_alerts).omit({
  id: true,
  created_at: true,
  read_at: true,
});
export type InsertAdminAlert = z.infer<typeof insertAdminAlertSchema>;
export type AdminAlert = typeof admin_alerts.$inferSelect;

// ========== FRANCHISOR (MATRIZ) SETTINGS ==========

// Franchisor Settings - Legal entity configuration for the franchise network owner
export const franchisor_settings = pgTable("franchisor_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Legal Entity Information
  legal_name: varchar("legal_name", { length: 300 }).notNull(), // Razão Social
  trade_name: varchar("trade_name", { length: 200 }).notNull(), // Nome Fantasia
  tax_id: varchar("tax_id", { length: 50 }).notNull(), // CNPJ or international tax ID
  tax_id_type: varchar("tax_id_type", { length: 10 }).default("cnpj").notNull(), // cnpj, ein, vat, etc.
  state_registration: varchar("state_registration", { length: 50 }), // Inscrição Estadual
  municipal_registration: varchar("municipal_registration", { length: 50 }), // Inscrição Municipal
  
  // Address (Headquarters)
  address_street: varchar("address_street", { length: 300 }),
  address_number: varchar("address_number", { length: 20 }),
  address_complement: varchar("address_complement", { length: 100 }),
  address_neighborhood: varchar("address_neighborhood", { length: 100 }),
  address_city: varchar("address_city", { length: 100 }),
  address_state: varchar("address_state", { length: 50 }),
  address_zip: varchar("address_zip", { length: 20 }),
  address_country: varchar("address_country", { length: 3 }).default("BRA").notNull(), // ISO 3166-1 alpha-3
  
  // Banking Information (for receiving royalties)
  bank_name: varchar("bank_name", { length: 100 }),
  bank_code: varchar("bank_code", { length: 10 }),
  bank_agency: varchar("bank_agency", { length: 20 }),
  bank_account: varchar("bank_account", { length: 30 }),
  bank_account_type: varchar("bank_account_type", { length: 20 }), // checking, savings
  bank_pix_key: varchar("bank_pix_key", { length: 100 }),
  bank_swift: varchar("bank_swift", { length: 20 }), // For international
  bank_iban: varchar("bank_iban", { length: 50 }), // For international
  
  // Fiscal Configuration
  tax_regime: varchar("tax_regime", { length: 50 }), // simples_nacional, lucro_presumido, lucro_real
  nfse_enabled: boolean("nfse_enabled").default(false),
  invoice_series: varchar("invoice_series", { length: 10 }),
  
  // Contact Information
  contact_email: varchar("contact_email", { length: 200 }),
  contact_phone: varchar("contact_phone", { length: 30 }),
  contact_whatsapp: varchar("contact_whatsapp", { length: 30 }),
  support_email: varchar("support_email", { length: 200 }),
  commercial_email: varchar("commercial_email", { length: 200 }),
  website: varchar("website", { length: 200 }),
  
  // Social Media
  social_linkedin: varchar("social_linkedin", { length: 200 }),
  social_instagram: varchar("social_instagram", { length: 200 }),
  social_twitter: varchar("social_twitter", { length: 200 }),
  
  // Branding
  logo_url: text("logo_url"),
  primary_color: varchar("primary_color", { length: 10 }),
  secondary_color: varchar("secondary_color", { length: 10 }),
  
  // Metadata
  is_configured: boolean("is_configured").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  updated_by: varchar("updated_by").references(() => users.id),
});

export const insertFranchisorSettingsSchema = createInsertSchema(franchisor_settings).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertFranchisorSettings = z.infer<typeof insertFranchisorSettingsSchema>;
export type FranchisorSettings = typeof franchisor_settings.$inferSelect;

// ========== CONTRACT MANAGEMENT ==========

// Contract Templates - Models for franchise agreements and legal documents
export const contract_templates = pgTable("contract_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Template identification
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(), // franchise_agreement, master_agreement, terms_of_use, privacy_policy
  type: varchar("type", { length: 50 }).notNull(), // franchise, master_franchise, terms, privacy, other
  
  // Content
  content: text("content").notNull(), // HTML or Markdown content
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
  
  // Requirements
  requires_acceptance: boolean("requires_acceptance").default(true).notNull(),
  is_mandatory: boolean("is_mandatory").default(true).notNull(),
  applies_to: varchar("applies_to", { length: 50 }).notNull(), // franchise, master_franchise, all
  
  // Status
  is_active: boolean("is_active").default(true).notNull(),
  published_at: timestamp("published_at"),
  
  // Metadata
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  created_by: varchar("created_by").references(() => users.id),
  updated_by: varchar("updated_by").references(() => users.id),
}, (table) => [
  index("idx_contract_templates_code").on(table.code),
  index("idx_contract_templates_type").on(table.type),
  index("idx_contract_templates_active").on(table.is_active),
]);

export const insertContractTemplateSchema = createInsertSchema(contract_templates).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type ContractTemplate = typeof contract_templates.$inferSelect;

// Contract Acceptances - Records of user acceptances of contracts
export const contract_acceptances = pgTable("contract_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Who accepted
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  franchise_id: varchar("franchise_id").references(() => franchises.id, { onDelete: 'set null' }),
  
  // What was accepted
  template_id: varchar("template_id").notNull().references(() => contract_templates.id),
  template_version: varchar("template_version", { length: 20 }).notNull(), // Version at time of acceptance
  template_code: varchar("template_code", { length: 50 }).notNull(), // For quick lookups
  
  // Acceptance details
  accepted_at: timestamp("accepted_at").defaultNow().notNull(),
  ip_address: varchar("ip_address", { length: 50 }),
  user_agent: text("user_agent"),
  
  // Confirmation
  checkbox_text: text("checkbox_text"), // The exact text user agreed to
  is_valid: boolean("is_valid").default(true).notNull(),
  invalidated_at: timestamp("invalidated_at"),
  invalidated_reason: text("invalidated_reason"),
}, (table) => [
  index("idx_contract_acceptances_user").on(table.user_id),
  index("idx_contract_acceptances_franchise").on(table.franchise_id),
  index("idx_contract_acceptances_template").on(table.template_id),
  index("idx_contract_acceptances_code").on(table.template_code),
  uniqueIndex("idx_contract_acceptances_unique").on(table.user_id, table.template_id, table.template_version),
]);

export const insertContractAcceptanceSchema = createInsertSchema(contract_acceptances).omit({
  id: true,
  accepted_at: true,
});
export type InsertContractAcceptance = z.infer<typeof insertContractAcceptanceSchema>;
export type ContractAcceptance = typeof contract_acceptances.$inferSelect;

// ========== FRANCHISE SYSTEM ==========

// Franchise Plans - defines subscription tiers (Starter, Pro, Enterprise)
export const franchise_plans = pgTable("franchise_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull().unique(), // Starter, Professional, Enterprise
  code: varchar("code", { length: 20 }).notNull().unique(), // starter, pro, enterprise
  
  // Plan limits
  max_campaigns: integer("max_campaigns").default(3).notNull(), // Max simultaneous campaigns
  max_capital_usd: decimal("max_capital_usd", { precision: 20, scale: 2 }), // Max capital under management (null = unlimited)
  
  // Royalty configuration
  royalty_percentage: decimal("royalty_percentage", { precision: 5, scale: 2 }).default("10").notNull(), // % of net profit
  
  // Franchise fee (one-time payment to join)
  franchise_fee_usd: decimal("franchise_fee_usd", { precision: 12, scale: 2 }).default("0").notNull(), // One-time entry fee
  
  // Risk limits by plan (controls what franqueado can configure)
  max_drawdown_pct: decimal("max_drawdown_pct", { precision: 5, scale: 2 }).default("15").notNull(), // Max allowed drawdown %
  max_position_size_pct: decimal("max_position_size_pct", { precision: 5, scale: 2 }).default("10").notNull(), // Max position size %
  max_daily_trades: integer("max_daily_trades").default(50).notNull(), // Max trades per day
  
  // RBM (Risk-Based Multiplier) limit by plan
  // Starter=2.0, Professional=3.0, Enterprise=4.0, Full=5.0
  max_rbm_multiplier: decimal("max_rbm_multiplier", { precision: 3, scale: 1 }).default("2.0").notNull(), // Max risk multiplier allowed
  
  // Features
  features: jsonb("features"), // { support: true, exclusive_signals: true, premium_audit: true }
  
  // Status
  is_active: boolean("is_active").default(true).notNull(),
  display_order: integer("display_order").default(0).notNull(),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFranchisePlanSchema = createInsertSchema(franchise_plans).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertFranchisePlan = z.infer<typeof insertFranchisePlanSchema>;
export type FranchisePlan = typeof franchise_plans.$inferSelect;

// Franchises - stores franchise units (business entities)
export const franchises = pgTable("franchises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Business info
  name: varchar("name", { length: 200 }).notNull(), // Franchise unit name
  cnpj: varchar("cnpj", { length: 18 }).unique(), // Brazilian business ID (optional for international)
  tax_id: varchar("tax_id", { length: 50 }), // International tax ID
  tax_id_type: varchar("tax_id_type", { length: 10 }), // 'cpf' | 'cnpj' | null - type of cnpj field
  address: text("address"),
  country: varchar("country", { length: 3 }).default("BRA").notNull(), // ISO 3166-1 alpha-3
  
  // Contract info
  plan_id: varchar("plan_id").notNull().references(() => franchise_plans.id),
  contract_start: timestamp("contract_start").notNull(),
  contract_end: timestamp("contract_end"), // Null = auto-renewing
  contract_pdf_url: text("contract_pdf_url"), // Uploaded contract document
  
  // Custom royalty (overrides plan default if set)
  custom_royalty_percentage: decimal("custom_royalty_percentage", { precision: 5, scale: 2 }),
  
  // Banking for royalty payments
  bank_name: varchar("bank_name", { length: 100 }),
  bank_account: varchar("bank_account", { length: 50 }),
  bank_agency: varchar("bank_agency", { length: 20 }),
  pix_key: varchar("pix_key", { length: 100 }),
  
  // Status: active, suspended, audit, terminated
  status: varchar("status", { length: 20 }).default("active").notNull(),
  suspended_reason: text("suspended_reason"),
  suspended_at: timestamp("suspended_at"),
  
  // Audit flags
  under_audit: boolean("under_audit").default(false).notNull(),
  audit_started_at: timestamp("audit_started_at"),
  audit_notes: text("audit_notes"),
  
  // Owner user (master admin of this franchise)
  owner_user_id: varchar("owner_user_id").references(() => users.id),
  
  // Onboarding status: pending_contract, pending_payment, pending_approval, active, rejected
  onboarding_status: varchar("onboarding_status", { length: 30 }).default("pending_contract").notNull(),
  onboarding_started_at: timestamp("onboarding_started_at"),
  onboarding_completed_at: timestamp("onboarding_completed_at"),
  
  // Contract acceptance
  contract_accepted: boolean("contract_accepted").default(false).notNull(),
  contract_accepted_at: timestamp("contract_accepted_at"),
  contract_accepted_by: varchar("contract_accepted_by").references(() => users.id),
  contract_version: varchar("contract_version", { length: 20 }), // Version of contract accepted
  
  // Fee payment status
  fee_paid: boolean("fee_paid").default(false).notNull(),
  fee_paid_at: timestamp("fee_paid_at"),
  fee_payment_reference: varchar("fee_payment_reference", { length: 100 }),
  fee_payment_method: varchar("fee_payment_method", { length: 30 }), // pix, stripe, bank_transfer
  
  // Approval by franqueadora
  approved_by: varchar("approved_by").references(() => users.id),
  approved_at: timestamp("approved_at"),
  rejection_reason: text("rejection_reason"),
  
  // Master Franchise configuration
  is_master_franchise: boolean("is_master_franchise").default(false).notNull(),
  parent_master_id: varchar("parent_master_id").references(() => franchises.id), // If this is a sub-franchise
  
  // Territory configuration
  territory_country: varchar("territory_country", { length: 3 }), // ISO 3166-1 alpha-3
  territory_state: varchar("territory_state", { length: 50 }),
  territory_city: varchar("territory_city", { length: 100 }),
  territory_region: varchar("territory_region", { length: 100 }), // Custom region name
  territory_exclusive: boolean("territory_exclusive").default(false), // Has exclusive rights
  
  // Tax Profile for Trading (transferred from Settings)
  tax_country: varchar("tax_country", { length: 3 }), // BR, US, EU, AE, SG
  tax_year: integer("tax_year"),
  tax_short_term_rate: decimal("tax_short_term_rate", { precision: 5, scale: 2 }), // % short-term capital gains
  tax_long_term_rate: decimal("tax_long_term_rate", { precision: 5, scale: 2 }), // % long-term capital gains
  tax_min_taxable: decimal("tax_min_taxable", { precision: 12, scale: 2 }), // Minimum taxable amount (USD)
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_franchises_status").on(table.status),
  index("idx_franchises_plan").on(table.plan_id),
  index("idx_franchises_owner").on(table.owner_user_id),
  index("idx_franchises_onboarding").on(table.onboarding_status),
]);

export const insertFranchiseSchema = createInsertSchema(franchises).omit({
  id: true,
  created_at: true,
  updated_at: true,
  suspended_at: true,
  audit_started_at: true,
  onboarding_completed_at: true,
  contract_accepted_at: true,
  fee_paid_at: true,
  approved_at: true,
});
export type InsertFranchise = z.infer<typeof insertFranchiseSchema>;
export type Franchise = typeof franchises.$inferSelect;

// Franchise Users - links users to franchises with specific roles
export const franchise_users = pgTable("franchise_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  franchise_id: varchar("franchise_id").notNull().references(() => franchises.id, { onDelete: 'cascade' }),
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Role within franchise: master, operator, analyst, finance
  role: varchar("role", { length: 20 }).notNull().default("operator"),
  
  // Permissions (granular control)
  permissions: jsonb("permissions"), // { view_reports: true, create_campaigns: true, manage_users: false }
  
  is_active: boolean("is_active").default(true).notNull(),
  invited_by: varchar("invited_by").references(() => users.id),
  invited_at: timestamp("invited_at").defaultNow().notNull(),
  accepted_at: timestamp("accepted_at"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_franchise_users_franchise").on(table.franchise_id),
  index("idx_franchise_users_user").on(table.user_id),
  index("idx_franchise_users_role").on(table.role),
  uniqueIndex("idx_franchise_users_unique").on(table.franchise_id, table.user_id),
]);

export const insertFranchiseUserSchema = createInsertSchema(franchise_users).omit({
  id: true,
  created_at: true,
  updated_at: true,
  accepted_at: true,
});
export type InsertFranchiseUser = z.infer<typeof insertFranchiseUserSchema>;
export type FranchiseUser = typeof franchise_users.$inferSelect;

// Franchise Exchange Accounts - stores encrypted exchange credentials per franchise
// Each franchise has its own Kraken (or other exchange) credentials for isolated trading
export const franchise_exchange_accounts = pgTable("franchise_exchange_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  franchise_id: varchar("franchise_id").notNull().references(() => franchises.id, { onDelete: 'cascade' }),
  
  // Exchange identification
  exchange: varchar("exchange", { length: 20 }).default("kraken").notNull(), // kraken, binance, coinbase, etc.
  exchange_label: varchar("exchange_label", { length: 100 }), // Custom label: "Kraken Main", "Kraken Backup"
  
  // Encrypted API credentials (AES-256-GCM via encryptionService)
  api_key_encrypted: text("api_key_encrypted").notNull(),
  api_secret_encrypted: text("api_secret_encrypted").notNull(),
  
  // Optional: API passphrase for exchanges that require it (e.g., Coinbase Pro)
  api_passphrase_encrypted: text("api_passphrase_encrypted"),
  
  // Permission flags (what this API key can do)
  can_read_balance: boolean("can_read_balance").default(true).notNull(),
  can_trade: boolean("can_trade").default(false).notNull(), // Requires explicit opt-in
  can_withdraw: boolean("can_withdraw").default(false).notNull(), // Should almost always be false
  
  // Status
  is_active: boolean("is_active").default(true).notNull(),
  is_verified: boolean("is_verified").default(false).notNull(), // Set after successful API test
  verified_at: timestamp("verified_at"),
  last_used_at: timestamp("last_used_at"),
  
  // Rate limiting and usage tracking
  daily_request_count: integer("daily_request_count").default(0).notNull(),
  last_request_at: timestamp("last_request_at"),
  
  // Error tracking
  consecutive_errors: integer("consecutive_errors").default(0).notNull(),
  last_error: text("last_error"),
  last_error_at: timestamp("last_error_at"),
  
  // Audit
  created_by: varchar("created_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_franchise_exchange_franchise").on(table.franchise_id),
  index("idx_franchise_exchange_active").on(table.is_active),
  uniqueIndex("idx_franchise_exchange_unique").on(table.franchise_id, table.exchange), // One account per exchange per franchise
]);

export const insertFranchiseExchangeAccountSchema = createInsertSchema(franchise_exchange_accounts).omit({
  id: true,
  is_verified: true,
  verified_at: true,
  last_used_at: true,
  daily_request_count: true,
  last_request_at: true,
  consecutive_errors: true,
  last_error: true,
  last_error_at: true,
  created_at: true,
  updated_at: true,
});
export type InsertFranchiseExchangeAccount = z.infer<typeof insertFranchiseExchangeAccountSchema>;
export type FranchiseExchangeAccount = typeof franchise_exchange_accounts.$inferSelect;

// Franchise Royalties - monthly royalty calculations and payments
export const franchise_royalties = pgTable("franchise_royalties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  franchise_id: varchar("franchise_id").notNull().references(() => franchises.id, { onDelete: 'cascade' }),
  
  // Period
  period_start: timestamp("period_start").notNull(),
  period_end: timestamp("period_end").notNull(),
  period_month: integer("period_month").notNull(), // 1-12
  period_year: integer("period_year").notNull(),
  
  // Financial calculations
  gross_pnl: decimal("gross_pnl", { precision: 20, scale: 2 }).notNull(), // Total PnL before fees
  fees_deducted: decimal("fees_deducted", { precision: 20, scale: 2 }).default("0").notNull(), // Exchange fees, slippage
  audit_adjustments: decimal("audit_adjustments", { precision: 20, scale: 2 }).default("0").notNull(), // Adjustments from audit
  net_profit: decimal("net_profit", { precision: 20, scale: 2 }).notNull(), // gross_pnl - fees - adjustments
  
  royalty_percentage: decimal("royalty_percentage", { precision: 5, scale: 2 }).notNull(), // Rate applied
  royalty_amount: decimal("royalty_amount", { precision: 20, scale: 2 }).notNull(), // net_profit * percentage
  
  // Breakdown by campaign
  campaign_breakdown: jsonb("campaign_breakdown"), // [{ campaign_id, name, pnl, royalty }]
  
  // Payment status: pending, invoiced, paid, disputed
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  
  // Payment details
  invoice_url: text("invoice_url"),
  payment_method: varchar("payment_method", { length: 20 }), // pix, stripe, bank_transfer
  payment_reference: varchar("payment_reference", { length: 100 }),
  paid_at: timestamp("paid_at"),
  
  // Audit signature (hash for immutability)
  audit_hash: varchar("audit_hash", { length: 64 }), // SHA-256 of calculation data
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_franchise_royalties_franchise").on(table.franchise_id),
  index("idx_franchise_royalties_period").on(table.period_year, table.period_month),
  index("idx_franchise_royalties_status").on(table.status),
]);

export const insertFranchiseRoyaltySchema = createInsertSchema(franchise_royalties).omit({
  id: true,
  created_at: true,
  updated_at: true,
  paid_at: true,
});
export type InsertFranchiseRoyalty = z.infer<typeof insertFranchiseRoyaltySchema>;
export type FranchiseRoyalty = typeof franchise_royalties.$inferSelect;

// Franchise Fees - one-time entry fees paid to join the franchise
export const franchise_fees = pgTable("franchise_fees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  franchise_id: varchar("franchise_id").notNull().references(() => franchises.id, { onDelete: 'cascade' }),
  plan_id: varchar("plan_id").notNull().references(() => franchise_plans.id),
  
  // Fee details
  fee_type: varchar("fee_type", { length: 30 }).default("entry").notNull(), // entry, renewal, upgrade
  amount_usd: decimal("amount_usd", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  amount_local: decimal("amount_local", { precision: 12, scale: 2 }), // Amount in local currency if different
  exchange_rate: decimal("exchange_rate", { precision: 10, scale: 6 }), // USD to local currency rate
  
  // Payment status: pending, processing, paid, failed, refunded
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  
  // Payment details
  payment_method: varchar("payment_method", { length: 30 }), // pix, stripe, bank_transfer, crypto
  payment_reference: varchar("payment_reference", { length: 100 }),
  payment_gateway_id: varchar("payment_gateway_id", { length: 100 }), // External payment ID
  
  // Invoice info
  invoice_number: varchar("invoice_number", { length: 50 }),
  invoice_url: text("invoice_url"),
  
  // Due date and payment dates
  due_date: timestamp("due_date"),
  paid_at: timestamp("paid_at"),
  
  // Refund info
  refunded_at: timestamp("refunded_at"),
  refund_reason: text("refund_reason"),
  refund_amount: decimal("refund_amount", { precision: 12, scale: 2 }),
  
  // Audit
  processed_by: varchar("processed_by").references(() => users.id),
  notes: text("notes"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_franchise_fees_franchise").on(table.franchise_id),
  index("idx_franchise_fees_status").on(table.status),
  index("idx_franchise_fees_type").on(table.fee_type),
]);

export const insertFranchiseFeeSchema = createInsertSchema(franchise_fees).omit({
  id: true,
  created_at: true,
  updated_at: true,
  paid_at: true,
  refunded_at: true,
});
export type InsertFranchiseFee = z.infer<typeof insertFranchiseFeeSchema>;
export type FranchiseFee = typeof franchise_fees.$inferSelect;

// Audit Logs - immutable append-only log for franchise compliance (blockchain-style)
export const franchise_audit_logs = pgTable("franchise_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  franchise_id: varchar("franchise_id").notNull().references(() => franchises.id, { onDelete: 'cascade' }),
  campaign_id: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  user_id: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Event type: campaign_created, campaign_paused, campaign_ended, trade_executed, pnl_recorded, royalty_calculated
  event_type: varchar("event_type", { length: 50 }).notNull(),
  
  // Event data (immutable snapshot)
  event_data: jsonb("event_data").notNull(), // Full event payload
  
  // Cryptographic integrity
  previous_hash: varchar("previous_hash", { length: 64 }), // Hash of previous log entry (chain)
  entry_hash: varchar("entry_hash", { length: 64 }).notNull(), // SHA-256 of this entry
  
  // Digital signature (optional, for critical events)
  signature: text("signature"),
  signed_by: varchar("signed_by", { length: 50 }), // system, admin, auditor
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_franchise_audit_franchise").on(table.franchise_id),
  index("idx_franchise_audit_campaign").on(table.campaign_id),
  index("idx_franchise_audit_type").on(table.event_type),
  index("idx_franchise_audit_created").on(table.created_at),
]);

export const insertFranchiseAuditLogSchema = createInsertSchema(franchise_audit_logs).omit({
  id: true,
  created_at: true,
});
export type InsertFranchiseAuditLog = z.infer<typeof insertFranchiseAuditLogSchema>;
export type FranchiseAuditLog = typeof franchise_audit_logs.$inferSelect;

// Franchise Invoices - consolidated billing documents for royalties and fees
export const franchise_invoices = pgTable("franchise_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  franchise_id: varchar("franchise_id").notNull().references(() => franchises.id, { onDelete: 'cascade' }),
  
  // Invoice identification
  invoice_number: varchar("invoice_number", { length: 50 }).notNull(),
  
  // Invoice type: royalty, fee, mixed
  invoice_type: varchar("invoice_type", { length: 20 }).default("royalty").notNull(),
  
  // Period covered
  period_start: timestamp("period_start").notNull(),
  period_end: timestamp("period_end").notNull(),
  
  // Amounts
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  tax_amount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  total_amount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  
  // Status: draft, sent, paid, overdue, cancelled
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  
  // Related records (JSON array of IDs)
  royalty_ids: jsonb("royalty_ids"), // Array of franchise_royalties IDs
  fee_ids: jsonb("fee_ids"), // Array of franchise_fees IDs
  
  // Invoice details
  line_items: jsonb("line_items"), // Detailed breakdown
  notes: text("notes"),
  
  // Payment details
  payment_method: varchar("payment_method", { length: 30 }),
  payment_reference: varchar("payment_reference", { length: 100 }),
  
  // Dates
  issued_at: timestamp("issued_at"),
  due_date: timestamp("due_date"),
  paid_at: timestamp("paid_at"),
  sent_at: timestamp("sent_at"),
  
  // PDF/document storage
  document_url: text("document_url"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_franchise_invoices_franchise").on(table.franchise_id),
  index("idx_franchise_invoices_status").on(table.status),
  index("idx_franchise_invoices_number").on(table.invoice_number),
]);

export const insertFranchiseInvoiceSchema = createInsertSchema(franchise_invoices).omit({
  id: true,
  created_at: true,
  updated_at: true,
  issued_at: true,
  paid_at: true,
  sent_at: true,
});
export type InsertFranchiseInvoice = z.infer<typeof insertFranchiseInvoiceSchema>;
export type FranchiseInvoice = typeof franchise_invoices.$inferSelect;

// Fraud Alerts - detects suspicious trading patterns for anti-fraud monitoring
export const fraud_alerts = pgTable("fraud_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Related entities
  franchise_id: varchar("franchise_id").references(() => franchises.id, { onDelete: 'cascade' }),
  campaign_id: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  user_id: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Alert type: abnormal_volume, atypical_hours, rapid_position_changes, suspicious_win_rate, unusual_pattern
  alert_type: varchar("alert_type", { length: 50 }).notNull(),
  
  // Severity: low, medium, high, critical
  severity: varchar("severity", { length: 20 }).notNull(),
  
  // Status: new, investigating, dismissed, confirmed
  status: varchar("status", { length: 20 }).default("new").notNull(),
  
  // Alert details
  title: text("title").notNull(),
  description: text("description").notNull(),
  
  // Detection data (evidence snapshot)
  detection_data: jsonb("detection_data"), // { metric_name, actual_value, threshold, deviation_pct, ... }
  
  // Symbol/asset involved (if applicable)
  symbol: text("symbol"),
  
  // Time window of suspicious activity
  activity_start: timestamp("activity_start"),
  activity_end: timestamp("activity_end"),
  
  // Resolution details
  investigated_by: varchar("investigated_by").references(() => users.id, { onDelete: 'set null' }),
  investigated_at: timestamp("investigated_at"),
  resolution_notes: text("resolution_notes"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_fraud_alerts_franchise").on(table.franchise_id),
  index("idx_fraud_alerts_campaign").on(table.campaign_id),
  index("idx_fraud_alerts_user").on(table.user_id),
  index("idx_fraud_alerts_type").on(table.alert_type),
  index("idx_fraud_alerts_severity").on(table.severity),
  index("idx_fraud_alerts_status").on(table.status),
  index("idx_fraud_alerts_created").on(table.created_at),
]);

export const insertFraudAlertSchema = createInsertSchema(fraud_alerts).omit({
  id: true,
  created_at: true,
  updated_at: true,
  investigated_at: true,
});
export type InsertFraudAlert = z.infer<typeof insertFraudAlertSchema>;
export type FraudAlert = typeof fraud_alerts.$inferSelect;

// ========== OPPORTUNITY BLUEPRINT SYSTEM ==========

// Market Regimes - classification of market conditions
export const MARKET_REGIMES = [
  'VOLATILITY_EXPANSION',
  'VOLATILITY_CONTRACTION', 
  'MOMENTUM_BULL',
  'MOMENTUM_BEAR',
  'MEAN_REVERSION',
  'LIQUIDITY_EVENT',
  'SECTOR_ROTATION',
  'RANGE_BOUND'
] as const;

// Opportunity Types - thesis classification
export const OPPORTUNITY_TYPES = [
  'CO-01', // Statistical Reversion
  'CO-02', // Volatility Expansion
  'CO-03', // Sector Momentum
  'CO-04', // Liquidity Event
  'CO-05', // Correlation Breakdown
  'CO-06', // Cross-Asset Divergence
] as const;

// Opportunity Blueprints - AI-detected trading opportunities (immutable objects)
export const opportunity_blueprints = pgTable("opportunity_blueprints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User/Franchise context
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  franchise_id: varchar("franchise_id").references(() => franchises.id, { onDelete: 'set null' }),
  
  // Blueprint classification
  type: varchar("type", { length: 10 }).notNull(), // CO-01, CO-02, etc.
  regime: varchar("regime", { length: 30 }).notNull(), // VOLATILITY_EXPANSION, MEAN_REVERSION, etc.
  
  // Scoring (0-100)
  opportunity_score: integer("opportunity_score").notNull(), // Overall score
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(), // 0.0000 - 1.0000
  
  // Assets recommended
  assets: text("assets").array().notNull(), // Array of symbols: ["BTC/USD", "ETH/USD"]
  
  // Campaign parameters (JSON for flexibility)
  campaign_parameters: jsonb("campaign_parameters").notNull(), // { duration_days, capital_allocation_pct, etc. }
  
  // Risk parameters specific to this opportunity
  risk_parameters: jsonb("risk_parameters").notNull(), // { max_position_size, stop_loss_pct, take_profit_pct, etc. }
  
  // Execution logic
  execution_logic: jsonb("execution_logic").notNull(), // { entry_conditions, exit_conditions, time_constraints }
  
  // AI explanation (human-readable and auditable)
  explanation: jsonb("explanation").notNull(), // { thesis, rationale, historical_evidence, risk_factors }
  
  // Status: ACTIVE, EXPIRED, CONSUMED
  status: varchar("status", { length: 20 }).default("ACTIVE").notNull(),
  
  // Lifecycle timestamps
  expires_at: timestamp("expires_at").notNull(), // Blueprint validity window
  consumed_at: timestamp("consumed_at"), // When blueprint was accepted
  consumed_by_campaign_id: varchar("consumed_by_campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  
  // Immutability hash (SHA-256 of blueprint data at creation)
  creation_hash: varchar("creation_hash", { length: 64 }).notNull(),
  
  // Detection metadata
  detection_source: varchar("detection_source", { length: 30 }).default("ai_engine").notNull(), // ai_engine, manual, hybrid
  detection_model: varchar("detection_model", { length: 50 }), // gpt-4o, custom_model, etc.
  detection_latency_ms: integer("detection_latency_ms"),
  
  // Market context at detection time
  market_context: jsonb("market_context"), // { btc_price, total_market_cap, volatility_index, etc. }
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_blueprints_user").on(table.user_id),
  index("idx_blueprints_franchise").on(table.franchise_id),
  index("idx_blueprints_status").on(table.status),
  index("idx_blueprints_type").on(table.type),
  index("idx_blueprints_regime").on(table.regime),
  index("idx_blueprints_score").on(table.opportunity_score),
  index("idx_blueprints_expires").on(table.expires_at),
  index("idx_blueprints_created").on(table.created_at),
]);

export const insertOpportunityBlueprintSchema = createInsertSchema(opportunity_blueprints).omit({
  id: true,
  consumed_at: true,
  created_at: true,
  updated_at: true,
});
export type InsertOpportunityBlueprint = z.infer<typeof insertOpportunityBlueprintSchema>;
export type OpportunityBlueprint = typeof opportunity_blueprints.$inferSelect;

// Opportunity Windows - persisted detection results from OpportunityEngine
export const opportunity_windows = pgTable("opportunity_windows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Window type (REGIME_TRANSITION, CLUSTER_MOMENTUM, etc.)
  type: varchar("type", { length: 30 }).notNull(),
  
  // VRE regime at detection time
  vre_regime: varchar("vre_regime", { length: 20 }).notNull(),
  
  // Cluster context
  cluster_id: integer("cluster_id").notNull(),
  cluster_name: varchar("cluster_name", { length: 50 }).notNull(),
  
  // Scoring
  score: decimal("score", { precision: 5, scale: 4 }).notNull(),
  cos_score: decimal("cos_score", { precision: 5, scale: 4 }).notNull(),
  
  // Window details
  thesis: text("thesis").notNull(),
  strength: varchar("strength", { length: 20 }).notNull(),
  expected_duration_hours: integer("expected_duration_hours").notNull(),
  
  // Recommended assets
  recommended_assets: text("recommended_assets").array().notNull(),
  
  // Content fingerprint for deduplication across expiry cycles (SHA-256 of type+regime+cluster)
  content_hash: varchar("content_hash", { length: 64 }).notNull(),
  
  // Lifecycle
  expires_at: timestamp("expires_at").notNull(),
  consumed: boolean("consumed").default(false).notNull(),
  consumed_by_blueprint_id: varchar("consumed_by_blueprint_id"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_windows_expires").on(table.expires_at),
  index("idx_windows_type").on(table.type),
  index("idx_windows_consumed").on(table.consumed),
  index("idx_windows_hash").on(table.content_hash),
  uniqueIndex("uq_windows_type_regime_cluster").on(table.type, table.vre_regime, table.cluster_id),
]);

export const insertOpportunityWindowSchema = createInsertSchema(opportunity_windows).omit({
  id: true,
  consumed: true,
  consumed_by_blueprint_id: true,
  created_at: true,
});
export type InsertOpportunityWindow = z.infer<typeof insertOpportunityWindowSchema>;
export type OpportunityWindow = typeof opportunity_windows.$inferSelect;

// Rate Limit Counters - persistent rate limiting across restarts
export const rate_limit_counters = pgTable("rate_limit_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Endpoint identifier (e.g., 'opportunity_detection', 'blueprint_generation')
  endpoint: varchar("endpoint", { length: 50 }).notNull(),
  
  // Counter for current window
  count: integer("count").default(0).notNull(),
  
  // Window start time (counters reset when window expires)
  window_start: timestamp("window_start").defaultNow().notNull(),
  
  // Window duration in seconds (e.g., 60 for per-minute limits)
  window_seconds: integer("window_seconds").default(60).notNull(),
  
  // Maximum allowed requests per window
  max_requests: integer("max_requests").default(5).notNull(),
  
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_rate_limit_endpoint").on(table.endpoint),
]);

export const insertRateLimitCounterSchema = createInsertSchema(rate_limit_counters).omit({
  id: true,
  updated_at: true,
});
export type InsertRateLimitCounter = z.infer<typeof insertRateLimitCounterSchema>;
export type RateLimitCounter = typeof rate_limit_counters.$inferSelect;

// Opportunity Triggers - automation rules for blueprints
export const opportunity_triggers = pgTable("opportunity_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User context (triggers are user-specific)
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Trigger type: alert, expiration, accept, creation, block, audit
  trigger_type: varchar("trigger_type", { length: 20 }).notNull(),
  
  // Trigger name and description
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  
  // Trigger conditions (JSON logic)
  conditions: jsonb("conditions").notNull(), // { score_min: 75, confidence_min: 0.70, regimes: [...] }
  
  // Actions to execute when triggered
  actions: jsonb("actions").notNull(), // { notify_whatsapp: true, notify_email: true, auto_accept: false }
  
  // Rate limiting
  cooldown_minutes: integer("cooldown_minutes").default(60).notNull(), // Min time between triggers
  max_triggers_per_day: integer("max_triggers_per_day").default(10).notNull(),
  
  // Status
  is_active: boolean("is_active").default(true).notNull(),
  
  // Execution counters
  trigger_count: integer("trigger_count").default(0).notNull(),
  last_triggered_at: timestamp("last_triggered_at"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_triggers_user").on(table.user_id),
  index("idx_triggers_type").on(table.trigger_type),
  index("idx_triggers_active").on(table.is_active),
]);

export const insertOpportunityTriggerSchema = createInsertSchema(opportunity_triggers).omit({
  id: true,
  trigger_count: true,
  last_triggered_at: true,
  created_at: true,
  updated_at: true,
});
export type InsertOpportunityTrigger = z.infer<typeof insertOpportunityTriggerSchema>;
export type OpportunityTrigger = typeof opportunity_triggers.$inferSelect;

// Opportunity Trigger Events - log of all trigger executions
export const opportunity_trigger_events = pgTable("opportunity_trigger_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // References
  trigger_id: varchar("trigger_id").notNull().references(() => opportunity_triggers.id, { onDelete: 'cascade' }),
  blueprint_id: varchar("blueprint_id").references(() => opportunity_blueprints.id, { onDelete: 'set null' }),
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Event type: alert_sent, expiration_processed, accept_validated, campaign_created, blocked, audit_logged
  event_type: varchar("event_type", { length: 30 }).notNull(),
  
  // Event status: success, failed, blocked, rate_limited
  status: varchar("status", { length: 20 }).notNull(),
  
  // Event details
  event_data: jsonb("event_data"), // { notification_channel, campaign_id, error_message, etc. }
  
  // Error tracking
  error_message: text("error_message"),
  
  // Processing metrics
  processing_time_ms: integer("processing_time_ms"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_trigger_events_trigger").on(table.trigger_id),
  index("idx_trigger_events_blueprint").on(table.blueprint_id),
  index("idx_trigger_events_user").on(table.user_id),
  index("idx_trigger_events_type").on(table.event_type),
  index("idx_trigger_events_status").on(table.status),
  index("idx_trigger_events_created").on(table.created_at),
]);

export const insertOpportunityTriggerEventSchema = createInsertSchema(opportunity_trigger_events).omit({
  id: true,
  created_at: true,
});
export type InsertOpportunityTriggerEvent = z.infer<typeof insertOpportunityTriggerEventSchema>;
export type OpportunityTriggerEvent = typeof opportunity_trigger_events.$inferSelect;

// Opportunity Campaigns - campaigns created from blueprints (Campaign Opportunities / CO)
export const opportunity_campaigns = pgTable("opportunity_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Source blueprint
  blueprint_id: varchar("blueprint_id").notNull().references(() => opportunity_blueprints.id, { onDelete: 'cascade' }),
  
  // Generated campaign
  campaign_id: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  
  // User/Franchise context
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  franchise_id: varchar("franchise_id").references(() => franchises.id, { onDelete: 'set null' }),
  
  // Capital allocation
  allocated_capital: decimal("allocated_capital", { precision: 20, scale: 2 }).notNull(),
  
  // Performance tracking specific to CO
  realized_pnl: decimal("realized_pnl", { precision: 20, scale: 2 }).default("0").notNull(),
  unrealized_pnl: decimal("unrealized_pnl", { precision: 20, scale: 2 }).default("0").notNull(),
  roi_percentage: decimal("roi_percentage", { precision: 10, scale: 4 }).default("0").notNull(),
  
  // Blueprint thesis validation
  thesis_validated: boolean("thesis_validated"), // Was the opportunity thesis correct?
  validation_notes: text("validation_notes"),
  
  // Audit flag (CO has reinforced audit)
  enhanced_audit: boolean("enhanced_audit").default(true).notNull(),
  
  // Status: active, completed, stopped, failed
  status: varchar("status", { length: 20 }).default("active").notNull(),
  
  started_at: timestamp("started_at").defaultNow().notNull(),
  completed_at: timestamp("completed_at"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_opp_campaigns_blueprint").on(table.blueprint_id),
  index("idx_opp_campaigns_campaign").on(table.campaign_id),
  index("idx_opp_campaigns_user").on(table.user_id),
  index("idx_opp_campaigns_franchise").on(table.franchise_id),
  index("idx_opp_campaigns_status").on(table.status),
  uniqueIndex("idx_opp_campaigns_unique").on(table.blueprint_id, table.campaign_id),
]);

export const insertOpportunityCampaignSchema = createInsertSchema(opportunity_campaigns).omit({
  id: true,
  completed_at: true,
  created_at: true,
  updated_at: true,
});
export type InsertOpportunityCampaign = z.infer<typeof insertOpportunityCampaignSchema>;
export type OpportunityCampaign = typeof opportunity_campaigns.$inferSelect;

// Opportunity AI Logs - audit trail of AI detection decisions
export const opportunity_ai_logs = pgTable("opportunity_ai_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User context
  user_id: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Blueprint (if one was generated)
  blueprint_id: varchar("blueprint_id").references(() => opportunity_blueprints.id, { onDelete: 'set null' }),
  
  // Analysis type: market_scan, opportunity_detection, thesis_validation, risk_assessment
  analysis_type: varchar("analysis_type", { length: 30 }).notNull(),
  
  // Model used
  model: varchar("model", { length: 50 }).notNull(), // gpt-4o, gpt-4o-mini, custom
  
  // Input context (what the AI analyzed)
  input_context: jsonb("input_context"), // { symbols_analyzed, market_data, historical_data }
  
  // AI output
  output: jsonb("output").notNull(), // Full AI response
  
  // Decision
  opportunity_detected: boolean("opportunity_detected").default(false).notNull(),
  rejection_reason: text("rejection_reason"), // If no opportunity, why?
  
  // Performance metrics
  tokens_used: integer("tokens_used").notNull(),
  latency_ms: integer("latency_ms").notNull(),
  cost_usd: decimal("cost_usd", { precision: 10, scale: 6 }),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_opp_ai_logs_user").on(table.user_id),
  index("idx_opp_ai_logs_blueprint").on(table.blueprint_id),
  index("idx_opp_ai_logs_type").on(table.analysis_type),
  index("idx_opp_ai_logs_detected").on(table.opportunity_detected),
  index("idx_opp_ai_logs_created").on(table.created_at),
]);

export const insertOpportunityAILogSchema = createInsertSchema(opportunity_ai_logs).omit({
  id: true,
  created_at: true,
});
export type InsertOpportunityAILog = z.infer<typeof insertOpportunityAILogSchema>;
export type OpportunityAILog = typeof opportunity_ai_logs.$inferSelect;

// ========== GOVERNANCE GATE SYSTEM V2.0+ ==========
// CO Decision History - Immutable audit trail of opportunity approve/reject decisions

export const CO_DECISION_TYPES = ['approved', 'rejected', 'expired', 'auto_approved', 'auto_rejected'] as const;
export type CODecisionType = typeof CO_DECISION_TYPES[number];

export const CO_REJECTION_REASONS = [
  'insufficient_capital',
  'active_campaigns_conflict',
  'risk_limit_exceeded',
  'user_manual_reject',
  'governance_policy',
  'var_es_threshold',
  'market_conditions',
  'franchise_restriction',
  'other'
] as const;
export type CORejectionReason = typeof CO_REJECTION_REASONS[number];

export const co_decision_history = pgTable("co_decision_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Blueprint being evaluated
  blueprint_id: varchar("blueprint_id").notNull().references(() => opportunity_blueprints.id, { onDelete: 'cascade' }),
  
  // User context
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  franchise_id: varchar("franchise_id").references(() => franchises.id, { onDelete: 'set null' }),
  
  // Decision details
  decision: varchar("decision", { length: 20 }).notNull(), // approved, rejected, expired, auto_approved, auto_rejected
  decision_reason: varchar("decision_reason", { length: 50 }), // Reason code from CO_REJECTION_REASONS
  decision_notes: text("decision_notes"), // Human-readable explanation
  
  // Actor information
  decided_by: varchar("decided_by", { length: 20 }).notNull(), // 'user', 'system', 'governance_engine', 'admin'
  decided_by_user_id: varchar("decided_by_user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Governance validation state at decision time
  governance_check: jsonb("governance_check").notNull(), // { var_ok, es_ok, capital_ok, conflict_ok, franchise_ok }
  
  // Risk metrics snapshot at decision time
  risk_snapshot: jsonb("risk_snapshot"), // { var_95, es_95, current_exposure, active_campaigns, etc. }
  
  // Market context at decision time
  market_snapshot: jsonb("market_snapshot"), // { btc_price, volatility, regime }
  
  // Resulting campaign (if approved)
  resulting_campaign_id: varchar("resulting_campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  
  // Immutability (hash chain for audit trail)
  entry_hash: varchar("entry_hash", { length: 64 }).notNull(),
  previous_hash: varchar("previous_hash", { length: 64 }), // Links to previous decision for this user
  
  // Digital signature for critical decisions
  signature: varchar("signature", { length: 128 }),
  signature_algorithm: varchar("signature_algorithm", { length: 30 }),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_co_decision_blueprint").on(table.blueprint_id),
  index("idx_co_decision_user").on(table.user_id),
  index("idx_co_decision_franchise").on(table.franchise_id),
  index("idx_co_decision_type").on(table.decision),
  index("idx_co_decision_created").on(table.created_at),
  index("idx_co_decision_campaign").on(table.resulting_campaign_id),
]);

export const insertCODecisionHistorySchema = createInsertSchema(co_decision_history).omit({
  id: true,
  created_at: true,
});
export type InsertCODecisionHistory = z.infer<typeof insertCODecisionHistorySchema>;
export type CODecisionHistory = typeof co_decision_history.$inferSelect;

// ============================================================================
// FRANCHISE PLANS VERSION MODULE - Versões de Planos de Franquia
// Plans are immutable - only versioned. Editing creates a new version.
// Uses existing franchise_plans table from FRANCHISE SYSTEM section
// ============================================================================

// AI Access levels for opportunities
export const AI_ACCESS_LEVELS = ["none", "alerts", "alerts_co"] as const;
export type AIAccessLevel = typeof AI_ACCESS_LEVELS[number];

// Royalty models
export const ROYALTY_MODELS = ["fixed", "dynamic_prs"] as const;
export type RoyaltyModel = typeof ROYALTY_MODELS[number];

// Audit levels
export const AUDIT_LEVELS = ["standard", "reinforced"] as const;
export type AuditLevel = typeof AUDIT_LEVELS[number];

// Payment methods
export const PAYMENT_METHODS = ["pix", "boleto", "credit_card", "bank_transfer"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

// Adjustment indexes
export const ADJUSTMENT_INDEXES = ["ipca", "igpm", "selic", "none"] as const;
export type AdjustmentIndex = typeof ADJUSTMENT_INDEXES[number];

// Franchise Plan Versions - immutable versioned configurations
// Each version contains all 9 tabs of configuration
export const franchise_plan_versions = pgTable("franchise_plan_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Reference to parent plan
  plan_id: varchar("plan_id").notNull().references(() => franchise_plans.id, { onDelete: 'cascade' }),
  
  // Version info
  version: integer("version").notNull(),
  version_status: varchar("version_status", { length: 20 }).default("draft").notNull(), // draft, active, archived
  version_notes: text("version_notes"), // Changes description
  
  // === Aba 2: Taxa de Franquia ===
  franchise_fee: decimal("franchise_fee", { precision: 12, scale: 2 }).notNull(), // R$ value
  fee_periodicity_months: integer("fee_periodicity_months").default(1).notNull(), // 1, 3, 6, 12 months
  first_due_date_offset_days: integer("first_due_date_offset_days").default(30).notNull(), // Days after activation
  allowed_payment_methods: text("allowed_payment_methods").array().default([]).notNull(), // pix, boleto, etc
  auto_adjustment: boolean("auto_adjustment").default(false).notNull(),
  adjustment_index: varchar("adjustment_index", { length: 20 }), // ipca, igpm, selic, none
  late_payment_penalty_pct: decimal("late_payment_penalty_pct", { precision: 5, scale: 2 }).default("2").notNull(), // %
  late_payment_interest_pct: decimal("late_payment_interest_pct", { precision: 5, scale: 2 }).default("1").notNull(), // % per month
  payment_tolerance_days: integer("payment_tolerance_days").default(3).notNull(),
  
  // === Aba 3: Limites de Campanhas ===
  max_simultaneous_campaigns: integer("max_simultaneous_campaigns").default(1).notNull(),
  max_standard_campaigns: integer("max_standard_campaigns").default(5).notNull(),
  max_opportunity_campaigns: integer("max_opportunity_campaigns").default(0).notNull(), // CO limit
  campaign_cooldown_hours: integer("campaign_cooldown_hours").default(24).notNull(),
  
  // === Aba 4: Capital e Exposição ===
  max_total_capital: decimal("max_total_capital", { precision: 20, scale: 2 }).notNull(), // R$ or USD
  max_capital_per_campaign_pct: decimal("max_capital_per_campaign_pct", { precision: 5, scale: 2 }).default("50").notNull(),
  max_capital_per_co_pct: decimal("max_capital_per_co_pct", { precision: 5, scale: 2 }).default("25").notNull(),
  max_exposure_per_asset_pct: decimal("max_exposure_per_asset_pct", { precision: 5, scale: 2 }).default("20").notNull(),
  max_exposure_per_cluster_pct: decimal("max_exposure_per_cluster_pct", { precision: 5, scale: 2 }).default("40").notNull(),
  
  // === Aba 5: Perfis de Risco ===
  allowed_risk_profiles: text("allowed_risk_profiles").array().default([]).notNull(), // conservative, moderate, aggressive
  max_risk_per_trade_pct: decimal("max_risk_per_trade_pct", { precision: 5, scale: 2 }).default("2").notNull(),
  max_drawdown_per_campaign_pct: decimal("max_drawdown_per_campaign_pct", { precision: 5, scale: 2 }).default("10").notNull(),
  allow_risk_customization: boolean("allow_risk_customization").default(false).notNull(),
  
  // === Aba 6: IA & Campanhas de Oportunidade ===
  ai_access_level: varchar("ai_access_level", { length: 20 }).default("none").notNull(), // none, alerts, alerts_co
  max_cos_per_period: integer("max_cos_per_period").default(0).notNull(),
  co_period_days: integer("co_period_days").default(30).notNull(), // Period for CO limit
  min_opportunity_score: integer("min_opportunity_score").default(75).notNull(), // 0-100
  allow_blueprint_adjustment: boolean("allow_blueprint_adjustment").default(false).notNull(),
  
  // === Aba 7: Gatilhos e Automação ===
  risk_triggers_enabled: boolean("risk_triggers_enabled").default(true).notNull(), // Always ON
  performance_triggers_enabled: boolean("performance_triggers_enabled").default(true).notNull(),
  benchmark_triggers_enabled: boolean("benchmark_triggers_enabled").default(false).notNull(),
  auto_rebalance_enabled: boolean("auto_rebalance_enabled").default(false).notNull(),
  min_audit_frequency_hours: integer("min_audit_frequency_hours").default(8).notNull(),
  
  // === Aba 8: Royalties por Performance ===
  royalty_model: varchar("royalty_model", { length: 20 }).default("fixed").notNull(), // fixed, dynamic_prs
  royalty_min_pct: decimal("royalty_min_pct", { precision: 5, scale: 2 }).default("10").notNull(),
  royalty_max_pct: decimal("royalty_max_pct", { precision: 5, scale: 2 }).default("30").notNull(),
  royalty_applies_to_cos: boolean("royalty_applies_to_cos").default(true).notNull(),
  royalty_calculation_period: varchar("royalty_calculation_period", { length: 20 }).default("monthly").notNull(), // weekly, monthly, quarterly
  
  // === Aba 9: Governança & Compliance ===
  audit_level: varchar("audit_level", { length: 20 }).default("standard").notNull(), // standard, reinforced
  allow_auto_downgrade: boolean("allow_auto_downgrade").default(false).notNull(), // Auto downgrade on non-payment
  suspension_policy_days: integer("suspension_policy_days").default(30).notNull(), // Days before suspension
  antifraud_tolerance: integer("antifraud_tolerance").default(3).notNull(), // Number of events before action
  
  // Audit trail
  created_by: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  activated_at: timestamp("activated_at"),
  archived_at: timestamp("archived_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_plan_versions_plan").on(table.plan_id),
  index("idx_plan_versions_version").on(table.version),
  index("idx_plan_versions_status").on(table.version_status),
  uniqueIndex("idx_plan_versions_unique").on(table.plan_id, table.version),
]);

export const insertFranchisePlanVersionSchema = createInsertSchema(franchise_plan_versions).omit({
  id: true,
  activated_at: true,
  archived_at: true,
  created_at: true,
});
export type InsertFranchisePlanVersion = z.infer<typeof insertFranchisePlanVersionSchema>;
export type FranchisePlanVersion = typeof franchise_plan_versions.$inferSelect;

// Franchise Plan Audit Log - tracks all changes for compliance
export const franchise_plan_audit_logs = pgTable("franchise_plan_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  plan_id: varchar("plan_id").notNull().references(() => franchise_plans.id, { onDelete: 'cascade' }),
  version_id: varchar("version_id").references(() => franchise_plan_versions.id, { onDelete: 'set null' }),
  
  // Action: created, version_created, activated, suspended, archived
  action: varchar("action", { length: 30 }).notNull(),
  
  // Changes summary
  changes_summary: text("changes_summary"),
  
  // Full diff for audit (old values vs new values)
  old_values: jsonb("old_values"),
  new_values: jsonb("new_values"),
  
  // Actor
  performed_by: varchar("performed_by").references(() => users.id, { onDelete: 'set null' }),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_plan_audit_plan").on(table.plan_id),
  index("idx_plan_audit_version").on(table.version_id),
  index("idx_plan_audit_action").on(table.action),
  index("idx_plan_audit_created").on(table.created_at),
]);

export const insertFranchisePlanAuditLogSchema = createInsertSchema(franchise_plan_audit_logs).omit({
  id: true,
  created_at: true,
});
export type InsertFranchisePlanAuditLog = z.infer<typeof insertFranchisePlanAuditLogSchema>;
export type FranchisePlanAuditLog = typeof franchise_plan_audit_logs.$inferSelect;

// Combined type for plan with current version details
export type FranchisePlanWithVersion = FranchisePlan & {
  currentVersionDetails?: FranchisePlanVersion;
};

// ========== FULL CUSTOM RISK PROFILES ==========
// Stores customizable risk parameters for FULL (F) profile users
// Each custom profile is versioned and locked after campaign start

export const custom_risk_profiles = pgTable("custom_risk_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Owner
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  franchise_id: varchar("franchise_id").references(() => franchises.id, { onDelete: 'set null' }),
  
  // Profile metadata
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  version: integer("version").default(1).notNull(),
  
  // Based on SUPER_AGGRESSIVE (SA) baseline
  based_on_profile: varchar("based_on_profile", { length: 2 }).default("SA").notNull(),
  
  // Status: draft, active, locked, archived
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  
  // ========== RISK CORE PARAMETERS (editable with ranges) ==========
  // All values have min/max constraints validated at application level
  
  // Risk per trade: min 0.25%, max 3.50%, default 1.75%
  risk_per_trade_pct: decimal("risk_per_trade_pct", { precision: 5, scale: 2 }).default("1.75").notNull(),
  
  // Daily loss limit: min 1%, max 8%, default 5%
  daily_loss_limit_pct: decimal("daily_loss_limit_pct", { precision: 5, scale: 2 }).default("5.00").notNull(),
  
  // Campaign drawdown max: min 5%, max 55%, default 30%
  dd_campaign_max_pct: decimal("dd_campaign_max_pct", { precision: 5, scale: 2 }).default("30.00").notNull(),
  
  // Global drawdown max: min 8%, max 55%, default 35%
  dd_global_max_pct: decimal("dd_global_max_pct", { precision: 5, scale: 2 }).default("35.00").notNull(),
  
  // Soft reduce at % of DD: min 0.60, max 0.90, default 0.80
  dd_soft_reduce_at: decimal("dd_soft_reduce_at", { precision: 3, scale: 2 }).default("0.80").notNull(),
  
  // ========== EXPOSURE PARAMETERS ==========
  // Max exposure per asset: min 5%, max 55%, default 30%
  max_exposure_per_asset_pct: decimal("max_exposure_per_asset_pct", { precision: 5, scale: 2 }).default("30.00").notNull(),
  
  // Max exposure per cluster: min 20%, max 85%, default 70%
  max_exposure_per_cluster_pct: decimal("max_exposure_per_cluster_pct", { precision: 5, scale: 2 }).default("70.00").notNull(),
  
  // Max correlation between open positions: min 0.50, max 0.95, default 0.85
  max_corr: decimal("max_corr", { precision: 3, scale: 2 }).default("0.85").notNull(),
  
  // Max open positions: min 3, max 55, default 25
  max_open_positions: integer("max_open_positions").default(25).notNull(),
  
  // ========== EXECUTION GUARD PARAMETERS ==========
  // Max spread %: min 0.05%, max 0.60%, default 0.20%
  max_spread_pct: decimal("max_spread_pct", { precision: 5, scale: 4 }).default("0.0020").notNull(),
  
  // Min depth USD near mid: min 10k, max 500k, default 50k
  min_depth_usd: decimal("min_depth_usd", { precision: 20, scale: 2 }).default("50000").notNull(),
  
  // Max slippage %: min 0.10%, max 1.50%, default 0.40%
  max_slippage_pct: decimal("max_slippage_pct", { precision: 5, scale: 4 }).default("0.0040").notNull(),
  
  // Max impact %: min 0.10%, max 1.50%, default 0.35%
  max_impact_pct: decimal("max_impact_pct", { precision: 5, scale: 4 }).default("0.0035").notNull(),
  
  // ========== STOP/TP/TRAILING PARAMETERS ==========
  // Stop ATR multiplier: min 1.5, max 6.0, default 3.0
  stop_atr_mult: decimal("stop_atr_mult", { precision: 4, scale: 2 }).default("3.00").notNull(),
  
  // TP1 R multiple: min 0.5, max 3.0, default 1.0
  tp1_r: decimal("tp1_r", { precision: 4, scale: 2 }).default("1.00").notNull(),
  
  // TP2 R multiple: min 1.0, max 5.0, default 2.0
  tp2_r: decimal("tp2_r", { precision: 4, scale: 2 }).default("2.00").notNull(),
  
  // TP1 % of position: min 10%, max 65%, default 40%
  tp1_pct: decimal("tp1_pct", { precision: 5, scale: 2 }).default("40.00").notNull(),
  
  // TP2 % of position: min 10%, max 65%, default 30%
  tp2_pct: decimal("tp2_pct", { precision: 5, scale: 2 }).default("30.00").notNull(),
  
  // Trail % of position: min 10%, max 85%, default 30%
  trail_pct: decimal("trail_pct", { precision: 5, scale: 2 }).default("30.00").notNull(),
  
  // Trail activate after R: min 0.5, max 3.5, default 2.0
  trail_activate_after_r: decimal("trail_activate_after_r", { precision: 4, scale: 2 }).default("2.00").notNull(),
  
  // Trail ATR multiplier: min 0.5, max 5.0, default 2.0
  trail_atr_mult: decimal("trail_atr_mult", { precision: 4, scale: 2 }).default("2.00").notNull(),
  
  // ========== AUTOMATION PARAMETERS ==========
  // Rebalance hours: min 2, max 24, default 8
  rebalance_hours: integer("rebalance_hours").default(8).notNull(),
  
  // Audit frequency hours: min 1, max 24, default 6
  audit_frequency_hours: integer("audit_frequency_hours").default(6).notNull(),
  
  // Max orders per day: min 100, max 50000, default 20000
  max_orders_per_day: integer("max_orders_per_day").default(20000).notNull(),
  
  // ========== ASSET FILTERS ==========
  // Min volume 24h USD: min 5M, max 500M, default 50M
  min_volume_24h_usd: decimal("min_volume_24h_usd", { precision: 20, scale: 2 }).default("50000000").notNull(),
  
  // Min volatility daily %: min 1%, max 30%, default 6%
  min_volatility_daily_pct: decimal("min_volatility_daily_pct", { precision: 5, scale: 2 }).default("6.00").notNull(),
  
  // Max assets per campaign: min 10, max 200, default 100
  max_assets_per_campaign: integer("max_assets_per_campaign").default(100).notNull(),
  
  // ========== CLUSTER SELECTION ==========
  // Selected clusters (user can choose which to include, with restrictions)
  selected_clusters: integer("selected_clusters").array(),
  
  // ========== LEVERAGE (only for FULL plan) ==========
  use_leverage: boolean("use_leverage").default(false).notNull(),
  leverage_amount: decimal("leverage_amount", { precision: 4, scale: 2 }).default("1.00").notNull(), // max 1.50
  
  // ========== IMMUTABILITY & AUDIT ==========
  // Hash of all parameters at creation (for tamper detection)
  creation_hash: varchar("creation_hash", { length: 64 }),
  
  // Hash chain for version history
  previous_hash: varchar("previous_hash", { length: 64 }),
  
  // Locked at campaign start (cannot be modified after)
  locked_at: timestamp("locked_at"),
  locked_by_campaign_id: varchar("locked_by_campaign_id"),
  
  // Legal acceptance
  legal_accepted_at: timestamp("legal_accepted_at"),
  legal_acceptance_hash: varchar("legal_acceptance_hash", { length: 64 }),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_custom_profiles_user").on(table.user_id),
  index("idx_custom_profiles_franchise").on(table.franchise_id),
  index("idx_custom_profiles_status").on(table.status),
  index("idx_custom_profiles_locked").on(table.locked_at),
]);

export const insertCustomRiskProfileSchema = createInsertSchema(custom_risk_profiles).omit({
  id: true,
  created_at: true,
  updated_at: true,
  locked_at: true,
  legal_accepted_at: true,
});
export type InsertCustomRiskProfile = z.infer<typeof insertCustomRiskProfileSchema>;
export type CustomRiskProfile = typeof custom_risk_profiles.$inferSelect;

// ========== FULL PROFILE PARAMETER RANGES ==========
// Defines the valid ranges for customizable parameters
// Used for frontend validation and backend enforcement

export const FULL_PROFILE_PARAMETER_RANGES = {
  risk_per_trade_pct: { min: 0.25, max: 3.50, default: 1.75, step: 0.25 },
  daily_loss_limit_pct: { min: 1.00, max: 8.00, default: 5.00, step: 0.50 },
  dd_campaign_max_pct: { min: 5.0, max: 55.0, default: 30.0, step: 5.0 },
  dd_global_max_pct: { min: 8.0, max: 55.0, default: 35.0, step: 5.0 },
  dd_soft_reduce_at: { min: 0.60, max: 0.90, default: 0.80, step: 0.05 },
  max_exposure_per_asset_pct: { min: 5.0, max: 55.0, default: 30.0, step: 5.0 },
  max_exposure_per_cluster_pct: { min: 20.0, max: 85.0, default: 70.0, step: 5.0 },
  max_corr: { min: 0.50, max: 0.95, default: 0.85, step: 0.05 },
  max_open_positions: { min: 3, max: 55, default: 25, step: 1 },
  max_spread_pct: { min: 0.05, max: 0.60, default: 0.20, step: 0.05 },
  min_depth_usd: { min: 10000, max: 500000, default: 50000, step: 10000 },
  max_slippage_pct: { min: 0.10, max: 1.50, default: 0.40, step: 0.10 },
  max_impact_pct: { min: 0.10, max: 1.50, default: 0.35, step: 0.05 },
  stop_atr_mult: { min: 1.5, max: 6.0, default: 3.0, step: 0.5 },
  tp1_r: { min: 0.5, max: 3.0, default: 1.0, step: 0.5 },
  tp2_r: { min: 1.0, max: 5.0, default: 2.0, step: 0.5 },
  tp1_pct: { min: 10.0, max: 65.0, default: 40.0, step: 5.0 },
  tp2_pct: { min: 10.0, max: 65.0, default: 30.0, step: 5.0 },
  trail_pct: { min: 10.0, max: 85.0, default: 30.0, step: 5.0 },
  trail_activate_after_r: { min: 0.5, max: 3.5, default: 2.0, step: 0.5 },
  trail_atr_mult: { min: 0.5, max: 5.0, default: 2.0, step: 0.5 },
  rebalance_hours: { min: 2, max: 24, default: 8, step: 2 },
  audit_frequency_hours: { min: 1, max: 24, default: 6, step: 1 },
  max_orders_per_day: { min: 100, max: 50000, default: 20000, step: 1000 },
  min_volume_24h_usd: { min: 5000000, max: 500000000, default: 50000000, step: 5000000 },
  min_volatility_daily_pct: { min: 1.0, max: 30.0, default: 6.0, step: 1.0 },
  max_assets_per_campaign: { min: 10, max: 200, default: 100, step: 10 },
  leverage_amount: { min: 1.0, max: 1.5, default: 1.0, step: 0.1 },
} as const;

// ========== GOVERNANCE VALIDATION RULES ==========
// Rules for validating governance gates before allowing high-risk profiles

export const GOVERNANCE_REQUIREMENTS = {
  SUPER_AGGRESSIVE: {
    profile_code: "SA",
    min_plan_codes: ["pro", "enterprise", "full"],
    min_days_in_system: 30,
    min_prs_score: 70,
    requires_no_antifraud_flags: true,
    requires_strong_audit: true,
    requires_double_confirm: true,
    requires_legal_acceptance: true,
    blocked_clusters: [1, 5],
    priority_clusters: [3, 4, 6, 10],
    leverage_allowed: false,
    min_audit_frequency_hours: 12,
  },
  FULL_CUSTOM: {
    profile_code: "F",
    min_plan_codes: ["enterprise", "full"],
    min_days_in_system: 60,
    min_prs_score: 80,
    requires_no_antifraud_flags: true,
    requires_strong_audit: true,
    requires_double_confirm: true,
    requires_legal_acceptance: true,
    blocked_clusters: [], // User can select clusters (with some restrictions)
    priority_clusters: [],
    leverage_allowed: true, // Only with FULL plan
    max_leverage: 1.5,
    min_audit_frequency_hours: 6,
  },
} as const;

// Plan hierarchy for governance checks
export const PLAN_HIERARCHY = {
  starter: 1,
  pro: 2,
  enterprise: 3,
  full: 4,
} as const;

// ========== STANDARD PROFILE MAXIMUM LIMITS ==========
// Maximum values allowed for standard profiles (C, M, A)
// Any value exceeding these limits REQUIRES SA or F profile with governance validation
export const STANDARD_PROFILE_MAX_LIMITS = {
  // Risk parameters
  leverage_multiplier: 1.0,        // No leverage for standard profiles
  risk_per_trade_pct: 3.0,         // Max 3% risk per trade
  max_daily_drawdown_pct: 5.0,     // Max 5% daily drawdown
  max_drawdown_30d_pct: 15.0,      // Max 15% monthly drawdown
  
  // Position limits
  max_open_positions: 15,          // Max 15 concurrent positions
  max_trades_per_day: 50,          // Max 50 trades per day
  max_position_pct_capital_per_pair: 15.0, // Max 15% per pair
  max_cluster_risk_pct: 30.0,      // Max 30% cluster exposure
  
  // ATR/Technical parameters
  tp_atr_multiplier: 4.0,          // Max 4x ATR for take profit
  sl_atr_multiplier: 2.0,          // Max 2x ATR for stop loss
  max_slippage_pct: 1.0,           // Max 1% slippage tolerance
  
  // Features not available for standard profiles
  custom_profile_id: false,        // Not allowed
  custom_cluster_selection: false, // Not allowed
  leverage_enabled: false,         // Not allowed
} as const;

// Helper function to coerce various truthy values to boolean
// SECURITY: Fail-closed behavior - any non-null value that is not explicitly false is treated as true
// This prevents bypass via malformed values like "enable", {value:1}, etc.
function coerceToBoolean(value: any): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    // Explicit false sentinels
    if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') return false;
    // Any other non-empty string is treated as true (fail-closed)
    return true;
  }
  if (typeof value === 'number') return value !== 0;
  // Any other type (object, array, etc.) with a value is treated as true (fail-closed)
  return true;
}

// Function to check if riskConfig exceeds standard profile limits
// Returns array of exceeded parameters or empty array if all within limits
export function checkExceedsStandardLimits(riskConfig: Record<string, any> | null | undefined): string[] {
  if (!riskConfig) return [];
  
  const exceeded: string[] = [];
  const limits = STANDARD_PROFILE_MAX_LIMITS;
  
  // Check numeric limits
  if (parseFloat(riskConfig.leverage_multiplier || riskConfig.leverageMultiplier || '1') > limits.leverage_multiplier) {
    exceeded.push('leverage_multiplier');
  }
  if (parseFloat(riskConfig.risk_per_trade_pct || riskConfig.riskPerTradePct || '1') > limits.risk_per_trade_pct) {
    exceeded.push('risk_per_trade_pct');
  }
  if (parseFloat(riskConfig.max_daily_drawdown_pct || riskConfig.maxDailyDrawdownPct || '3') > limits.max_daily_drawdown_pct) {
    exceeded.push('max_daily_drawdown_pct');
  }
  if (parseFloat(riskConfig.max_drawdown_30d_pct || riskConfig.maxDrawdown30dPct || '10') > limits.max_drawdown_30d_pct) {
    exceeded.push('max_drawdown_30d_pct');
  }
  if (parseFloat(riskConfig.max_open_positions || riskConfig.maxOpenPositions || '5') > limits.max_open_positions) {
    exceeded.push('max_open_positions');
  }
  if (parseFloat(riskConfig.max_trades_per_day || riskConfig.maxTradesPerDay || '10') > limits.max_trades_per_day) {
    exceeded.push('max_trades_per_day');
  }
  if (parseFloat(riskConfig.max_position_pct_capital_per_pair || riskConfig.maxPositionPctCapitalPerPair || '10') > limits.max_position_pct_capital_per_pair) {
    exceeded.push('max_position_pct_capital_per_pair');
  }
  if (parseFloat(riskConfig.max_cluster_risk_pct || riskConfig.maxClusterRiskPct || '20') > limits.max_cluster_risk_pct) {
    exceeded.push('max_cluster_risk_pct');
  }
  if (parseFloat(riskConfig.tp_atr_multiplier || riskConfig.tpAtrMultiplier || '2') > limits.tp_atr_multiplier) {
    exceeded.push('tp_atr_multiplier');
  }
  if (parseFloat(riskConfig.sl_atr_multiplier || riskConfig.slAtrMultiplier || '1') > limits.sl_atr_multiplier) {
    exceeded.push('sl_atr_multiplier');
  }
  if (parseFloat(riskConfig.max_slippage_pct || riskConfig.maxSlippagePct || '0.5') > limits.max_slippage_pct) {
    exceeded.push('max_slippage_pct');
  }
  
  // Check boolean/presence flags that are SA/F-exclusive
  // Use coerceToBoolean to handle string/numeric truthy values
  if (riskConfig.custom_profile_id || riskConfig.customProfileId) {
    exceeded.push('custom_profile_id');
  }
  if (riskConfig.allowed_clusters || riskConfig.allowedClusters || 
      riskConfig.blocked_clusters || riskConfig.blockedClusters) {
    exceeded.push('custom_cluster_selection');
  }
  // Leverage enabled flag - only SA/F profiles can enable leverage
  if (coerceToBoolean(riskConfig.leverage_enabled) === true || 
      coerceToBoolean(riskConfig.leverageEnabled) === true) {
    exceeded.push('leverage_enabled');
  }
  // Allow add position is aggressive feature
  if (coerceToBoolean(riskConfig.allow_add_position) === true || 
      coerceToBoolean(riskConfig.allowAddPosition) === true) {
    exceeded.push('allow_add_position');
  }
  // Circuit breaker overrides (disabling safety features)
  if (coerceToBoolean(riskConfig.cb_daily_enabled) === false || 
      coerceToBoolean(riskConfig.cbDailyEnabled) === false) {
    exceeded.push('cb_daily_disabled');
  }
  if (coerceToBoolean(riskConfig.cb_campaign_enabled) === false || 
      coerceToBoolean(riskConfig.cbCampaignEnabled) === false) {
    exceeded.push('cb_campaign_disabled');
  }
  // Trailing drawdown disabled (removing safety feature)
  if (coerceToBoolean(riskConfig.use_trailing_dd) === false || 
      coerceToBoolean(riskConfig.useTrailingDd) === false) {
    exceeded.push('trailing_dd_disabled');
  }
  // ATR sizing disabled (removing dynamic sizing)
  if (coerceToBoolean(riskConfig.use_atr_sizing) === false || 
      coerceToBoolean(riskConfig.useAtrSizing) === false) {
    exceeded.push('atr_sizing_disabled');
  }
  
  return exceeded;
}

// ==================== MASTER FRANCHISE SYSTEM ====================
// Territory Engine + Master Account Management
// Based on DELFOS Master Franchise Blueprint v1.0

// ========== TERRITORY EXCLUSIVITY TYPES ==========
export const TERRITORY_EXCLUSIVITY_TYPES = ["exclusive", "semi_exclusive", "non_exclusive"] as const;
export type TerritoryExclusivityType = typeof TERRITORY_EXCLUSIVITY_TYPES[number];

// ========== TERRITORY LAYER TYPES ==========
export const TERRITORY_LAYER_TYPES = [
  "country",           // Administrative - Country level
  "state",             // Administrative - State/Province
  "municipality",      // Administrative - City/Municipality
  "micro_region",      // Statistical - IBGE microregion or equivalent
  "metro_region",      // Statistical - Metropolitan region
  "zip_range",         // Postal - ZIP/CEP code ranges
  "custom_economic",   // Custom - DELFOS Economic Territory
] as const;
export type TerritoryLayerType = typeof TERRITORY_LAYER_TYPES[number];

// ========== MASTER ACCOUNT STATUS ==========
export const MASTER_ACCOUNT_STATUSES = [
  "pending_approval",   // Awaiting HQ approval
  "active",             // Operating normally
  "suspended",          // Temporarily suspended
  "under_audit",        // Under investigation
  "terminated",         // Contract terminated
] as const;
export type MasterAccountStatus = typeof MASTER_ACCOUNT_STATUSES[number];

// ========== TERRITORY DEFINITIONS ==========
// Granular territorial delimitation with multiple layers
export const territory_definitions = pgTable("territory_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Base identification
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  
  // Country (required base layer)
  country_code: varchar("country_code", { length: 3 }).notNull(), // ISO 3166-1 alpha-3
  
  // === Administrative Layers (optional) ===
  states: text("states").array(), // State/Province codes
  municipalities: text("municipalities").array(), // City/Municipality codes
  
  // === Statistical Layers (optional, IBGE or equivalent) ===
  micro_regions: text("micro_regions").array(), // Microregion codes
  metro_regions: text("metro_regions").array(), // Metropolitan region codes
  urban_agglomerations: text("urban_agglomerations").array(), // Urban agglomeration codes
  
  // === Postal Layers (optional) ===
  // Format: "start-end" for ranges, or single codes
  zip_code_ranges: text("zip_code_ranges").array(), // ["01000-02000", "05000-06000"]
  zip_code_exclusions: text("zip_code_exclusions").array(), // Specific ZIPs to exclude
  
  // === Custom Economic Zone (optional) ===
  custom_economic_zone_id: varchar("custom_economic_zone_id", { length: 50 }),
  custom_economic_zone_name: varchar("custom_economic_zone_name", { length: 200 }),
  
  // === Hybrid Exclusions ===
  // Example: "State X excluding capital"
  excluded_states: text("excluded_states").array(),
  excluded_municipalities: text("excluded_municipalities").array(),
  
  // === Exclusivity Configuration ===
  exclusivity_type: varchar("exclusivity_type", { length: 20 }).default("exclusive").notNull(),
  max_masters_quota: integer("max_masters_quota"), // For semi_exclusive type
  overlap_allowed: boolean("overlap_allowed").default(false).notNull(),
  
  // === Performance Conditions for Exclusivity ===
  // Failure to meet = partial/total loss of exclusivity
  min_franchises_sold_yearly: integer("min_franchises_sold_yearly"),
  min_regional_volume_usd: decimal("min_regional_volume_usd", { precision: 20, scale: 2 }),
  min_franchisee_retention_pct: decimal("min_franchisee_retention_pct", { precision: 5, scale: 2 }),
  
  // === Audit & Immutability ===
  // REQUIRED: SHA-256 hash of territory config for tamper detection
  territory_hash: varchar("territory_hash", { length: 64 }).notNull(),
  
  // Status
  is_active: boolean("is_active").default(true).notNull(),
  
  // Audit trail
  created_by: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_territory_country").on(table.country_code),
  index("idx_territory_exclusivity").on(table.exclusivity_type),
  index("idx_territory_active").on(table.is_active),
  uniqueIndex("idx_territory_hash").on(table.territory_hash), // Ensure unique fingerprints
]);

export const insertTerritoryDefinitionSchema = createInsertSchema(territory_definitions).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertTerritoryDefinition = z.infer<typeof insertTerritoryDefinitionSchema>;
export type TerritoryDefinition = typeof territory_definitions.$inferSelect;

// ========== MASTER ACCOUNTS ==========
// Hybrid entity: Commercial Master + Operating Franchisee
export const master_accounts = pgTable("master_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // === Legal Entity ===
  legal_entity_name: varchar("legal_entity_name", { length: 300 }).notNull(),
  legal_entity_tax_id: varchar("legal_entity_tax_id", { length: 50 }).notNull(), // CNPJ/Tax ID
  legal_entity_tax_id_type: varchar("legal_entity_tax_id_type", { length: 10 }).default("cnpj").notNull(),
  legal_entity_address: text("legal_entity_address"),
  legal_entity_country: varchar("legal_entity_country", { length: 3 }).default("BRA").notNull(),
  
  // === Territory Assignment ===
  territory_definition_id: varchar("territory_definition_id").notNull().references(() => territory_definitions.id),
  
  // === Exclusivity Status (can be revoked based on performance) ===
  exclusivity_status: varchar("exclusivity_status", { length: 20 }).default("active").notNull(), // active, warning, revoked
  exclusivity_warning_reason: text("exclusivity_warning_reason"),
  exclusivity_revoked_at: timestamp("exclusivity_revoked_at"),
  
  // === Contract Information ===
  master_contract_id: varchar("master_contract_id", { length: 100 }),
  master_contract_pdf_url: text("master_contract_pdf_url"),
  contract_start_date: timestamp("contract_start_date").notNull(),
  contract_end_date: timestamp("contract_end_date"), // null = auto-renew
  contract_renewal_terms: text("contract_renewal_terms"),
  
  // === Operating Franchisee Link ===
  // The Master ALSO operates as a regular franchisee for trading
  franchisee_account_id: varchar("franchisee_account_id").references(() => franchises.id),
  
  // === Primary Contact User ===
  primary_user_id: varchar("primary_user_id").references(() => users.id),
  
  // === Revenue Split Rules ===
  // % of franchise fee that goes to Master
  franchise_fee_split_pct: decimal("franchise_fee_split_pct", { precision: 5, scale: 2 }).default("30").notNull(),
  // % of royalties from regional franchisees that goes to Master
  royalty_split_pct: decimal("royalty_split_pct", { precision: 5, scale: 2 }).default("20").notNull(),
  // Custom split rules (JSON for complex scenarios)
  custom_split_rules: jsonb("custom_split_rules"),
  
  // === Performance Metrics ===
  total_franchises_sold: integer("total_franchises_sold").default(0).notNull(),
  total_active_franchises: integer("total_active_franchises").default(0).notNull(),
  total_revenue_generated_usd: decimal("total_revenue_generated_usd", { precision: 20, scale: 2 }).default("0").notNull(),
  avg_franchisee_retention_pct: decimal("avg_franchisee_retention_pct", { precision: 5, scale: 2 }),
  last_performance_review_at: timestamp("last_performance_review_at"),
  
  // === Status ===
  status: varchar("status", { length: 20 }).default("pending_approval").notNull(),
  suspended_reason: text("suspended_reason"),
  suspended_at: timestamp("suspended_at"),
  
  // === Audit Flags ===
  under_audit: boolean("under_audit").default(false).notNull(),
  audit_started_at: timestamp("audit_started_at"),
  audit_notes: text("audit_notes"),
  
  // === Antifraud Flags Count ===
  antifraud_flags_count: integer("antifraud_flags_count").default(0).notNull(),
  last_antifraud_flag_at: timestamp("last_antifraud_flag_at"),
  
  // === Timestamps ===
  approved_at: timestamp("approved_at"),
  approved_by: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_master_territory").on(table.territory_definition_id),
  index("idx_master_franchisee").on(table.franchisee_account_id),
  index("idx_master_status").on(table.status),
  index("idx_master_exclusivity").on(table.exclusivity_status),
  index("idx_master_user").on(table.primary_user_id),
  uniqueIndex("idx_master_tax_id").on(table.legal_entity_tax_id),
]);

export const insertMasterAccountSchema = createInsertSchema(master_accounts).omit({
  id: true,
  created_at: true,
  updated_at: true,
  approved_at: true,
  suspended_at: true,
  exclusivity_revoked_at: true,
  audit_started_at: true,
  last_antifraud_flag_at: true,
  last_performance_review_at: true,
});
export type InsertMasterAccount = z.infer<typeof insertMasterAccountSchema>;
export type MasterAccount = typeof master_accounts.$inferSelect;

// ========== REGIONAL FRANCHISE LINKS ==========
// Links Master to franchisees sold within their territory
// Contains IMMUTABLE territory snapshot to prevent disputes
export const regional_franchise_links = pgTable("regional_franchise_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Master who sold/manages this franchise
  master_id: varchar("master_id").notNull().references(() => master_accounts.id, { onDelete: 'cascade' }),
  
  // The franchisee account
  franchisee_id: varchar("franchisee_id").notNull().references(() => franchises.id, { onDelete: 'cascade' }),
  
  // === IMMUTABLE Territory Snapshot ===
  // Captured at the moment of franchise sale
  // Prevents future territorial disputes
  territory_scope_snapshot: jsonb("territory_scope_snapshot").notNull(),
  territory_snapshot_hash: varchar("territory_snapshot_hash", { length: 64 }).notNull(),
  
  // Franchisee location within territory
  franchisee_state: varchar("franchisee_state", { length: 50 }),
  franchisee_municipality: varchar("franchisee_municipality", { length: 100 }),
  franchisee_zip_code: varchar("franchisee_zip_code", { length: 20 }),
  
  // === Revenue Split Tracking ===
  total_fees_earned_usd: decimal("total_fees_earned_usd", { precision: 20, scale: 2 }).default("0").notNull(),
  total_royalties_earned_usd: decimal("total_royalties_earned_usd", { precision: 20, scale: 2 }).default("0").notNull(),
  
  // Status
  status: varchar("status", { length: 20 }).default("active").notNull(), // active, transferred, terminated
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_regional_link_master").on(table.master_id),
  index("idx_regional_link_franchisee").on(table.franchisee_id),
  index("idx_regional_link_status").on(table.status),
  uniqueIndex("idx_regional_link_unique").on(table.master_id, table.franchisee_id),
]);

export const insertRegionalFranchiseLinkSchema = createInsertSchema(regional_franchise_links).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertRegionalFranchiseLink = z.infer<typeof insertRegionalFranchiseLinkSchema>;
export type RegionalFranchiseLink = typeof regional_franchise_links.$inferSelect;

// ========== MASTER PERFORMANCE TARGETS ==========
// Conditional targets for maintaining exclusivity
export const master_performance_targets = pgTable("master_performance_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  master_id: varchar("master_id").notNull().references(() => master_accounts.id, { onDelete: 'cascade' }),
  
  // Target period
  period_type: varchar("period_type", { length: 20 }).notNull(), // monthly, quarterly, yearly
  period_start: timestamp("period_start").notNull(),
  period_end: timestamp("period_end").notNull(),
  
  // === Target Metrics ===
  target_franchises_sold: integer("target_franchises_sold"),
  target_volume_usd: decimal("target_volume_usd", { precision: 20, scale: 2 }),
  target_retention_pct: decimal("target_retention_pct", { precision: 5, scale: 2 }),
  target_active_franchises: integer("target_active_franchises"),
  
  // === Actual Results ===
  actual_franchises_sold: integer("actual_franchises_sold"),
  actual_volume_usd: decimal("actual_volume_usd", { precision: 20, scale: 2 }),
  actual_retention_pct: decimal("actual_retention_pct", { precision: 5, scale: 2 }),
  actual_active_franchises: integer("actual_active_franchises"),
  
  // === Target Status ===
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, met, partially_met, failed
  
  // === Consequences if Failed ===
  exclusivity_impact: varchar("exclusivity_impact", { length: 30 }), // none, warning, partial_loss, full_revocation
  notes: text("notes"),
  
  evaluated_at: timestamp("evaluated_at"),
  evaluated_by: varchar("evaluated_by").references(() => users.id, { onDelete: 'set null' }),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_perf_target_master").on(table.master_id),
  index("idx_perf_target_period").on(table.period_start, table.period_end),
  index("idx_perf_target_status").on(table.status),
]);

export const insertMasterPerformanceTargetSchema = createInsertSchema(master_performance_targets).omit({
  id: true,
  created_at: true,
  updated_at: true,
  evaluated_at: true,
});
export type InsertMasterPerformanceTarget = z.infer<typeof insertMasterPerformanceTargetSchema>;
export type MasterPerformanceTarget = typeof master_performance_targets.$inferSelect;

// ========== MASTER TERRITORY ANTIFRAUD FLAGS ==========
// Specific antifraud flags for territorial violations
export const MASTER_ANTIFRAUD_FLAG_TYPES = [
  "MASTER_TERRITORY_OVERREACH",    // Attempted operation outside territory
  "MASTER_UNAUTHORIZED_SALE",      // Franchise sale outside authorized area
  "MASTER_OVERLAP_BREACH",         // Violated overlap rules
  "MASTER_SELF_SPLIT_ATTEMPT",     // Tried to generate self-royalty
  "MASTER_DATA_MANIPULATION",      // Attempted to access/modify restricted data
  "MASTER_PRIVILEGE_ESCALATION",   // Tried to access technical core
] as const;
export type MasterAntifraudFlagType = typeof MASTER_ANTIFRAUD_FLAG_TYPES[number];

// ========== MASTER TERRITORY AUDIT SNAPSHOTS ==========
// Immutable snapshots of territory state for audit purposes
export const master_territory_audit_snapshots = pgTable("master_territory_audit_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  master_id: varchar("master_id").notNull().references(() => master_accounts.id, { onDelete: 'cascade' }),
  territory_definition_id: varchar("territory_definition_id").notNull().references(() => territory_definitions.id),
  
  // Full snapshot of territory at this point in time
  territory_snapshot: jsonb("territory_snapshot").notNull(),
  snapshot_hash: varchar("snapshot_hash", { length: 64 }).notNull(),
  
  // Reason for snapshot
  snapshot_reason: varchar("snapshot_reason", { length: 50 }).notNull(), // creation, modification, franchise_sale, audit, dispute
  
  // Related event
  related_franchise_id: varchar("related_franchise_id").references(() => franchises.id, { onDelete: 'set null' }),
  related_event_description: text("related_event_description"),
  
  // Cryptographic chain - forms an immutable audit trail
  // NOTE: Self-referential FK handled at application layer to avoid circular dependency
  // The chain integrity is enforced by matching previous_snapshot_hash with the actual hash
  previous_snapshot_id: varchar("previous_snapshot_id"),
  previous_snapshot_hash: varchar("previous_snapshot_hash", { length: 64 }),
  
  // Chain validation flag - set to true only after verifying previous_snapshot_hash matches
  chain_validated: boolean("chain_validated").default(false).notNull(),
  
  created_by: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_territory_snapshot_master").on(table.master_id),
  index("idx_territory_snapshot_territory").on(table.territory_definition_id),
  index("idx_territory_snapshot_created").on(table.created_at),
  index("idx_territory_snapshot_previous").on(table.previous_snapshot_id),
  uniqueIndex("idx_territory_snapshot_hash").on(table.snapshot_hash), // Ensure unique snapshots
]);

export const insertMasterTerritoryAuditSnapshotSchema = createInsertSchema(master_territory_audit_snapshots).omit({
  id: true,
  created_at: true,
});
export type InsertMasterTerritoryAuditSnapshot = z.infer<typeof insertMasterTerritoryAuditSnapshotSchema>;
export type MasterTerritoryAuditSnapshot = typeof master_territory_audit_snapshots.$inferSelect;

// ========== MASTER FRAUD EVENTS ==========
// Records all fraud detection events for Master Franchisees
// Supports: detection, prevention, investigation, resolution workflow

export const master_fraud_events = pgTable("master_fraud_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Who triggered the fraud event
  master_id: varchar("master_id").notNull().references(() => master_accounts.id, { onDelete: 'cascade' }),
  
  // Fraud type - matches the antifraud flags defined in replit.md
  fraud_type: varchar("fraud_type", { length: 50 }).notNull(),
  // MASTER_TERRITORY_OVERREACH, MASTER_UNAUTHORIZED_SALE, MASTER_OVERLAP_BREACH,
  // MASTER_SELF_SPLIT_ATTEMPT, MASTER_DATA_MANIPULATION, MASTER_PRIVILEGE_ESCALATION
  
  // Severity level
  severity: varchar("severity", { length: 20 }).notNull().default('medium'),
  // low, medium, high, critical
  
  // Event status workflow
  status: varchar("status", { length: 20 }).notNull().default('detected'),
  // detected, investigating, confirmed, false_positive, resolved, escalated
  
  // Detection context
  detection_source: varchar("detection_source", { length: 50 }).notNull(),
  // automatic, manual_report, audit, system_check
  
  detection_timestamp: timestamp("detection_timestamp").defaultNow().notNull(),
  
  // Evidence and context
  evidence_snapshot: jsonb("evidence_snapshot").notNull(),
  // Contains: action attempted, location, territory involved, amounts, etc.
  
  related_territory_id: varchar("related_territory_id").references(() => territory_definitions.id, { onDelete: 'set null' }),
  related_franchise_id: varchar("related_franchise_id").references(() => franchises.id, { onDelete: 'set null' }),
  related_transaction_amount: decimal("related_transaction_amount", { precision: 20, scale: 8 }),
  
  // Action taken
  action_taken: varchar("action_taken", { length: 50 }),
  // blocked, warned, suspended, reported_to_hq, none
  
  action_details: text("action_details"),
  action_timestamp: timestamp("action_timestamp"),
  action_by: varchar("action_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Resolution
  resolution_notes: text("resolution_notes"),
  resolved_at: timestamp("resolved_at"),
  resolved_by: varchar("resolved_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Escalation
  escalated_to_hq: boolean("escalated_to_hq").default(false).notNull(),
  escalation_timestamp: timestamp("escalation_timestamp"),
  escalation_reference: varchar("escalation_reference", { length: 100 }),
  
  // Metadata
  ip_address: varchar("ip_address", { length: 45 }),
  user_agent: text("user_agent"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_fraud_event_master").on(table.master_id),
  index("idx_fraud_event_type").on(table.fraud_type),
  index("idx_fraud_event_status").on(table.status),
  index("idx_fraud_event_severity").on(table.severity),
  index("idx_fraud_event_detection").on(table.detection_timestamp),
  index("idx_fraud_event_territory").on(table.related_territory_id),
]);

export const insertMasterFraudEventSchema = createInsertSchema(master_fraud_events).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertMasterFraudEvent = z.infer<typeof insertMasterFraudEventSchema>;
export type MasterFraudEvent = typeof master_fraud_events.$inferSelect;

// ========== FRAUD ALERTS ==========
// Real-time alerts for fraud events requiring immediate attention

export const master_fraud_alerts = pgTable("master_fraud_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  fraud_event_id: varchar("fraud_event_id").notNull().references(() => master_fraud_events.id, { onDelete: 'cascade' }),
  
  // Alert recipients
  alert_type: varchar("alert_type", { length: 30 }).notNull(),
  // email, sms, in_app, webhook
  
  recipient_user_id: varchar("recipient_user_id").references(() => users.id, { onDelete: 'set null' }),
  recipient_email: varchar("recipient_email", { length: 255 }),
  recipient_phone: varchar("recipient_phone", { length: 20 }),
  
  // Alert content
  alert_title: varchar("alert_title", { length: 200 }).notNull(),
  alert_message: text("alert_message").notNull(),
  alert_priority: varchar("alert_priority", { length: 20 }).notNull().default('normal'),
  // low, normal, high, urgent
  
  // Delivery status
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  // pending, sent, delivered, failed, acknowledged
  
  sent_at: timestamp("sent_at"),
  delivered_at: timestamp("delivered_at"),
  acknowledged_at: timestamp("acknowledged_at"),
  acknowledged_by: varchar("acknowledged_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Retry tracking
  retry_count: integer("retry_count").default(0).notNull(),
  last_retry_at: timestamp("last_retry_at"),
  failure_reason: text("failure_reason"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_fraud_alert_event").on(table.fraud_event_id),
  index("idx_fraud_alert_recipient").on(table.recipient_user_id),
  index("idx_fraud_alert_status").on(table.status),
  index("idx_fraud_alert_priority").on(table.alert_priority),
]);

// ============================================================================
// AI LEARNING SYSTEM - Padrões Aprendidos V2.0+
// ============================================================================

// Pattern types for campaign learning
export const CAMPAIGN_PATTERN_TYPES = [
  "entry_timing",        // Best times to enter trades
  "exit_optimization",   // Optimal exit strategies
  "symbol_performance",  // Which symbols perform best
  "risk_sizing",         // Optimal position sizing
  "circuit_breaker",     // CB trigger patterns
  "regime_adaptation",   // Market regime responses
  "slippage_impact",     // Slippage patterns by symbol/time
  "rbm_optimization",    // RBM multiplier usage patterns
] as const;
export type CampaignPatternType = typeof CAMPAIGN_PATTERN_TYPES[number];

// Pattern confidence levels
export const PATTERN_CONFIDENCE_LEVELS = ["low", "medium", "high", "very_high"] as const;
export type PatternConfidenceLevel = typeof PATTERN_CONFIDENCE_LEVELS[number];

// Campaign Patterns - Learned patterns from campaign trading history
export const campaign_patterns = pgTable("campaign_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Scope (can be global, per-portfolio, or per-campaign)
  scope: varchar("scope", { length: 20 }).notNull(), // global, portfolio, campaign
  portfolio_id: varchar("portfolio_id").references(() => portfolios.id, { onDelete: 'cascade' }),
  campaign_id: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  
  // Pattern identification
  pattern_type: varchar("pattern_type", { length: 30 }).notNull(),
  pattern_name: varchar("pattern_name", { length: 100 }).notNull(),
  pattern_description: text("pattern_description"),
  
  // Pattern data (JSON structure varies by type)
  pattern_data: jsonb("pattern_data").notNull(),
  
  // Statistical validation
  sample_size: integer("sample_size").notNull(), // Number of trades analyzed
  confidence_level: varchar("confidence_level", { length: 20 }).notNull(), // low, medium, high, very_high
  confidence_score: decimal("confidence_score", { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  statistical_significance: decimal("statistical_significance", { precision: 5, scale: 4 }), // p-value
  
  // Performance metrics
  expected_improvement_pct: decimal("expected_improvement_pct", { precision: 10, scale: 4 }),
  backtested: boolean("backtested").default(false).notNull(),
  backtest_result: jsonb("backtest_result"), // { pnl_impact, hit_rate_change, etc }
  
  // AI analysis
  ai_reasoning: text("ai_reasoning"), // GPT explanation of pattern
  ai_recommendation: text("ai_recommendation"), // How to use this pattern
  
  // Lifecycle
  is_active: boolean("is_active").default(true).notNull(),
  last_validated_at: timestamp("last_validated_at"),
  expires_at: timestamp("expires_at"), // Patterns can expire
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_campaign_pattern_scope").on(table.scope),
  index("idx_campaign_pattern_portfolio").on(table.portfolio_id),
  index("idx_campaign_pattern_campaign").on(table.campaign_id),
  index("idx_campaign_pattern_type").on(table.pattern_type),
  index("idx_campaign_pattern_confidence").on(table.confidence_level),
  index("idx_campaign_pattern_active").on(table.is_active),
]);

export const insertCampaignPatternSchema = createInsertSchema(campaign_patterns).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertCampaignPattern = z.infer<typeof insertCampaignPatternSchema>;
export type CampaignPattern = typeof campaign_patterns.$inferSelect;

// Opportunity Pattern Types
export const OPPORTUNITY_PATTERN_TYPES = [
  "approval_success",    // What makes approved COs succeed
  "rejection_avoidance", // Common rejection patterns to avoid
  "scoring_calibration", // How to improve scoring accuracy
  "timing_optimization", // Best times to present COs
  "thesis_performance",  // Which thesis types perform best
  "capital_sizing",      // Optimal capital recommendations
] as const;
export type OpportunityPatternType = typeof OPPORTUNITY_PATTERN_TYPES[number];

// Opportunity Patterns - Learned patterns from opportunity decisions
export const opportunity_patterns = pgTable("opportunity_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Scope
  scope: varchar("scope", { length: 20 }).notNull(), // global, portfolio, user
  user_id: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  portfolio_id: varchar("portfolio_id").references(() => portfolios.id, { onDelete: 'cascade' }),
  
  // Pattern identification
  pattern_type: varchar("pattern_type", { length: 30 }).notNull(),
  pattern_name: varchar("pattern_name", { length: 100 }).notNull(),
  pattern_description: text("pattern_description"),
  
  // Pattern data
  pattern_data: jsonb("pattern_data").notNull(),
  
  // Validation metrics
  sample_size: integer("sample_size").notNull(),
  confidence_level: varchar("confidence_level", { length: 20 }).notNull(),
  confidence_score: decimal("confidence_score", { precision: 5, scale: 4 }),
  
  // Decision impact metrics
  approval_rate_impact: decimal("approval_rate_impact", { precision: 10, scale: 4 }),
  success_rate_improvement: decimal("success_rate_improvement", { precision: 10, scale: 4 }),
  avg_pnl_improvement: decimal("avg_pnl_improvement", { precision: 10, scale: 4 }),
  
  // AI analysis
  ai_reasoning: text("ai_reasoning"),
  ai_recommendation: text("ai_recommendation"),
  
  // Lifecycle
  is_active: boolean("is_active").default(true).notNull(),
  last_validated_at: timestamp("last_validated_at"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_opp_pattern_scope").on(table.scope),
  index("idx_opp_pattern_user").on(table.user_id),
  index("idx_opp_pattern_portfolio").on(table.portfolio_id),
  index("idx_opp_pattern_type").on(table.pattern_type),
  index("idx_opp_pattern_active").on(table.is_active),
]);

export const insertOpportunityPatternSchema = createInsertSchema(opportunity_patterns).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertOpportunityPattern = z.infer<typeof insertOpportunityPatternSchema>;
export type OpportunityPattern = typeof opportunity_patterns.$inferSelect;

// Learning Run History - Track learning analysis runs
export const learning_runs = pgTable("learning_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Run type
  learner_type: varchar("learner_type", { length: 30 }).notNull(), // campaign, opportunity
  run_trigger: varchar("run_trigger", { length: 30 }).notNull(), // scheduled, manual, event_based
  
  // Scope
  scope: varchar("scope", { length: 20 }).notNull(),
  portfolio_id: varchar("portfolio_id").references(() => portfolios.id, { onDelete: 'cascade' }),
  campaign_id: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  user_id: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  
  // Analysis parameters
  analysis_window_start: timestamp("analysis_window_start").notNull(),
  analysis_window_end: timestamp("analysis_window_end").notNull(),
  min_sample_size: integer("min_sample_size").notNull(),
  
  // Results
  status: varchar("status", { length: 20 }).notNull(), // running, completed, failed
  patterns_discovered: integer("patterns_discovered").default(0).notNull(),
  patterns_updated: integer("patterns_updated").default(0).notNull(),
  patterns_invalidated: integer("patterns_invalidated").default(0).notNull(),
  
  // AI usage
  ai_tokens_used: integer("ai_tokens_used").default(0).notNull(),
  ai_model_used: varchar("ai_model_used", { length: 50 }),
  
  // Performance
  duration_ms: integer("duration_ms"),
  error_message: text("error_message"),
  
  // Summary
  run_summary: jsonb("run_summary"), // { insights, recommendations, metrics }
  
  started_at: timestamp("started_at").defaultNow().notNull(),
  completed_at: timestamp("completed_at"),
}, (table) => [
  index("idx_learning_run_type").on(table.learner_type),
  index("idx_learning_run_status").on(table.status),
  index("idx_learning_run_portfolio").on(table.portfolio_id),
  index("idx_learning_run_started").on(table.started_at),
]);

export const insertLearningRunSchema = createInsertSchema(learning_runs).omit({
  id: true,
  started_at: true,
});
export type InsertLearningRun = z.infer<typeof insertLearningRunSchema>;
export type LearningRun = typeof learning_runs.$inferSelect;

// ========== VRE (Volatility Regime Engine) V2.0+ ==========

// VRE Decision Logs - immutable log of all VRE regime decisions
export const vre_decision_logs = pgTable("vre_decision_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Campaign reference (nullable for standalone VRE analysis)
  campaign_id: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  
  // Symbol analyzed
  symbol: varchar("symbol", { length: 20 }).notNull(),
  
  // Regime transition
  previous_regime: varchar("previous_regime", { length: 10 }), // LOW, NORMAL, HIGH, EXTREME
  new_regime: varchar("new_regime", { length: 10 }).notNull(),
  
  // VRE metrics
  z_score: decimal("z_score", { precision: 10, scale: 6 }).notNull(),
  rv_ratio: decimal("rv_ratio", { precision: 10, scale: 6 }).notNull(),
  rv_short: decimal("rv_short", { precision: 10, scale: 6 }).notNull(),
  rv_long: decimal("rv_long", { precision: 10, scale: 6 }).notNull(),
  rv_long_mean: decimal("rv_long_mean", { precision: 10, scale: 6 }).notNull(),
  rv_long_std: decimal("rv_long_std", { precision: 10, scale: 6 }).notNull(),
  
  // Confidence and classification method
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(),
  method_used: varchar("method_used", { length: 20 }).notNull(), // z_score, rv_ratio
  
  // State tracking
  regime_changed: boolean("regime_changed").notNull(),
  blocked_by_cooldown: boolean("blocked_by_cooldown").default(false).notNull(),
  blocked_by_hysteresis: boolean("blocked_by_hysteresis").default(false).notNull(),
  confirmations_count: integer("confirmations_count").default(0).notNull(),
  cycles_in_regime: integer("cycles_in_regime").default(0).notNull(),
  cooldown_remaining: integer("cooldown_remaining").default(0).notNull(),
  
  // Integrity
  decision_hash: varchar("decision_hash", { length: 64 }).notNull(),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_vre_decision_campaign").on(table.campaign_id),
  index("idx_vre_decision_symbol").on(table.symbol),
  index("idx_vre_decision_regime").on(table.new_regime),
  index("idx_vre_decision_created").on(table.created_at),
  index("idx_vre_decision_changed").on(table.regime_changed),
]);

export const insertVreDecisionLogSchema = createInsertSchema(vre_decision_logs).omit({
  id: true,
  created_at: true,
});
export type InsertVreDecisionLog = z.infer<typeof insertVreDecisionLogSchema>;
export type VreDecisionLog = typeof vre_decision_logs.$inferSelect;

// VRE Regime Parameters - adaptive parameters by regime (Tables 1-5 from spec)
export const vre_regime_parameters = pgTable("vre_regime_parameters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Regime this config applies to
  regime: varchar("regime", { length: 10 }).notNull(), // LOW, NORMAL, HIGH, EXTREME
  
  // Table 1: Entry Filters
  min_liquidity_percentile: decimal("min_liquidity_percentile", { precision: 5, scale: 2 }).notNull(),
  max_spread_pct: decimal("max_spread_pct", { precision: 5, scale: 3 }).notNull(),
  max_slippage_pct: decimal("max_slippage_pct", { precision: 5, scale: 3 }).notNull(),
  volume_filter_multiplier: decimal("volume_filter_multiplier", { precision: 5, scale: 2 }).notNull(), // 0.9, 1.0, 1.2, 1.5
  max_correlation_limit: decimal("max_correlation_limit", { precision: 5, scale: 2 }).notNull(), // 0.50-0.75
  
  // Table 2: Stops & Take Profits (ATR-based)
  sl_atr_multiplier: decimal("sl_atr_multiplier", { precision: 5, scale: 2 }).notNull(),
  tp1_atr_multiplier: decimal("tp1_atr_multiplier", { precision: 5, scale: 2 }).notNull(),
  tp2_atr_multiplier: decimal("tp2_atr_multiplier", { precision: 5, scale: 2 }).notNull(),
  trailing_atr_multiplier: decimal("trailing_atr_multiplier", { precision: 5, scale: 2 }),
  partial_exit_1_pct: integer("partial_exit_1_pct").notNull(), // % of position to exit at TP1
  partial_exit_2_pct: integer("partial_exit_2_pct").notNull(), // % of position to exit at TP2
  
  // Table 3: Position Sizing
  m_size_multiplier: decimal("m_size_multiplier", { precision: 5, scale: 2 }).notNull(), // 0.80 to 1.25
  max_heat_pct: decimal("max_heat_pct", { precision: 5, scale: 2 }).notNull(),
  
  // Table 4: Trade Frequency
  max_trades_per_6h: integer("max_trades_per_6h").notNull(),
  cooldown_after_loss_minutes: integer("cooldown_after_loss_minutes").notNull(),
  cooldown_after_win_minutes: integer("cooldown_after_win_minutes").notNull(),
  
  // Table 5: Pyramiding
  pyramiding_allowed: boolean("pyramiding_allowed").default(false).notNull(),
  max_pyramid_adds: integer("max_pyramid_adds").default(0).notNull(),
  pyramid_distance_atr: decimal("pyramid_distance_atr", { precision: 5, scale: 2 }),
  pyramid_size_reduction_pct: integer("pyramid_size_reduction_pct"), // Each add is X% smaller
  
  // Metadata
  is_default: boolean("is_default").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_vre_params_regime").on(table.regime),
  index("idx_vre_params_default").on(table.is_default),
]);

export const insertVreRegimeParametersSchema = createInsertSchema(vre_regime_parameters).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertVreRegimeParameters = z.infer<typeof insertVreRegimeParametersSchema>;
export type VreRegimeParameters = typeof vre_regime_parameters.$inferSelect;

// Basket Audit Trail - durable storage for basket generation and correlation audit
export const basket_audit_logs = pgTable("basket_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Basket identification
  basket_id: varchar("basket_id", { length: 64 }).notNull().unique(),
  
  // Generation metadata
  generated_at: timestamp("generated_at").notNull(),
  expires_at: timestamp("expires_at").notNull(),
  generation_time_ms: integer("generation_time_ms").notNull(),
  
  // Basket summary
  total_assets: integer("total_assets").notNull(),
  clusters_used: integer("clusters_used").notNull(),
  is_complete: boolean("is_complete").default(false).notNull(),
  
  // Correlation audit data
  correlation_method: varchar("correlation_method", { length: 20 }).notNull(), // empirical, fallback, mixed
  empirical_coverage_pct: integer("empirical_coverage_pct").notNull(),
  avg_btc_correlation: decimal("avg_btc_correlation", { precision: 8, scale: 6 }).notNull(),
  avg_intra_cluster_correlation: decimal("avg_intra_cluster_correlation", { precision: 8, scale: 6 }).notNull(),
  assets_excluded_by_correlation: integer("assets_excluded_by_correlation").notNull(),
  
  // Full audit payload (immutable snapshot)
  correlation_matrix_snapshot: jsonb("correlation_matrix_snapshot").notNull(), // CorrelationMatrixEntry[]
  pairwise_correlations: jsonb("pairwise_correlations").notNull(), // PairwiseCorrelation[]
  exclusion_events: jsonb("exclusion_events").notNull(), // CorrelationExclusionEvent[]
  cluster_baskets: jsonb("cluster_baskets").notNull(), // ClusterBasket[]
  cluster_deficits: jsonb("cluster_deficits"), // ClusterDeficit[]
  
  // Integrity hash for tamper detection
  audit_hash: varchar("audit_hash", { length: 64 }).notNull(),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_basket_audit_basket_id").on(table.basket_id),
  index("idx_basket_audit_generated_at").on(table.generated_at),
  index("idx_basket_audit_correlation_method").on(table.correlation_method),
]);

export const insertBasketAuditLogSchema = createInsertSchema(basket_audit_logs).omit({
  id: true,
  created_at: true,
});
export type InsertBasketAuditLog = z.infer<typeof insertBasketAuditLogSchema>;
export type BasketAuditLog = typeof basket_audit_logs.$inferSelect;

// ============================================================================
// PERSONA AUTHENTICATION SYSTEM - Separate login per persona
// ============================================================================

// Persona Credentials - stores login credentials for each persona type
export const persona_credentials = pgTable("persona_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Persona type: franchisor, master_franchise, franchise
  persona_type: varchar("persona_type", { length: 30 }).notNull(),
  
  // Email/password authentication
  email: varchar("email", { length: 255 }).notNull(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  
  // Link to related entity
  user_id: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  franchise_id: varchar("franchise_id").references(() => franchises.id, { onDelete: 'set null' }),
  
  // Account status
  is_active: boolean("is_active").default(false).notNull(), // Activated after email confirmation
  is_verified: boolean("is_verified").default(false).notNull(),
  
  // Activation token
  activation_token: varchar("activation_token", { length: 100 }),
  activation_token_expires: timestamp("activation_token_expires"),
  activated_at: timestamp("activated_at"),
  
  // Password reset
  reset_token: varchar("reset_token", { length: 100 }),
  reset_token_expires: timestamp("reset_token_expires"),
  
  // Login tracking
  last_login_at: timestamp("last_login_at"),
  login_count: integer("login_count").default(0).notNull(),
  failed_login_count: integer("failed_login_count").default(0).notNull(),
  locked_until: timestamp("locked_until"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_persona_cred_type").on(table.persona_type),
  index("idx_persona_cred_user").on(table.user_id),
  index("idx_persona_cred_franchise").on(table.franchise_id),
  // CRITICAL: Each email can only be used ONCE across ALL persona types
  // Prevents cross-persona login reuse (Franchisor email != Master Franchise email != Franchise email)
  uniqueIndex("idx_persona_cred_unique_email").on(table.email),
]);

export const insertPersonaCredentialsSchema = createInsertSchema(persona_credentials).omit({
  id: true,
  created_at: true,
  updated_at: true,
  activated_at: true,
  last_login_at: true,
});
export type InsertPersonaCredentials = z.infer<typeof insertPersonaCredentialsSchema>;
export type PersonaCredentials = typeof persona_credentials.$inferSelect;

// Persona Sessions - persistent session storage for persona authentication
export const persona_sessions = pgTable("persona_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Session token (64 hex chars from crypto.randomBytes(32))
  session_token: varchar("session_token", { length: 64 }).notNull().unique(),
  
  // Link to credentials
  credentials_id: varchar("credentials_id").notNull().references(() => persona_credentials.id, { onDelete: 'cascade' }),
  
  // Persona info (denormalized for quick access)
  persona_type: varchar("persona_type", { length: 30 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  franchise_id: varchar("franchise_id"),
  
  // Session expiry
  expires_at: timestamp("expires_at").notNull(),
  
  // Tracking
  created_at: timestamp("created_at").defaultNow().notNull(),
  last_accessed_at: timestamp("last_accessed_at").defaultNow().notNull(),
  ip_address: varchar("ip_address", { length: 45 }),
  user_agent: text("user_agent"),
}, (table) => [
  index("idx_persona_session_token").on(table.session_token),
  index("idx_persona_session_expires").on(table.expires_at),
  index("idx_persona_session_credentials").on(table.credentials_id),
]);

export const insertPersonaSessionSchema = createInsertSchema(persona_sessions).omit({
  id: true,
  created_at: true,
  last_accessed_at: true,
});
export type InsertPersonaSession = z.infer<typeof insertPersonaSessionSchema>;
export type PersonaSession = typeof persona_sessions.$inferSelect;

// Franchise Leads - candidates from landing page awaiting approval
export const franchise_leads = pgTable("franchise_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Auto-generated franchise name: DELFOS-XXXXXXXX
  franchise_code: varchar("franchise_code", { length: 20 }).notNull().unique(),
  
  // Plan selection
  plan_id: varchar("plan_id").references(() => franchise_plans.id),
  
  // Business info
  name: varchar("name", { length: 200 }).notNull(), // Full name / Razão Social
  trade_name: varchar("trade_name", { length: 200 }), // Fantasia
  document_type: varchar("document_type", { length: 10 }).notNull(), // 'cpf' or 'cnpj'
  document_number: varchar("document_number", { length: 20 }).notNull(), // CPF/CNPJ
  secondary_document: varchar("secondary_document", { length: 30 }), // RG / Inscrição Estadual
  birth_date: timestamp("birth_date"),
  
  // Address fields
  address_street: varchar("address_street", { length: 255 }),
  address_number: varchar("address_number", { length: 20 }),
  address_complement: varchar("address_complement", { length: 100 }),
  address_reference: varchar("address_reference", { length: 200 }),
  address_neighborhood: varchar("address_neighborhood", { length: 100 }),
  address_zip: varchar("address_zip", { length: 20 }),
  address_city: varchar("address_city", { length: 100 }),
  address_country: varchar("address_country", { length: 3 }).default("BRA"),
  
  // Contact
  phone: varchar("phone", { length: 30 }),
  whatsapp: varchar("whatsapp", { length: 30 }),
  email: varchar("email", { length: 255 }).notNull(),
  
  // Documents upload (JSON array of URLs)
  documents_urls: jsonb("documents_urls"), // [{type: 'rg', url: '...'}, {type: 'cnpj', url: '...'}]
  
  // Lead status: pending, approved, rejected
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  
  // Review by Franqueadora
  reviewed_by: varchar("reviewed_by").references(() => users.id),
  reviewed_at: timestamp("reviewed_at"),
  rejection_reason: text("rejection_reason"),
  
  // If approved, link to created franchise
  approved_franchise_id: varchar("approved_franchise_id").references(() => franchises.id),
  
  // Activation token for account setup
  activation_token: varchar("activation_token", { length: 100 }),
  activation_token_expires: timestamp("activation_token_expires"),
  
  // General notes
  notes: text("notes"),
  
  // Source tracking
  source: varchar("source", { length: 50 }).default("landing_page"), // landing_page, referral, manual
  referral_code: varchar("referral_code", { length: 50 }),
  utm_source: varchar("utm_source", { length: 100 }),
  utm_medium: varchar("utm_medium", { length: 100 }),
  utm_campaign: varchar("utm_campaign", { length: 100 }),
  
  // IP and device for fraud prevention
  ip_address: varchar("ip_address", { length: 45 }),
  user_agent: text("user_agent"),
  
  // ========== PAYMENT FIELDS (Stripe Integration) ==========
  // Payment status: pending, paid, failed, refunded
  payment_status: varchar("payment_status", { length: 20 }).default("pending").notNull(),
  stripe_checkout_session_id: varchar("stripe_checkout_session_id", { length: 255 }),
  stripe_payment_intent_id: varchar("stripe_payment_intent_id", { length: 255 }),
  stripe_customer_id: varchar("stripe_customer_id", { length: 255 }),
  payment_method: varchar("payment_method", { length: 30 }), // card, pix, boleto
  payment_amount_cents: integer("payment_amount_cents"), // Amount in cents (from plan)
  payment_currency: varchar("payment_currency", { length: 3 }).default("BRL"),
  paid_at: timestamp("paid_at"),
  payment_receipt_url: text("payment_receipt_url"),
  
  // Auto pre-approval: true when docs uploaded AND payment confirmed
  documents_uploaded: boolean("documents_uploaded").default(false).notNull(),
  auto_pre_approved: boolean("auto_pre_approved").default(false).notNull(),
  pre_approved_at: timestamp("pre_approved_at"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_franchise_leads_status").on(table.status),
  index("idx_franchise_leads_email").on(table.email),
  index("idx_franchise_leads_code").on(table.franchise_code),
  index("idx_franchise_leads_created").on(table.created_at),
  index("idx_franchise_leads_payment").on(table.payment_status),
  index("idx_franchise_leads_stripe_session").on(table.stripe_checkout_session_id),
  // CRITICAL: Prevent duplicate registrations by same person (CPF/CNPJ + status)
  uniqueIndex("idx_franchise_leads_document_active").on(table.document_number, table.status),
]);

export const insertFranchiseLeadSchema = createInsertSchema(franchise_leads).omit({
  id: true,
  created_at: true,
  updated_at: true,
  reviewed_at: true,
});
export type InsertFranchiseLead = z.infer<typeof insertFranchiseLeadSchema>;
export type FranchiseLead = typeof franchise_leads.$inferSelect;

// Franchise Fiscal Profile - tax configuration for franchise (internal panel)
export const franchise_fiscal_profiles = pgTable("franchise_fiscal_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  franchise_id: varchar("franchise_id").notNull().references(() => franchises.id, { onDelete: 'cascade' }).unique(),
  
  // Tax regime
  tax_regime: varchar("tax_regime", { length: 30 }).notNull(), // simples, lucro_presumido, lucro_real, mei
  
  // Municipal inscription
  municipal_inscription: varchar("municipal_inscription", { length: 50 }),
  
  // Applicable tax rates (percentages)
  tax_rate_iss: decimal("tax_rate_iss", { precision: 5, scale: 2 }), // ISS %
  tax_rate_pis: decimal("tax_rate_pis", { precision: 5, scale: 2 }), // PIS %
  tax_rate_cofins: decimal("tax_rate_cofins", { precision: 5, scale: 2 }), // COFINS %
  tax_rate_irpj: decimal("tax_rate_irpj", { precision: 5, scale: 2 }), // IRPJ %
  tax_rate_csll: decimal("tax_rate_csll", { precision: 5, scale: 2 }), // CSLL %
  tax_rate_other: decimal("tax_rate_other", { precision: 5, scale: 2 }), // Other %
  
  // Notes
  notes: text("notes"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_fiscal_profile_franchise").on(table.franchise_id),
  index("idx_fiscal_profile_regime").on(table.tax_regime),
]);

export const insertFranchiseFiscalProfileSchema = createInsertSchema(franchise_fiscal_profiles).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertFranchiseFiscalProfile = z.infer<typeof insertFranchiseFiscalProfileSchema>;
export type FranchiseFiscalProfile = typeof franchise_fiscal_profiles.$inferSelect;

// ========== EXTERNAL SERVICE SETTINGS (Franchisor Cost Control) ==========
// Global toggles for external services - controlled exclusively by Franchisor
export const external_service_settings = pgTable("external_service_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Service identifier: redis, openai, stripe, kraken, twitter, etc.
  service_key: varchar("service_key", { length: 50 }).notNull().unique(),
  
  // Display name for UI
  service_name: varchar("service_name", { length: 100 }).notNull(),
  
  // Service description
  description: text("description"),
  
  // Category: data, ai, payment, trading, social
  category: varchar("category", { length: 30 }).notNull(),
  
  // Toggle state: true = enabled, false = disabled
  is_enabled: boolean("is_enabled").default(true).notNull(),
  
  // Priority/criticality level: critical, important, optional
  criticality: varchar("criticality", { length: 20 }).default("optional").notNull(),
  
  // Warning message when disabled (shown to users)
  disabled_message: text("disabled_message"),
  
  // Who last changed this setting
  last_changed_by: varchar("last_changed_by").references(() => users.id),
  last_changed_at: timestamp("last_changed_at"),
  
  // Reason for last change (audit trail)
  change_reason: text("change_reason"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_external_service_key").on(table.service_key),
  index("idx_external_service_category").on(table.category),
  index("idx_external_service_enabled").on(table.is_enabled),
]);

export const insertExternalServiceSettingSchema = createInsertSchema(external_service_settings).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertExternalServiceSetting = z.infer<typeof insertExternalServiceSettingSchema>;
export type ExternalServiceSetting = typeof external_service_settings.$inferSelect;

// Audit log for service toggle changes
export const external_service_audit_log = pgTable("external_service_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  service_key: varchar("service_key", { length: 50 }).notNull(),
  
  // Previous and new state
  previous_state: boolean("previous_state").notNull(),
  new_state: boolean("new_state").notNull(),
  
  // Who made the change
  changed_by: varchar("changed_by").references(() => users.id),
  
  // Reason for change
  reason: text("reason"),
  
  // IP address for security audit
  ip_address: varchar("ip_address", { length: 45 }),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_service_audit_service").on(table.service_key),
  index("idx_service_audit_date").on(table.created_at),
]);

export const insertExternalServiceAuditLogSchema = createInsertSchema(external_service_audit_log).omit({
  id: true,
  created_at: true,
});
export type InsertExternalServiceAuditLog = z.infer<typeof insertExternalServiceAuditLogSchema>;
export type ExternalServiceAuditLog = typeof external_service_audit_log.$inferSelect;

// ========== FRANCHISOR LOGIN (Simple Email/Password Authentication) ==========
export const franchisor_users = pgTable("franchisor_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cpf_cnpj: varchar("cpf_cnpj", { length: 20 }), // CPF or CNPJ
  phone: varchar("phone", { length: 20 }), // Phone number
  role_title: varchar("role_title", { length: 100 }), // Job title/role
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  last_login_at: timestamp("last_login_at"),
});

export const insertFranchisorUserSchema = createInsertSchema(franchisor_users).omit({
  id: true,
  created_at: true,
  last_login_at: true,
});
export type InsertFranchisorUser = z.infer<typeof insertFranchisorUserSchema>;
export type FranchisorUser = typeof franchisor_users.$inferSelect;
