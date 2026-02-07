// Supabase Authentication (replaces Firebase Auth)
import { getSupabase } from './supabase';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

const supabase = getSupabase();

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    }
  });

  if (error) {
    console.error('[Auth] Signup error:', error);
    throw error;
  }

  if (!data.user) {
    throw new Error('No user returned from signup');
  }

  console.log('[Auth] ✅ User signed up:', data.user.id);
  return data.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('[Auth] Sign in error:', error);
    throw error;
  }

  if (!data.user) {
    throw new Error('No user returned from sign in');
  }

  console.log('[Auth] ✅ User signed in:', data.user.id);
  return data.user;
}

export async function signInWithGoogle(): Promise<User> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      }
    }
  });

  if (error) {
    console.error('[Auth] Google sign in error:', error);
    throw error;
  }

  console.log('[Auth] ✅ Google OAuth initiated');
  // User will be set via onAuthStateChanged after redirect
  return null as any; // OAuth redirects, so we don't get user immediately
}

export async function signInWithGithub(): Promise<User> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/`,
      skipBrowserRedirect: false,
    }
  });

  if (error) {
    console.error('[Auth] GitHub sign in error:', error);
    throw error;
  }

  console.log('[Auth] ✅ GitHub OAuth initiated');
  // User will be set via onAuthStateChanged after redirect
  return null as any; // OAuth redirects, so we don't get user immediately
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('[Auth] Sign out error:', error);
    throw error;
  }

  console.log('[Auth] ✅ User signed out');
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function onAuthStateChanged(callback: (user: User | null) => void): () => void {
  // Get initial session
  supabase.auth.getSession().then(({ data: { session } }) => {
    callback(session?.user ?? null);
  });

  // Listen for auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event: AuthChangeEvent, session: Session | null) => {
      console.log('[Auth] State changed:', event, session?.user?.id);
      callback(session?.user ?? null);
    }
  );

  // Return unsubscribe function
  return () => {
    subscription.unsubscribe();
  };
}

// Helper to get user ID (for storing with pothole reports)
export async function getUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

// Helper to check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user;
}
