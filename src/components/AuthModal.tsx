import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithGithub } from '@/lib/auth';
import { toast } from '@/hooks/use-toast';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setLoading(true);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithGithub();
      }
      // OAuth will redirect, so modal will close automatically after redirect
      toast({ title: `🔄 Redirecting to ${provider === 'google' ? 'Google' : 'GitHub'}...`, description: 'Please wait' });
    } catch (err: any) {
      console.error('[Auth] OAuth error:', err);
      toast({ 
        title: '❌ Error', 
        description: err?.message || `Failed to sign in with ${provider}`, 
        variant: 'destructive' 
      });
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: '⚠️ Missing fields', description: 'Please enter email and password', variant: 'destructive' });
      return;
    }

    // Validate password confirmation for signup
    if (mode === 'signup') {
      if (password !== confirmPassword) {
        toast({ title: '⚠️ Password mismatch', description: 'Passwords do not match', variant: 'destructive' });
        return;
      }
      if (password.length < 6) {
        toast({ title: '⚠️ Weak password', description: 'Password must be at least 6 characters', variant: 'destructive' });
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password);
        toast({ title: '✅ Account created!', description: 'Welcome to potholes.live' });
        onClose();
      } else {
        await signInWithEmail(email, password);
        toast({ title: '👋 Welcome back!', description: 'Signed in successfully' });
        onClose();
      }
      // Clear form
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('[Auth] Error:', err);
      
      // Parse Supabase error messages
      let errorMsg = 'Authentication failed';
      const errMsg = err?.message?.toLowerCase() || '';
      
      if (errMsg.includes('user already registered')) {
        errorMsg = 'Email already registered. Try signing in instead.';
      } else if (errMsg.includes('invalid email')) {
        errorMsg = 'Invalid email address format.';
      } else if (errMsg.includes('password') && errMsg.includes('6 characters')) {
        errorMsg = 'Password must be at least 6 characters.';
      } else if (errMsg.includes('invalid login credentials') || errMsg.includes('invalid password')) {
        errorMsg = 'Incorrect email or password.';
      } else if (errMsg.includes('email not confirmed')) {
        errorMsg = 'Please check your email and confirm your account.';
      } else if (errMsg.includes('too many requests')) {
        errorMsg = 'Too many attempts. Please try again later.';
      } else if (err?.message) {
        errorMsg = err.message;
      }
      
      toast({ title: '❌ Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center portrait:px-4 landscape:px-2 z-50 pointer-events-none overflow-y-auto landscape:py-2">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full portrait:max-w-md landscape:max-w-2xl landscape:max-h-[90vh] bg-background border-4 border-foreground rounded-3xl chunky-shadow-lg portrait:p-6 landscape:p-4 pointer-events-auto landscape:flex landscape:flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-center portrait:mb-6 landscape:mb-3">
                <h2 className="portrait:text-2xl landscape:text-xl font-bold uppercase">Authentication</h2>
                <Button variant="ghost" size="icon" onClick={onClose} className="landscape:w-8 landscape:h-8">
                  <X className="landscape:w-5 landscape:h-5" />
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 portrait:mb-6 landscape:mb-3 bg-muted p-1 rounded-xl border-2 border-foreground landscape:flex-shrink-0">
                <button
                  onClick={() => setMode('login')}
                  className={`flex-1 portrait:py-2 landscape:py-1 px-4 rounded-lg font-bold uppercase portrait:text-sm landscape:text-xs transition-all ${
                    mode === 'login' 
                      ? 'bg-primary text-primary-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setMode('signup')}
                  className={`flex-1 portrait:py-2 landscape:py-1 px-4 rounded-lg font-bold uppercase portrait:text-sm landscape:text-xs transition-all ${
                    mode === 'signup' 
                      ? 'bg-primary text-primary-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Register
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="portrait:space-y-4 landscape:space-y-2 landscape:overflow-y-auto landscape:flex-1">
                {/* OAuth Buttons */}
                <div className="portrait:space-y-3 landscape:space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={loading}
                    onClick={() => handleOAuthSignIn('google')}
                    className="w-full portrait:text-base landscape:text-sm font-bold landscape:py-2 landscape:h-auto flex items-center justify-center gap-2 border-4 hover:bg-primary hover:text-primary-foreground"
                  >
                    <svg className="portrait:w-5 portrait:h-5 landscape:w-4 landscape:h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={loading}
                    onClick={() => handleOAuthSignIn('github')}
                    className="w-full portrait:text-base landscape:text-sm font-bold landscape:py-2 landscape:h-auto flex items-center justify-center gap-2 border-4 hover:bg-primary hover:text-primary-foreground"
                  >
                    <svg className="portrait:w-5 portrait:h-5 landscape:w-4 landscape:h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    Continue with GitHub
                  </Button>
                </div>

                {/* Divider */}
                <div className="relative portrait:my-4 landscape:my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t-2 border-muted"></div>
                  </div>
                  <div className="relative flex justify-center portrait:text-sm landscape:text-xs">
                    <span className="px-2 bg-background text-muted-foreground font-bold uppercase">Or</span>
                  </div>
                </div>

                <div>
                  <label className="block portrait:text-sm landscape:text-xs font-bold portrait:mb-2 landscape:mb-1 uppercase">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full portrait:px-4 portrait:py-3 landscape:px-3 landscape:py-2 border-4 border-foreground rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary portrait:text-base landscape:text-sm"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block portrait:text-sm landscape:text-xs font-bold portrait:mb-2 landscape:mb-1 uppercase">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full portrait:px-4 portrait:py-3 landscape:px-3 landscape:py-2 border-4 border-foreground rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary portrait:text-base landscape:text-sm"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>

                {mode === 'signup' && (
                  <div>
                    <label className="block portrait:text-sm landscape:text-xs font-bold portrait:mb-2 landscape:mb-1 uppercase">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full portrait:px-4 portrait:py-3 landscape:px-3 landscape:py-2 border-4 border-foreground rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary portrait:text-base landscape:text-sm"
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="w-full portrait:text-lg landscape:text-sm font-bold uppercase landscape:py-2 landscape:h-auto landscape:mt-2"
                >
                  {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                </Button>
              </form>

              {/* Sign-in vs Sign-up note */}
              <p className="portrait:text-xs landscape:text-[10px] text-center portrait:mt-4 landscape:mt-2 landscape:flex-shrink-0 text-muted-foreground">
                {mode === 'signup' ? 'Already have an account? Switch to Sign In above.' : 'New here? Switch to Register above to create an account.'}
              </p>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
