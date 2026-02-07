import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function FirebaseTest() {
  const [logs, setLogs] = useState<string[]>([]);
  const [testResults, setTestResults] = useState<any>({});

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const testFirebaseConfig = () => {
    addLog('=== Testing Firebase Configuration ===');
    const config = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
    
    addLog(`Project ID: ${config.projectId}`);
    addLog(`API Key: ${config.apiKey?.substring(0, 20)}...`);
    addLog(`Auth Domain: ${config.authDomain}`);
    addLog(`Current Domain: ${window.location.hostname}`);
    
    setTestResults(prev => ({ ...prev, config }));
  };

  const testFirestoreConnection = async () => {
    addLog('=== Testing Firestore Connection ===');
    try {
      const { getDb } = await import('@/lib/firebase');
      const db = await getDb();
      
      if (!db) {
        addLog('❌ Failed to initialize Firestore');
        return;
      }
      
      addLog('✅ Firestore initialized successfully');
      
      // Try to read from potholeReports collection
      const { collection, getDocs, limit, query } = await import('firebase/firestore');
      const col = collection(db, 'potholeReports');
      const q = query(col, limit(1));
      
      addLog('Attempting to read potholeReports collection...');
      const snapshot = await getDocs(q);
      addLog(`✅ Successfully read collection! Documents: ${snapshot.size}`);
      
      setTestResults(prev => ({ ...prev, firestoreRead: true, docCount: snapshot.size }));
    } catch (error: any) {
      addLog(`❌ Firestore Error: ${error.code || error.message}`);
      setTestResults(prev => ({ ...prev, firestoreError: error.message }));
    }
  };

  const testFirestoreWrite = async () => {
    addLog('=== Testing Firestore Write ===');
    try {
      const { getDb } = await import('@/lib/firebase');
      const db = await getDb();
      
      if (!db) {
        addLog('❌ Firestore not initialized');
        return;
      }
      
      const { collection, addDoc } = await import('firebase/firestore');
      const testDoc = {
        test: true,
        timestamp: Date.now(),
        domain: window.location.hostname,
        createdAt: new Date().toISOString()
      };
      
      addLog('Attempting to write test document...');
      const docRef = await addDoc(collection(db, 'potholeReports'), testDoc);
      addLog(`✅ Successfully wrote document! ID: ${docRef.id}`);
      
      setTestResults(prev => ({ ...prev, firestoreWrite: true, testDocId: docRef.id }));
    } catch (error: any) {
      addLog(`❌ Write Error: ${error.code || error.message}`);
      
      if (error.code === 'permission-denied') {
        addLog('⚠️ PERMISSION DENIED - Check Firestore Rules');
      } else if (error.message?.includes('400')) {
        addLog('⚠️ 400 BAD REQUEST - Possible causes:');
        addLog('  1. App Check is enabled and blocking');
        addLog('  2. API key has HTTP referrer restrictions');
        addLog('  3. Firestore not properly initialized');
      }
      
      setTestResults(prev => ({ ...prev, writeError: error.message }));
    }
  };

  const testAuthConnection = async () => {
    addLog('=== Testing Firebase Auth ===');
    try {
      const { getAuth } = await import('@/lib/auth');
      const auth = await getAuth();
      
      if (!auth) {
        addLog('❌ Auth not initialized');
        return;
      }
      
      addLog(`✅ Auth initialized successfully`);
      addLog(`Current user: ${auth.currentUser ? auth.currentUser.email : 'Not signed in'}`);
      
      setTestResults(prev => ({ ...prev, authInitialized: true }));
    } catch (error: any) {
      addLog(`❌ Auth Error: ${error.code || error.message}`);
      
      if (error.message?.includes('CONFIGURATION_NOT_FOUND')) {
        addLog('⚠️ Firebase Authentication not enabled in Console');
        addLog('👉 https://console.firebase.google.com/project/live-potholes/authentication/providers');
      }
      
      setTestResults(prev => ({ ...prev, authError: error.message }));
    }
  };

  const runAllTests = async () => {
    setLogs([]);
    setTestResults({});
    
    testFirebaseConfig();
    await new Promise(r => setTimeout(r, 500));
    await testFirestoreConnection();
    await new Promise(r => setTimeout(r, 500));
    await testFirestoreWrite();
    await new Promise(r => setTimeout(r, 500));
    await testAuthConnection();
    
    addLog('=== Tests Complete ===');
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Firebase Diagnostic Tool</h1>
          <p className="text-muted-foreground">
            Test Firebase connectivity to diagnose 400 errors on production
          </p>
        </div>

        <div className="flex gap-3">
          <Button onClick={runAllTests} size="lg">
            🔍 Run All Tests
          </Button>
          <Button onClick={testFirebaseConfig} variant="outline">
            Config
          </Button>
          <Button onClick={testFirestoreConnection} variant="outline">
            Read Test
          </Button>
          <Button onClick={testFirestoreWrite} variant="outline">
            Write Test
          </Button>
          <Button onClick={testAuthConnection} variant="outline">
            Auth Test
          </Button>
        </div>

        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          <div className="space-y-2 font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-muted-foreground">No tests run yet. Click "Run All Tests" to start.</p>
            ) : (
              logs.map((log, i) => (
                <div 
                  key={i}
                  className={`
                    ${log.includes('❌') ? 'text-red-500' : ''}
                    ${log.includes('✅') ? 'text-green-500' : ''}
                    ${log.includes('⚠️') ? 'text-yellow-500' : ''}
                    ${log.includes('===') ? 'font-bold text-primary mt-2' : ''}
                  `}
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-muted/50 border rounded-lg p-6">
          <h3 className="font-semibold mb-3">Quick Fixes for Common Issues:</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-destructive font-bold">1.</span>
              <div>
                <strong>App Check Enabled:</strong> Go to{' '}
                <a 
                  href="https://console.firebase.google.com/project/live-potholes/appcheck" 
                  target="_blank"
                  className="text-primary underline"
                >
                  Firebase App Check
                </a>
                {' '}and disable it (or configure it properly)
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive font-bold">2.</span>
              <div>
                <strong>API Key Restrictions:</strong> Go to{' '}
                <a 
                  href={`https://console.cloud.google.com/apis/credentials?project=live-potholes`}
                  target="_blank"
                  className="text-primary underline"
                >
                  Google Cloud Console
                </a>
                {' '}→ Edit API key → Set restrictions to "None" (for testing) or add your domain
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive font-bold">3.</span>
              <div>
                <strong>Auth Not Enabled:</strong> Go to{' '}
                <a 
                  href="https://console.firebase.google.com/project/live-potholes/authentication/providers"
                  target="_blank"
                  className="text-primary underline"
                >
                  Firebase Authentication
                </a>
                {' '}and enable Email/Password provider
              </div>
            </li>
          </ul>
        </div>

        <div className="text-sm text-muted-foreground">
          <p><strong>Note:</strong> This diagnostic page helps identify why production has 400 errors while localhost works fine.</p>
          <p className="mt-2">Current environment: <code className="bg-muted px-2 py-1 rounded">{import.meta.env.MODE}</code></p>
          <p>Domain: <code className="bg-muted px-2 py-1 rounded">{window.location.hostname}</code></p>
        </div>
      </div>
    </div>
  );
}
