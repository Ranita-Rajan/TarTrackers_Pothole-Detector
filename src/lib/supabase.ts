// Supabase initialization (replaces Firebase)
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

// Hardcoded Supabase configuration (safe to expose - protected by RLS policies)
// These are the actual values that will always be used
const SUPABASE_CONFIG = {
  url: 'https://hzarhvimccqzivbsmgtk.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YXJodmltY2Nxeml2YnNtZ3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNDM1NzksImV4cCI6MjA3NzgxOTU3OX0.moCXP4WDVPGoq1OCW7Lokf7Z7ijQKEa4HqnD1R55a3s'
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
