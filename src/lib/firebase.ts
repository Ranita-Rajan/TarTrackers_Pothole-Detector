// Firebase initialization (Firestore only) using Vite env variables
// Note: Firebase config is safe to expose - security is handled by Firestore Security Rules
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

// Only log presence of config values, never the actual values in production
if (import.meta.env.DEV) {
  console.log('[Firebase] Configuration check (dev mode):', {
    hasApiKey: !!cfg.apiKey,
    hasProjectId: !!cfg.projectId,
    projectId: cfg.projectId // Only show in dev
  });
} else {
  // In production, only log boolean flags
  console.log('[Firebase] Configuration check:', {
    hasApiKey: !!cfg.apiKey,
    hasProjectId: !!cfg.projectId
  });
}

let db: any = null;
let app: any = null;
let initPromise: Promise<any> | null = null;

export async function getDb(): Promise<any | null> {
  // If already initialized, return immediately
  if (db) return db;
  
  // If initialization is in progress, wait for it
  if (initPromise) return initPromise;
  
  if (!cfg.projectId || !cfg.apiKey) {
    console.error('[Firebase] Missing required config:', {
      apiKey: cfg.apiKey ? 'present' : 'MISSING',
      projectId: cfg.projectId || 'MISSING'
    });
    return null;
  }
  
  // Create initialization promise to prevent multiple simultaneous inits
  initPromise = (async () => {
    try {
      console.log('[Firebase] Initializing app...');
      const { initializeApp, getApps } = await import('firebase/app');
      const { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } = await import('firebase/firestore');
      
      // Check if app is already initialized
      const existingApps = getApps();
      if (existingApps.length > 0) {
        console.log('[Firebase] Using existing Firebase app');
        app = existingApps[0];
        
        // Try to get existing Firestore instance
        try {
          db = getFirestore(app);
          console.log('[Firebase] ✅ Using existing Firestore instance');
          return db;
        } catch (e) {
          console.warn('[Firebase] Could not get existing Firestore, will initialize new one');
        }
      } else {
        app = initializeApp(cfg as any);
        console.log('[Firebase] ✅ Firebase app initialized');
      }
      
      // Initialize Firestore with modern cache API (no deprecation warnings)
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager() // Supports multiple tabs
          }),
          // Force long-polling to bypass WebChannel/WebSocket issues on CDNs
          experimentalForceLongPolling: true,
        });
        console.log('[Firebase] 💾 Offline persistence enabled (multi-tab, forced long-polling)');
      } catch (e: any) {
        if (e.message?.includes('already been called')) {
          // Firestore already initialized, just get the instance
          db = getFirestore(app);
          console.log('[Firebase] ✅ Using existing Firestore instance');
        } else {
          throw e;
        }
      }
      
      // Check if using emulator in dev mode
      if (import.meta.env.DEV && import.meta.env.VITE_USE_FIRESTORE_EMULATOR === 'true') {
        try {
          connectFirestoreEmulator(db, 'localhost', 8080);
          console.log('[Firebase] 🔧 Connected to Firestore Emulator');
        } catch (e) {
          console.warn('[Firebase] Could not connect to emulator:', e);
        }
      }
      
      console.log('[Firebase] ✅ Firestore initialized successfully');
      return db;
    } catch (error: any) {
      console.error('[Firebase] ❌ Initialization failed:', error);
      
      // Check for common error patterns
      if (error.code === 'app-check/fetch-status-error' || error.code === 'app-check/throttled') {
        console.error('[Firebase] ⚠️ APP CHECK IS BLOCKING REQUESTS - Please disable App Check in Firebase Console or configure App Check tokens');
        console.error('[Firebase] 🔗 Go to: https://console.firebase.google.com/project/live-potholes/appcheck');
      } else if (error.message?.includes('400')) {
        console.error('[Firebase] ⚠️ 400 BAD REQUEST - This usually means:');
        console.error('[Firebase]   1. App Check is enabled and blocking requests');
        console.error('[Firebase]   2. API key has restrictions that block Firestore');
        console.error('[Firebase]   3. Firestore database not properly initialized');
        console.error('[Firebase] Config check:', {
          projectId: cfg.projectId,
          hasApiKey: !!cfg.apiKey,
          authDomain: cfg.authDomain
        });
        console.error('[Firebase] 🔗 Check App Check: https://console.firebase.google.com/project/live-potholes/appcheck');
        console.error('[Firebase] 🔗 Check API Key: https://console.cloud.google.com/apis/credentials?project=live-potholes');
      }
      
      // Clear the promise so it can be retried
      initPromise = null;
      return null;
    }
  })();
  
  return initPromise;
}
