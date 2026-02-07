// Supabase initialization (replaces Firebase)
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

// Hardcoded Supabase configuration (safe to expose - protected by RLS policies)
// These are the actual values that will always be used
const SUPABASE_CONFIG = {

    url: import.meta.env.VITE_SUPABASE_URL || '',

    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ''

  } as const;

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabase) return supabase;
  
  // ...removed console.log for production...
  
  supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });
  
  // ...removed console.log for production...
  return supabase;
}

// TypeScript interfaces matching existing reportStore.ts (minimal schema)
export interface PotholeReport {
  id: string;
  lat: number;
  lon: number;
  ts: number; // epoch milliseconds
  // Optional fields (keep for compatibility, but not used/stored)
  uid?: string;
  model?: string;
  conf?: number;
}
