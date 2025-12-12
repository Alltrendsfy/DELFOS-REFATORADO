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
export const portfolios = pgTable("portfolios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  trading_mode: text("trading_mode").default("paper").notNull(), // 'paper' or 'live'
  total_value_usd: decimal("total_value_usd", { precision: 20, scale: 2 }).default("0").notNull(),
  daily_pnl: decimal("daily_pnl", { precision: 20, scale: 2 }).default("0").notNull(),
  daily_pnl_percentage: decimal("daily_pnl_percentage", { precision: 10, scale: 4 }).default("0").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Positions table - stores active trading positions
export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
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
});

// Trades table - stores completed trades history
export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
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
});

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
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolio_id: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
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

// Risk Profile Configuration - stores predefined risk profiles (C/M/A)
export const risk_profile_config = pgTable("risk_profile_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profile_code: varchar("profile_code", { length: 1 }).notNull().unique(), // C, M, A
  profile_name: varchar("profile_name", { length: 50 }).notNull(), // Conservador, Moderado, Agressivo
  
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
  investor_profile: varchar("investor_profile", { length: 1 }).default("M").notNull(), // C, M, A (Conservador, Moderado, Agressivo)
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
}, (table) => [
  index("idx_campaigns_portfolio").on(table.portfolio_id),
  index("idx_campaigns_status").on(table.status),
  index("idx_campaigns_profile").on(table.investor_profile),
]);

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
  cb_cooldown_until: timestamp("cb_cooldown_until"),
  
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
