import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from '@/lib/auth';

interface AuthContextType {
  user: any | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[AuthContext] 🔄 Setting up auth listener...');
    
    // Listen for auth state changes
    const unsub = onAuthStateChanged((u) => {
      console.log('[AuthContext] 👤 Auth state changed:', u?.id || 'null');
      setUser(u);
      setLoading(false);
    });
    
    return () => {
      console.log('[AuthContext] 🔌 Cleaning up auth listener');
      unsub();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
