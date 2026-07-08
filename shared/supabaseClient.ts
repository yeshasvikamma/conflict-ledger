// =============================================================================
// Shared Supabase client factory (FROZEN CONTRACT)
// =============================================================================
// One place to construct a client so every track connects the same way.
//
// - Backend scripts (discovery/tiering/signal/pipeline) use the SERVICE ROLE key.
// - The API + web read layer uses the ANON key (read-only).
//
// We intentionally do NOT enforce table ownership via Postgres RLS at this scale
// (see PRD §16) — ownership is a convention. Use the right factory for your track.
// =============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return v;
}

/**
 * Backend client with the service-role key. Use in discovery, tiering, signal,
 * and pipeline scripts. Has full read/write — respect the ownership table in
 * the PRD (§16); the key does not enforce it for you.
 */
export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    required('SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

/**
 * Read-only client with the anon key. Use in the API and frontend.
 */
export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    required('SUPABASE_URL'),
    required('SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } },
  );
}
