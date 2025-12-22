# DELFOS Trading Platform

## Overview
DELFOS is an AI-assisted cryptocurrency day trading platform for professional traders. It offers live execution, advanced performance analytics, and robust risk management by integrating with Kraken for real-time market data. The platform automates asset selection using quantitative filtering and K-means clustering, focusing on user experience, security, and capital protection across desktop and mobile environments. Its ambition is to be a comprehensive and cutting-edge solution for professional crypto traders. The platform also includes a sophisticated governance system for campaigns and an AI learning system for continuous improvement.

## User Preferences
- Preferred communication style: Simple, everyday language (non-technical)
- Design preference: DELFOS metallic logo-inspired aesthetic with steel blue (#5B9FB5), cyan highlight (#7DD3E8), metallic silver (#A8B5BD), and deep charcoal (#1A1D23)
- Platform requirements: Must work on mobile (Android, iOS, HyperOS)
- Language support: English, Spanish, Portuguese BR

## System Architecture

### UI/UX Decisions
The platform features a metallic design inspired by the DELFOS logo, utilizing a steel blue and cyan color palette, with both light and dark themes. It uses the Inter font and `shadcn/ui` for a modern, responsive user experience. Internationalization supports English, Spanish, and Brazilian Portuguese, with preferences stored locally.

### Technical Implementations
The frontend uses React 18, TypeScript, Vite, Wouter for routing, TanStack Query for server state, and React Context for global UI state. The backend is an Express.js application in TypeScript. Authentication uses Replit Auth (OIDC) and Passport.js, with sessions stored in PostgreSQL. Drizzle ORM is used for type-safe PostgreSQL interactions.

**Key Features:**
- **Observability & Monitoring:** Prometheus system with custom metrics.
- **Tax & Cost Tracking System:** Comprehensive tax calculation and tracking.
- **Paper Trading Mode:** A full simulation environment with real market data.
- **Automated Asset Selection:** Identifies tradable pairs using market data filtering and K-means clustering.
- **Real-time Data Pipeline & Staleness Guards:** Connects to Kraken WebSocket, stores data in Redis, and employs a three-level staleness guard system.
- **Live Trading & Position Management:** Facilitates real-time order execution via Kraken API.
- **Risk Management & Circuit Breakers:** Multi-layer circuit breaker system with VaR/ES-based protection.
- **Dynamic Position Sizing:** Adaptive risk scaling based on drawdown, VaR/ES, win rate, and market regime.
- **Market Regime Detection:** Automated classification (bull/bear/sideways) using SMAs, momentum, and volatility analysis.
- **Volatility Regime Engine (VRE) V2.0+:** Advanced 4-level volatility classification using rolling realized volatility Z-scores, with adaptive parameters for entry filters, stops/TPs, position sizing, trade frequency, and pyramiding based on regime and campaign profiles. Includes VRE circuit breakers for extreme spikes and whipsaw protection.
- **Feature Store (V2.0+ Phase 1):** Centralized feature aggregation for an Opportunity Engine, combining VRE regime, liquidity, momentum, and risk metrics.
- **Semantic Cluster System (V2.0+ Phase 1):** 10-cluster classification for asset behavior, dynamically classifying assets based on volume, volatility, momentum, spread, and correlation.
- **Opportunity Windows Dashboard (V2.0+ Phase 3.3):** Frontend visualization of detected opportunity windows, displaying active windows, scores, clusters, and allowing blueprint generation.
- **Trading Signals:** ATR-based system generates signals, calculates OCO orders, and applies fixed risk sizing.
- **Operational Flow:** Five-phase daily trading cycle with real-time status monitoring.
- **Cost-Integrated Position Sizing:** Calculates position sizes accounting for fees and slippage.
- **Automated Portfolio Rebalancing:** 8-hour system optimizes portfolio allocations based on K-means cluster weights.
- **Campaign Model & Engine:** Automated 30-day trading campaigns with lifecycle management, investor profiles, daily compounding, and isolated risk/positions/orders for multi-campaign trading.
- **Robot Activity Feed & Reporting:** Real-time logging of robot decisions and actions, with multi-level reporting.
- **User Settings:** Manages user profiles, preferences, and encrypted Kraken API credentials.
- **Time-Series Data Backend:** Provides REST API endpoints for bars, orders, and decision logs.
- **API Token Authentication:** Supports external agent authentication with granular permissions.

### RBM System (Risk-Based Multiplier) V2.0+
Complete risk multiplier system allowing authorized users to increase trading risk from 1× to 5× through progressive task completion:
- **36 Tasks in 8 Phases:** Progressive unlocking system with increasing complexity
- **Multiplier Limits by Plan:** starter=2.0×, pro=3.0×, enterprise=4.0×, master=5.0×
- **Quality Gate (6 Validations):** VRE regime check, circuit breaker status, drawdown <30%, antifraud limit (5/hour), spread/slippage thresholds, liquidity >80%
- **Auto-Rollback Triggers:** VRE regime change, 2 consecutive losses, 60% drawdown, whipsaw guard, slippage >0.10%
- **RBAC Permissions Matrix:**
  - Franchisor: canActivateRBM=false, canViewRBM=true, canSetRBMLimits=true
  - Franchise Owner/Master/Operator: canActivateRBM=true, canViewRBM=true, canSetRBMLimits=false
  - Analyst/Finance: canActivateRBM=false, canViewRBM=true, canSetRBMLimits=false
- **API Endpoints:** `/api/rbm/config`, `/api/rbm/permissions`, `/api/rbm/campaigns/:id/status`
- **Test Suite:** 126 unit tests covering core logic, Quality Gate, rollback triggers, RBAC, and API contracts
- **Security:** Permissions endpoint does not expose globalRole/franchiseRole fields

### Governance System V2.0+
An immutable governance system for trading campaigns ensuring data integrity and regulatory compliance, featuring campaign hash locks, an append-only audit ledger with hash chains, digital signatures, and exchange reconciliation against Kraken.

### AI Learning System (V2.0+ Prioridade 3)
Continuous improvement through pattern discovery and feedback loops:
- **CampaignPatternLearnerService:** Analyzes closed campaign positions using GPT-4o to discover trading patterns (entry timing, exit optimization, etc.) with confidence scoring.
- **OpportunityLearnerService:** Analyzes opportunity decision history to improve scoring calibration and optimize approval workflows.
- **Learning Runs:** Tracks historical analysis runs, AI token usage, and performance.
- **AI Learning Dashboard (V2.0+ Phase 3.5):** Frontend visualization for patterns, recommendations, and learning history.

### Franchise Management System
Manages DELFOS franchises, including immutable franchise plans, franchisee registration with granular permissions, a franchisor financial dashboard, and a Master Franchise system with a Territory Engine.

### Franchise Tenant Isolation (V2.0+)
Complete tenant isolation for each franchise with independent trading operations, preserving franchisor governance:
- **Franchise Exchange Accounts:** Each franchise stores its own encrypted Kraken API credentials (AES-256-GCM encryption via `encryptionService.ts`) in `franchise_exchange_accounts` table with unique constraint per exchange.
- **Trading Isolation:** Portfolios, positions, orders, and trades are scoped to franchises via `franchise_id` column with database indexes for efficient filtering.
- **Credential Resolution:** `campaignEngineService.ts` uses `getFranchiseCredentialsForCampaign()` helper to resolve credentials via portfolio→franchise chain, falling back to global env vars for paper trading.
- **Authorization:** Exchange account management requires franchisor role or franchise 'master' role; read-only access permitted for all franchise members.
- **UI Management:** FranchiseDetail.tsx provides interface for adding, verifying, and deleting exchange accounts with status badges and error display.
- **Franchisor Governance Preserved:** Franchisor retains full global access - `isFranchisor` bypasses all franchise_id filters. Storage helpers `getPortfoliosForAccess()` and `getCampaignsForAccess()` return ALL data when isFranchisor=true. All `/api/admin/*` routes use isAdmin middleware for global visibility.
- **Isolation Principle:** Tenant isolation blocks franchise↔franchise data leakage, but never restricts franchisor→franchise access.

### 3-Persona Authentication System (V2.0+)
Complete authentication system with distinct login pages and color schemes for Franchisor (Amber), Master Franchise (Blue), and Franchise (Cyan), including account activation and registration workflows.

### System Design Choices
- **Hybrid Data Architecture:** PostgreSQL for aggregated data, Upstash Redis for high-frequency market data.
- **Database Schema:** UUID primary keys, decimal types for financial precision, and performance indexes.
- **Performance Optimizations:** Redis pipeline batching, semaphore throttling, write coalescing, and dual-index symbol caching.
- **PostgreSQL Connection Management:** Neon HTTP pooling mode.

### Object Storage Integration
File uploads for franchise registration using Replit Object Storage (GCS backend):
- **Presigned URL Flow:** Two-step upload process - request presigned URL with metadata, then upload directly to GCS
- **Object Storage Routes:** Registered via `registerObjectStorageRoutes(app)` in server/routes.ts
- **Components:** `ObjectUploader.tsx` (Uppy v5 dashboard), `use-upload.ts` hook
- **Path Storage:** Backend returns stable `objectPath` values (e.g., `/objects/uploads/uuid`) stored in `documents_urls` jsonb column
- **Franchise Lead Documents:** franchise_leads table stores uploaded document references in `documents_urls` field

### External Services Control Dashboard (V2.0+)
Franchisor-exclusive dashboard for controlling external service connections to manage operational costs:
- **Services Managed:** Redis (Upstash), OpenAI (GPT-4), Stripe Payments, Kraken REST API, Kraken WebSocket, Twitter/X API
- **Service Categories:** Data (Redis), AI (OpenAI), Payment (Stripe), Trading (Kraken), Social (Twitter)
- **Criticality Levels:** Critical (Stripe, Kraken REST), Important (Redis, Kraken WS), Optional (OpenAI, Twitter)
- **Toggle Service:** `externalServiceToggleService.ts` provides singleton pattern with in-memory caching and database persistence
- **API Endpoints:** `/api/franchisor/external-services` (GET/PUT) with franchisor-only authorization
- **Audit Log:** All toggle changes are recorded with user ID, reason, IP address, and timestamp
- **Graceful Degradation:** Each service implements proper fallback behavior when disabled:
  - Redis: Functions return empty data, Kraken WS uses REST fallback
  - OpenAI: Returns friendly error messages
  - Twitter: News feed gracefully empty
  - Stripe: Returns critical service error (intentional - payment is essential)
  - Kraken REST: Returns empty market data arrays
  - Kraken WS: Automatically switches to REST polling when disabled
- **Schema:** `external_service_settings` and `external_service_audit_log` tables in PostgreSQL
- **Frontend:** `FranchisorExternalServices.tsx` with toggle switches, status badges, and audit log viewer

## External Dependencies
- **Authentication:** Replit OpenID Connect
- **Database:** Neon serverless PostgreSQL, Upstash Redis
- **Real-time Data & Trading:** Kraken cryptocurrency exchange (REST API, WebSocket)
- **News Feed:** Twitter/X API v2
- **Object Storage:** Replit Object Storage (GCS backend) for document uploads
- **Version Control:** GitHub integration via Replit Connectors