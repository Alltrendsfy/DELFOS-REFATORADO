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
  
  // Use PostgreSQL session store for persistence across server restarts
  const PgStore = connectPg(session);
  const sessionStore = new PgStore({
    conString: process.env.DATABASE_URL,
    tableName: 'sessions',
    createTableIfMissing: false, // Table already exists from Drizzle schema
    ttl: sessionTtl / 1000, // convert to seconds
  });
  
  console.log('[SESSION] Using PostgreSQL session store for persistence');
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
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
  
  // First upsert the user
  await storage.upsertUser({
    id: userId,
    email: userEmail,
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
  
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

    // Check if user object exists - required for any authentication
    if (!user) {
      console.log('[AUTH] No user object in request');
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user has claims (essential for the app to function)
    if (!user.claims || !user.claims.sub) {
      console.log('[AUTH] User missing claims or sub - session may be corrupted');
      return res.status(401).json({ message: "Session expired - please login again" });
    }

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
