import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon to use HTTP pooling instead of WebSocket connections
// This prevents "too many connections" errors by routing queries through Neon's HTTP pooler
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;     // Force all pool queries to use HTTP transport

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create pool with HTTP-based connection management
// The pool will use Neon's HTTP pooler which handles connection limits server-side
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
});

// Log pool errors for debugging
pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client', err);
});

export const db = drizzle({ client: pool, schema });

console.log('[DB] Initialized with Neon HTTP pooling mode');
