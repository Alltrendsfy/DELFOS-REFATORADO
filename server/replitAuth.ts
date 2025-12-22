// Replit Auth implementation using OpenID Connect
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import createMemoryStore from "memorystore";
import { storage } from "./storage";
import { adminMonitorService } from "./services/adminMonitorService";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  console.log('[SESSION] Initializing session middleware...');
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const isProduction = process.env.NODE_ENV !== 'development';
  
  // Use PostgreSQL session store for persistence across server restarts
  // Use the shared pool from db.ts to avoid creating additional connections
  const { pool } = require('./db');
  const PgStore = connectPg(session);
  const sessionStore = new PgStore({
    pool: pool,                  // Use shared pool instead of creating new connection
    tableName: 'sessions',
    createTableIfMissing: true,  // Auto-create table if missing in production
    ttl: sessionTtl / 1000,      // convert to seconds
    pruneSessionInterval: 60 * 15, // Clean expired sessions every 15 minutes
  });
  
  console.log(`[SESSION] Using PostgreSQL session store with shared pool | Production: ${isProduction}`);
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction, // HTTPS only in production
      sameSite: isProduction ? 'none' : 'lax', // 'none' required for cross-site cookies in published apps
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  const userId = claims["sub"];
  const userEmail = claims["email"];
  
  // Check if there's a placeholder user with this email that needs to be merged
  let placeholderUser: any = null;
  if (userEmail) {
    const existingUserByEmail = await storage.getUserByEmail(userEmail);
    if (existingUserByEmail && existingUserByEmail.id !== userId) {
      placeholderUser = existingUserByEmail;
      console.log(`[AUTH] Found placeholder user ${existingUserByEmail.id} to merge into real user ${userId}`);
    }
  }
  
  // FIRST: Upsert the real user (so FK references can point to it)
  // If placeholder exists with same email, we need to clear its email first to avoid unique constraint
  if (placeholderUser) {
    await storage.clearPlaceholderEmail(placeholderUser.id);
  }
  
  await storage.upsertUser({
    id: userId,
    email: userEmail,
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
  
  // THEN: Merge placeholder data after real user exists
  if (placeholderUser) {
    try {
      // Merge placeholder user via storage method (handles all FK updates atomically)
      await storage.mergePlaceholderUser(placeholderUser.id, userId);
      console.log(`[AUTH] Successfully merged placeholder user for ${userEmail}`);
    } catch (mergeError) {
      console.error(`[AUTH] Error merging placeholder user:`, mergeError);
    }
  }
  
  // Check if email is in authorized list and auto-approve if needed
  if (userEmail) {
    try {
      const user = await storage.getUserById(userId);
      if (user && !user.is_beta_approved) {
        const authorizedEmail = await storage.getAuthorizedEmailByEmail(userEmail);
        if (authorizedEmail && authorizedEmail.is_active) {
          console.log(`[AUTH] Auto-approving user ${userId} with authorized email ${userEmail}`);
          await storage.updateUserBetaStatus(userId, true, 'AUTHORIZED_EMAIL');
        }
      }
    } catch (error) {
      console.error(`[AUTH] Error checking authorized email:`, error);
    }
  }
  
  // Create admin alert for user login
  try {
    await adminMonitorService.notifyUserLogin(userId, userEmail || 'Unknown');
  } catch (alertError) {
    console.error('[AdminMonitor] Failed to create login alert:', alertError);
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user as any;
    const requestPath = req.path;
    const requestMethod = req.method;
    const requestHost = req.hostname;

    // Check if user object exists - required for any authentication
    if (!user) {
      console.log(`[AUTH] ❌ No user object | ${requestMethod} ${requestPath} | Host: ${requestHost}`);
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user has claims (essential for the app to function)
    if (!user.claims || !user.claims.sub) {
      console.log(`[AUTH] ❌ Missing claims/sub | ${requestMethod} ${requestPath} | Host: ${requestHost} | Session: ${!!req.session}`);
      return res.status(401).json({ message: "Session expired - please login again" });
    }

    // Log successful authentication with user details
    const userId = user.claims.sub;
    const userEmail = user.claims.email || 'unknown';
    console.log(`[AUTH] ✓ User authenticated | ID: ${userId} | Email: ${userEmail} | ${requestMethod} ${requestPath} | Host: ${requestHost}`);

    // If not authenticated but has refresh token, try to refresh
    if (!req.isAuthenticated()) {
      const refreshToken = user.refresh_token;
      if (refreshToken) {
        try {
          console.log('[AUTH] Session not authenticated, attempting token refresh');
          const config = await getOidcConfig();
          const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
          updateUserSession(user, tokenResponse);
          return next();
        } catch (refreshError) {
          console.error('[AUTH] Token refresh failed:', refreshError);
          return res.status(401).json({ message: "Session expired - please login again" });
        }
      }
      console.log('[AUTH] User not authenticated and no refresh token');
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if expires_at exists
    if (!user.expires_at) {
      console.log('[AUTH] User missing expires_at - session may be incomplete');
      return res.status(401).json({ message: "Session incomplete - please login again" });
    }

    const now = Math.floor(Date.now() / 1000);
    if (now <= user.expires_at) {
      return next();
    }

    // Token expired, try to refresh
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      console.log('[AUTH] Token expired and no refresh token available');
      return res.status(401).json({ message: "Session expired - please login again" });
    }

    try {
      console.log('[AUTH] Token expired, refreshing...');
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      updateUserSession(user, tokenResponse);
      return next();
    } catch (refreshError) {
      console.error('[AUTH] Token refresh failed:', refreshError);
      return res.status(401).json({ message: "Session expired - please login again" });
    }
  } catch (error) {
    console.error('[AUTH] Unexpected error in isAuthenticated middleware:', error);
    return res.status(500).json({ message: "Authentication error - please try again" });
  }
};
