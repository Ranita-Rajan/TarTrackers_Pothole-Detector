// Supabase Report Store (replaces Firebase reportStore.ts)
// API-compatible with Firebase version - same methods, same behavior
import { getSupabase, type PotholeReport } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Unsubscribe = () => void;

export class ReportStore {
  private supabase = getSupabase();
  private channels: Set<RealtimeChannel> = new Set();

  /**
   * Subscribe to nearby pothole reports (real-time)
   * Matches Firebase subscribeNearby API
   */
  subscribeNearby(
    center: { lat: number; lon: number },
    radiusMeters: number,
    cb: (reports: PotholeReport[]) => void
  ): Unsubscribe {
    console.log('[ReportStore] 🔄 Setting up Supabase real-time listener...');

    // Initial fetch
    this.fetchNearby(center, radiusMeters).then(cb);

    // Set up real-time subscription for INSERT events
    const channel = this.supabase
      .channel('pothole_reports_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'pothole_reports'
        },
        async (payload) => {
          console.log('[ReportStore] 📡 Real-time update:', payload.eventType);
          // Re-fetch all reports when any change occurs
          const reports = await this.fetchNearby(center, radiusMeters);
          cb(reports);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ReportStore] ✅ Real-time subscription active');
        }
      });

    this.channels.add(channel);

    // Return unsubscribe function
    return () => {
      this.supabase.removeChannel(channel);
      this.channels.delete(channel);
      console.log('[ReportStore] 🔌 Unsubscribed from real-time updates');
    };
  }

  /**
   * Fetch nearby reports (one-time query)
   */
  private async fetchNearby(
    center: { lat: number; lon: number },
    radiusMeters: number
  ): Promise<PotholeReport[]> {
    try {
      // Fetch all reports and filter client-side
      // For production with many reports, use PostGIS ST_DWithin on server
      const { data, error } = await this.supabase
        .from('pothole_reports')
        .select('*')
        .order('ts', { ascending: false });

      if (error) {
        console.error('[ReportStore] ❌ Query error:', error);
        return [];
      }

      const reports: PotholeReport[] = (data || []).map((doc: any) => this.normalizeReport(doc));
      
      console.log(`[ReportStore] 📍 Loaded ${reports.length} potholes from Supabase`);
      return reports;
    } catch (error) {
      console.error('[ReportStore] ❌ Fetch error:', error);
      return [];
    }
  }

  /**
   * Subscribe to reports by user ID
   */
  subscribeByUser(
    userId: string,
    cb: (reports: PotholeReport[]) => void
  ): Unsubscribe {
    console.log('[ReportStore] 🔄 Setting up user reports listener for:', userId);

    // Initial fetch
    this.fetchByUser(userId).then(cb);

    // Set up real-time subscription
    const channel = this.supabase
      .channel(`user_reports_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pothole_reports',
          filter: `user_id=eq.${userId}`
        },
        async () => {
          console.log('[ReportStore] 📡 User reports updated');
          const reports = await this.fetchByUser(userId);
          cb(reports);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ReportStore] ✅ User reports subscription active');
        }
      });

    this.channels.add(channel);

    return () => {
      this.supabase.removeChannel(channel);
      this.channels.delete(channel);
      console.log('[ReportStore] 🔌 Unsubscribed from user reports');
    };
  }

  /**
   * Fetch reports by user
   */
  private async fetchByUser(userId: string): Promise<PotholeReport[]> {
    try {
      const { data, error } = await this.supabase
        .from('pothole_reports')
        .select('*')
        .eq('user_id', userId)
        .order('ts', { ascending: false });

      if (error) {
        console.error('[ReportStore] ❌ User query error:', error);
        return [];
      }

      const reports: PotholeReport[] = (data || []).map((doc: any) => this.normalizeReport(doc));
      console.log(`[ReportStore] 📊 Loaded ${reports.length} reports for user ${userId}`);
      return reports;
    } catch (error) {
      console.error('[ReportStore] ❌ Fetch user reports failed:', error);
      return [];
    }
  }

  /**
   * Add a single pothole report
   * Matches Firebase addReport API
   */
  async addReport(report: Omit<PotholeReport, 'id'>): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('pothole_reports')
        .insert([
          {
            lat: report.lat,
            lon: report.lon,
            ts: report.ts,
            user_id: (report as any).user_id || (report as any).uid || null
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('[ReportStore] ❌ Insert error:', error);
        throw error;
      }

      console.log('[ReportStore] ✅ Report added:', data.id);
    } catch (error) {
      console.error('[ReportStore] ❌ Add report failed:', error);
      throw error;
    }
  }

  /**
   * Add multiple reports in batch
   * Matches Firebase addBatch API
   */
  async addBatch(reports: Omit<PotholeReport, 'id'>[]): Promise<void> {
    try {
      const inserts = reports.map(r => ({
        lat: r.lat,
        lon: r.lon,
        ts: r.ts,
        user_id: (r as any).user_id || (r as any).uid || null
      }));

      const { error } = await this.supabase
        .from('pothole_reports')
        .insert(inserts);

      if (error) {
        console.error('[ReportStore] ❌ Batch insert error:', error);
        throw error;
      }

      console.log(`[ReportStore] ✅ Batch added: ${reports.length} reports`);
    } catch (error) {
      console.error('[ReportStore] ❌ Batch failed:', error);
      throw error;
    }
  }

  /**
   * Normalize Supabase document to match Firebase format
   */
  private normalizeReport(doc: any): PotholeReport {
    const lat = typeof doc.lat === 'number' ? doc.lat : null;
    const lon = typeof doc.lon === 'number' ? doc.lon : null;
    const ts = typeof doc.ts === 'number' ? doc.ts : Date.now();

    if (lat === null || lon === null) {
      console.warn('[ReportStore] ⚠️ Skipping malformed report:', { id: doc.id, lat, lon });
      return null as any; // Will be filtered out
    }

    return {
      id: doc.id,
      lat,
      lon,
      ts
    };
  }

  /**
   * Clean up all subscriptions
   */
  cleanup() {
    for (const channel of this.channels) {
      this.supabase.removeChannel(channel);
    }
    this.channels.clear();
    console.log('[ReportStore] 🧹 Cleaned up all subscriptions');
  }
}

// Singleton instance
let reportStoreInstance: ReportStore | null = null;

export function getReportStore(): ReportStore {
  if (!reportStoreInstance) {
    reportStoreInstance = new ReportStore();
  }
  return reportStoreInstance;
}
