// Firebase Firestore service for pothole management
// Handles real-time syncing, offline queue, and conflict resolution

import { getDb } from './firebase';

export interface PotholeReport {
  id: string;
  lat: number;
  lng: number;
  accuracy: number;
  confidence: number;
  detectedAt: number; // timestamp
  userId?: string;
  status: 'pending' | 'verified' | 'fixed';
  verificationCount: number;
  sessionId?: string;
}

export interface DetectionSession {
  id: string;
  userId?: string;
  startedAt: number;
  endedAt?: number;
  potholeIds: string[];
  stats: {
    distance: number; // meters
    duration: number; // seconds
    count: number;
  };
}

// IndexedDB for offline queue
const DB_NAME = 'potholes-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-reports';

let idb: IDBDatabase | null = null;

async function getIDB(): Promise<IDBDatabase> {
  if (idb) return idb;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      idb = request.result;
      resolve(idb);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Add pothole to offline queue
async function addToQueue(pothole: PotholeReport): Promise<void> {
  const db = await getIDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(pothole);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Get all queued potholes
async function getQueue(): Promise<PotholeReport[]> {
  const db = await getIDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Clear a pothole from queue
async function removeFromQueue(id: string): Promise<void> {
  const db = await getIDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.delete(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Haversine distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Submit pothole to Firebase (with offline support and duplicate checking)
export async function submitPothole(pothole: Omit<PotholeReport, 'id' | 'status' | 'verificationCount'>): Promise<string> {
  const report: PotholeReport = {
    ...pothole,
    id: `${pothole.lat.toFixed(6)}_${pothole.lng.toFixed(6)}_${pothole.detectedAt}`,
    status: 'pending',
    verificationCount: 1,
  };

  try {
    const db = await getDb();
    if (!db) throw new Error('Firebase not initialized');

    const { collection, addDoc, serverTimestamp, query, where, getDocs } = await import('firebase/firestore');
    
    // Check for duplicates within 3m radius
    const latRange = 0.00003; // ~3m
    const lonRange = 0.00003;
    
    const q = query(
      collection(db, 'potholeReports'),
      where('lat', '>=', pothole.lat - latRange),
      where('lat', '<=', pothole.lat + latRange)
    );
    
    const snapshot = await getDocs(q);
    
    // Check if any existing pothole is within 3m
    for (const doc of snapshot.docs) {
      const existing = doc.data();
      const distance = calculateDistance(
        pothole.lat, pothole.lng,
        existing.lat, existing.lng
      );
      
      if (distance < 3) {
        console.log('[PotholeService] ⚠️ Duplicate pothole within 3m - skipping', {
          new: `${pothole.lat.toFixed(6)}, ${pothole.lng.toFixed(6)}`,
          existing: `${existing.lat?.toFixed(6)}, ${existing.lng?.toFixed(6)}`,
          distance: distance.toFixed(1) + 'm'
        });
        return doc.id; // Return existing pothole ID instead of creating duplicate
      }
    }
    
    // No duplicates found - add new pothole
    const docRef = await addDoc(collection(db, 'potholeReports'), {
      ...report,
      createdAt: serverTimestamp(),
    });

    console.log('[Firebase] ✅ Pothole submitted:', docRef.id, `at ${pothole.lat.toFixed(6)}, ${pothole.lng.toFixed(6)}`);
    return docRef.id;
  } catch (error) {
    console.warn('[Firebase] Offline, queuing pothole:', error);
    await addToQueue(report);
    return report.id;
  }
}

// Sync queued potholes when online
export async function syncOfflineQueue(): Promise<number> {
  const queue = await getQueue();
  if (queue.length === 0) return 0;

  console.log(`[Firebase] Syncing ${queue.length} queued potholes...`);
  let synced = 0;

  for (const pothole of queue) {
    try {
      // Submit directly to Firebase (avoid recursion through submitPothole)
      const db = await getDb();
      if (!db) throw new Error('Firebase not initialized');

      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      
      await addDoc(collection(db, 'potholeReports'), {
        ...pothole,
        createdAt: serverTimestamp(),
      });

      await removeFromQueue(pothole.id);
      synced++;
      console.log(`[Firebase] Synced pothole ${pothole.id}`);
    } catch (error) {
      console.error('[Firebase] Failed to sync pothole:', pothole.id, error);
      // Don't re-queue, just skip - will retry on next sync
    }
  }

  console.log(`[Firebase] Synced ${synced}/${queue.length} potholes`);
  return synced;
}

// Subscribe to potholes in a geographic area
export function subscribeToPotholes(
  bounds: { north: number; south: number; east: number; west: number },
  callback: (potholes: PotholeReport[]) => void
): () => void {
  let unsubscribe: (() => void) | null = null;

  (async () => {
    try {
      const db = await getDb();
      if (!db) return;

      const { collection, query, where, onSnapshot } = await import('firebase/firestore');

      const q = query(
        collection(db, 'potholeReports'),
        where('lat', '>=', bounds.south),
        where('lat', '<=', bounds.north)
        // Note: Firestore allows only one range query per compound query
        // We'll filter longitude client-side
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const potholes: PotholeReport[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          // Filter by longitude client-side
          if (data.lng >= bounds.west && data.lng <= bounds.east) {
            potholes.push({
              id: doc.id,
              ...data,
            } as PotholeReport);
          }
        });
        callback(potholes);
      });
    } catch (error) {
      console.error('[Firebase] Subscription error:', error);
    }
  })();

  return () => {
    if (unsubscribe) unsubscribe();
  };
}

// Submit detection session
export async function submitSession(session: Omit<DetectionSession, 'id'>): Promise<string> {
  try {
    const db = await getDb();
    if (!db) throw new Error('Firebase not initialized');

    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    
    const docRef = await addDoc(collection(db, 'sessions'), {
      ...session,
      createdAt: serverTimestamp(),
    });

    console.log('[Firebase] Session submitted:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('[Firebase] Failed to submit session:', error);
    throw error;
  }
}

// Auto-sync on network reconnection
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Firebase] Network online, syncing queue...');
    syncOfflineQueue();
  });
}
