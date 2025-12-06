# DELFOS Trading Platform

## Overview
DELFOS is an AI-assisted cryptocurrency day trading platform for professional traders, offering live execution, advanced performance analytics, and robust risk management. It integrates with Kraken for real-time market data, provides secure position trading with PnL tracking, and automates asset selection using quantitative filtering and K-means clustering. The platform prioritizes user experience, security, capital protection, and real-time data, aiming to provide a comprehensive trading environment across desktop and mobile.

## User Preferences
- Preferred communication style: Simple, everyday language (non-technical)
- Design preference: DELFOS metallic logo-inspired aesthetic with steel blue (#5B9FB5), cyan highlight (#7DD3E8), metallic silver (#A8B5BD), and deep charcoal (#1A1D23)
- Platform requirements: Must work on mobile (Android, iOS, HyperOS)
- Language support: English, Spanish, Portuguese BR

## System Architecture

### UI/UX Decisions
The platform features a premium metallic design inspired by the DELFOS logo, using a steel blue and cyan color palette, with both light and dark themes. It uses the Inter font and leverages `shadcn/ui` (built on Radix UI and Tailwind CSS) for a modern, responsive experience. The DELFOS logo is prominently displayed. Internationalization supports English, Spanish, and Brazilian Portuguese, with preferences stored locally.

### Technical Implementations
The frontend is built with React 18, TypeScript, and Vite, utilizing Wouter for routing, TanStack Query for server state, and React Context for global UI state. The backend is an Express.js application in TypeScript. Authentication uses Replit Auth (OIDC) and Passport.js, with sessions stored in PostgreSQL for persistence across server restarts. APIs are RESTful and secured with authentication middleware. Drizzle ORM provides type-safe PostgreSQL interactions.

**API Request Standards:** All mutation operations use `apiRequest(url, method, data)` helper, which handles JSON parsing and error throwing automatically. The frontend automatically redirects to login when receiving 401 Unauthorized responses.

**Query Client Conventions:** `getQueryFn` supports query parameters as objects, converting the last object in a `queryKey` to query string parameters. All mutations capture identifiers at mutate-time to prevent race conditions.

**Session Management:** Uses PostgreSQL-backed session store (`connect-pg-simple`) instead of memory store to persist sessions across server restarts and deployments. Sessions are stored in the `user_sessions` table with 1-week TTL.

### Feature Specifications
- **Observability & Monitoring:** Fully implemented Prometheus system with custom metrics for PnL (portfolio, cluster, asset), Risk (VaR, ES, Drawdown), Execution (fill rate, slippage, rate limit hits), Data Quality (staleness, latency), Circuit Breakers, Trading counts, and Performance (hit rate, avg win/loss, profit factor).
- **Tax & Cost Tracking System:** Comprehensive tax calculation and tracking system for international fiscal compliance. It tracks real trade costs (fees, slippage, taxes) and applies specific tax logic per regime (e.g., Brazil's daily netting, US/EU per-trade, AE/SG zero-tax).
- **Paper Trading Mode:** A complete simulation environment for risk-free testing, mirroring live trading functionalities including real market prices, Kraken fees, and tiered slippage.
- **Automated Asset Selection:** Identifies tradable cryptocurrency pairs using a pipeline that fetches market data, applies configurable filters (volume, spread, depth, ATR), and performs K-means clustering.
- **Real-time Data Pipeline & Staleness Guards:** Connects to Kraken WebSocket for real-time ticks, L1/L2 data for 100 valid pairs, storing data in Redis with TTLs. Features a sophisticated three-level staleness guard system:
  - **Three-tier staleness detection**: WARN (4s), HARD (12s), KILL_SWITCH (60s) thresholds
  - **Auto-quarantine system**: Symbols stale >5min (300s) automatically quarantined, excluded from kill switch calculation, allow healthy pairs to continue trading
  - **Auto-recovery**: Quarantined symbols automatically restored when data resumes, with staleness reset
  - **Individual REST refresh**: Callback-based system triggers targeted REST refresh for symbols >WARN threshold, with 10s timeout and duplicate prevention
  - **Unsupported symbol detection**: Automatically detects and permanently excludes delisted/unsupported pairs from WebSocket subscription errors
  - **Defensive L2 validation**: `normalizeL2Level` function handles both WebSocket objects {price, quantity} and REST arrays ["price", "volume"], rejects invalid data (null/undefined, NaN/Infinite, non-positive, extreme magnitudes >1e12) with detailed logging
  - **Prometheus metrics**: Granular per-symbol monitoring via `quarantine_status` (0/1), `rest_refresh_count` (success/failure), and `invalid_l2_entries` (by symbol/side/reason) for comprehensive data quality tracking
  - **REST fallback mechanism**: Global fallback for complete WebSocket outages
- **Live Trading & Position Management:** Facilitates real-time order execution via Kraken API with HMAC-SHA512 authentication. Includes credential validation, market order polling with timeout, final status verification, error handling, and security restrictions for live mode.
- **Risk Management & Circuit Breakers:** Implements a comprehensive circuit breaker system with multiple layers:
  - **Three-layer loss-based breakers**: Asset, cluster, and global breakers halt trading based on predefined loss thresholds and configurable per-portfolio risk limits
  - **Staleness-based circuit breakers**: Integrated with real-time data pipeline to automatically trigger trading halts based on data freshness:
    - WARN level (>4s staleness): Blocks new position opens, allows existing positions to continue
    - HARD level (>12s staleness): Zeros all trading signals system-wide
    - KILL level (>60s staleness): Pauses global trading completely
  - **Singleton architecture**: Shared CircuitBreakerService instance across all trading services ensures consistent breaker state
  - **Auto-reset capability**: Breakers automatically reset when conditions normalize (staleness recovers or losses reduce)
  - **Prometheus integration**: Comprehensive metrics via `delfos_breaker_state`, `delfos_fallback_polling_active`, and staleness gauges
- **Trading Signals:** An ATR-based system generates trading signals, calculates OCO orders, and applies risk sizing. Stop Loss (SL) and Take Profit (TP) levels are calculated using ATR multipliers. **Note:** Trailing Stop functionality is not yet implemented - only fixed SL/TP based on ATR at entry time.
- **Operational Flow (Runbook):** Visual timeline showing the daily trading cycle with 5 phases: Selection (00:00), Distribution (00:05), Trading (throughout day), Rebalance (every 8h), and Audit (every 24h). The Operations page displays real-time status of each phase with staleness monitoring.
- **Cost-Integrated Position Sizing:** Automatically calculates position sizes, accounting for exchange fees and estimated slippage.
- **Automated Portfolio Rebalancing:** An 8-hour automated system optimizes portfolio allocations based on K-means cluster weights and integrates with the circuit breaker system. The CampaignManagerService orchestrates rebalancing, running immediately on campaign start and every 8 hours thereafter. Manual rebalance triggers are available via API.
- **Campaign Model:** Automated 30-day trading campaigns with lifecycle management:
  - **Lifecycle states**: active, paused, completed, stopped
  - **-10% drawdown circuit breaker**: Automatically stops campaigns when maximum drawdown threshold is breached
  - **Daily compounding**: Realized PnL can be reinvested into campaign equity
  - **8-hour rebalancing**: Integrated with CampaignManagerService for scheduled and manual rebalancing
  - **Equity snapshots**: Initial capital captured at campaign start for risk calculations
  - **Compliance views**: Data filtered by campaign period for trades, orders, and positions
  - **Timeline UI**: Progress visualization with translations (EN/ES/PT-BR), PnL display, and drawdown alerts
  - **Server-side date handling**: POST /api/campaigns converts ISO 8601 date strings to Date objects before Zod validation (fix for JSON serialization)
- **User Settings:** Manages user profiles, language/theme preferences, and securely stores Kraken API credentials using AES-256-GCM encryption.
- **Time-Series Data Backend:** Provides REST API endpoints for bars, orders, and decision logs with Zod validation.
- **Twitter/X News Feed:** Integrates a real-time crypto-related news feed.
- **API Token Authentication:** Supports external agent authentication for programmatic access:
  - **Token Generation**: Admin-only creation via Dashboard or API, generates `delfos_` prefixed tokens with 32-byte entropy
  - **Secure Storage**: Tokens stored as SHA-256 hashes (cannot be retrieved if lost)
  - **Permission System**: Granular permissions array per token (e.g., `['read', 'trade']`)
  - **Audit Trail**: Tracks `last_used_at` for monitoring and `created_by` for accountability
  - **Expiration Support**: Optional token expiration dates
  - **Dual Authentication**: `isAuthenticatedOrApiToken` middleware supports both session and Bearer token auth
  - **Admin Interface**: Full CRUD for tokens in Admin Dashboard (API Tokens tab)
  - **External Agent Support**: Designed for agents like CRYPTOTRADER INSIDER to access DELFOS programmatically

### System Design Choices
- **Hybrid Data Architecture:** Uses PostgreSQL for aggregated data and metadata, and Upstash Redis for high-frequency real-time market data with TTLs.
- **Database Schema:** Employs UUID primary keys, decimal types for financial precision, and performance indexes across core tables.
- **Performance Optimizations:** Incorporates Redis pipeline batching, semaphore throttling, and write coalescing for real-time order book updates. Dual-index symbol caching optimizes market data retrieval.

## External Dependencies
- **Authentication:** Replit OpenID Connect
- **Database:** Neon serverless PostgreSQL, Upstash Redis
- **Real-time Data & Trading:** Kraken cryptocurrency exchange (REST API, WebSocket)
- **News Feed:** Twitter/X API v2
- **Version Control:** GitHub integration via Replit Connectors (@octokit/rest) for code backup and repository management