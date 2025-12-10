# DELFOS Trading Platform

## Overview
DELFOS is an AI-assisted cryptocurrency day trading platform for professional traders. It offers live execution, advanced performance analytics, and robust risk management. The platform integrates with Kraken for real-time market data, provides secure position trading with PnL tracking, and automates asset selection using quantitative filtering and K-means clustering. DELFOS prioritizes user experience, security, capital protection, and real-time data, aiming to provide a comprehensive trading environment across desktop and mobile.

## User Preferences
- Preferred communication style: Simple, everyday language (non-technical)
- Design preference: DELFOS metallic logo-inspired aesthetic with steel blue (#5B9FB5), cyan highlight (#7DD3E8), metallic silver (#A8B5BD), and deep charcoal (#1A1D23)
- Platform requirements: Must work on mobile (Android, iOS, HyperOS)
- Language support: English, Spanish, Portuguese BR

## System Architecture

### UI/UX Decisions
The platform features a premium metallic design inspired by the DELFOS logo, using a steel blue and cyan color palette, with both light and dark themes. It uses the Inter font and leverages `shadcn/ui` for a modern, responsive experience. The DELFOS logo is prominently displayed. Internationalization supports English, Spanish, and Brazilian Portuguese, with preferences stored locally.

### Technical Implementations
The frontend is built with React 18, TypeScript, and Vite, utilizing Wouter for routing, TanStack Query for server state, and React Context for global UI state. The backend is an Express.js application in TypeScript. Authentication uses Replit Auth (OIDC) and Passport.js, with sessions stored in PostgreSQL. Drizzle ORM provides type-safe PostgreSQL interactions.

**Key Features:**
- **Observability & Monitoring:** Prometheus system with custom metrics for PnL, Risk, Execution, Data Quality, Circuit Breakers, Trading counts, and Performance.
- **Tax & Cost Tracking System:** Comprehensive tax calculation and tracking for international fiscal compliance, supporting various regimes.
- **Paper Trading Mode:** A complete simulation environment for risk-free testing with real market prices and Kraken fees.
- **Automated Asset Selection:** Identifies tradable cryptocurrency pairs using market data filtering and K-means clustering with six quantitative features for semantic cluster labeling.
- **Real-time Data Pipeline & Staleness Guards:** Connects to Kraken WebSocket for real-time data, stores it in Redis with TTLs, and employs a three-level staleness guard system with auto-quarantine, auto-recovery, and REST fallback.
- **Live Trading & Position Management:** Facilitates real-time order execution via Kraken API with HMAC-SHA512 authentication, including credential validation and security restrictions.
- **Risk Management & Circuit Breakers:** Implements a comprehensive, multi-layer circuit breaker system (asset, cluster, global, and staleness-based) with a singleton architecture and auto-reset capability.
- **Trading Signals:** An ATR-based system generates trading signals, calculates OCO orders, and applies risk sizing (fixed SL/TP).
- **Operational Flow:** A five-phase daily trading cycle (Selection, Distribution, Trading, Rebalance, Audit) with real-time status monitoring.
- **Cost-Integrated Position Sizing:** Automatically calculates position sizes, accounting for exchange fees and estimated slippage.
- **Automated Portfolio Rebalancing:** An 8-hour automated system optimizes portfolio allocations based on K-means cluster weights.
- **Campaign Model:** Automated 30-day trading campaigns with lifecycle management, investor profiles (Conservative, Moderate, Aggressive) defining risk parameters, a 7-step wizard, daily compounding, and a -10% drawdown circuit breaker.
- **Campaign Engine:** Autonomous multi-campaign trading with isolated robots, independent 5-second cycles, isolated risk state, isolated positions/orders with mandatory OCO linking, three-layer circuit breakers, and daily/8-hour/24-hour resets/audits.
- **Robot Activity Feed:** Real-time logging system for monitoring trading robot decisions and actions in Campaign Detail pages, with various activity types, detailed metadata, and internationalization.
- **Robot Reporting System:** Multi-level reporting for campaigns with 4 report types: operational status (real-time robot state, tradable assets, circuit breakers), 8-hour reports (recent performance summary), 24-hour daily reports (ROI, win rate, key decisions), and complete trade history with accumulated PnL tracking.
- **User Settings:** Manages user profiles, language/theme preferences, and securely stores encrypted Kraken API credentials.
- **Time-Series Data Backend:** Provides REST API endpoints for bars, orders, and decision logs.
- **API Token Authentication:** Supports external agent authentication with `delfos_` prefixed tokens, granular permissions, secure storage, audit trails, and expiration support.

### System Design Choices
- **Hybrid Data Architecture:** PostgreSQL for aggregated data and metadata, Upstash Redis for high-frequency real-time market data with TTLs.
- **Database Schema:** UUID primary keys, decimal types for financial precision, and performance indexes.
- **Performance Optimizations:** Redis pipeline batching, semaphore throttling, write coalescing, and dual-index symbol caching.

## External Dependencies
- **Authentication:** Replit OpenID Connect
- **Database:** Neon serverless PostgreSQL, Upstash Redis
- **Real-time Data & Trading:** Kraken cryptocurrency exchange (REST API, WebSocket)
- **News Feed:** Twitter/X API v2
- **Version Control:** GitHub integration via Replit Connectors