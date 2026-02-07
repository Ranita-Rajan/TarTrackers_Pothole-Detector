import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Globe from '@/components/Globe';
import CameraTray from '@/components/CameraTray';
import WelcomeModal from '@/components/WelcomeModal';
import AuthModal from '@/components/AuthModal';
import { Button } from '@/components/ui/button';
import { ChevronUp, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getReportStore, type PotholeReport } from '@/lib/reportStore';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';
import { toast } from '@/hooks/use-toast';

interface PotholeMarker {
  id: string;
  lat: number;
  lng: number;
  timestamp: Date;
}

const Index = () => {
  const { user } = useAuth();
  const [isCameraTrayOpen, setIsCameraTrayOpen] = useState(false);
  const [potholes, setPotholes] = useState<PotholeMarker[]>([]);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [storeReady, setStoreReady] = useState(false);
  const [userCenter, setUserCenter] = useState<{lat:number; lng:number} | null>(null);
  const [currentGpsPosition, setCurrentGpsPosition] = useState<{lat: number; lng: number; accuracy: number} | null>(null); // New: GPS from Globe
  const [isDesktop, setIsDesktop] = useState(false);
  const swipeStartYRef = useRef<number | null>(null);
  
  // Debug: Log GPS updates
  useEffect(() => {
    if (currentGpsPosition) {
      // ...removed console.log for production...
    }
  }, [currentGpsPosition]);
  
  const storeRef = (window as any).__reportStoreRef || { current: null as any };
  ;(window as any).__reportStoreRef = storeRef;

  // Detect if device is desktop
  useEffect(() => {
    const checkIfDesktop = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isLargeScreen = window.innerWidth >= 1024;
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      const desktop = isLargeScreen && (!hasTouch || !isMobileUA);
      setIsDesktop(desktop);
    };

    checkIfDesktop();
    window.addEventListener('resize', checkIfDesktop);
    return () => window.removeEventListener('resize', checkIfDesktop);
  }, []);

  useEffect(() => {
    // Check if user has seen the welcome modal before
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    if (!hasSeenWelcome) {
      setShowWelcomeModal(true);
    }
    // Init report store
    (async () => {
      if (!storeRef.current) {
        storeRef.current = await getReportStore();
      }
      setStoreReady(true);
    })();
    // Get a center once for nearby subscription
    let mounted = true;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (mounted) setUserCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          if (mounted) setUserCenter({ lat: 20.5937, lng: 78.9629 }); // India center fallback
        }
      );
    } else {
      setUserCenter({ lat: 20.5937, lng: 78.9629 });
    }
    
    return () => { mounted = false; };
  }, []);

  const handleCloseWelcome = () => {
    setShowWelcomeModal(false);
    localStorage.setItem('hasSeenWelcome', 'true');
  };
  
  const handlePotholeDetected = (location: { lat: number; lng: number }) => {
    const newPothole: PotholeMarker = {
      id: `pothole-${Date.now()}-${Math.random()}`,
      lat: location.lat,
      lng: location.lng,
      timestamp: new Date(),
    };
    setPotholes(prev => [...prev, newPothole]);
    // Always use authenticated user ID from Supabase Auth
    const userId = user?.id || null;
    const rep: PotholeReport = {
      id: newPothole.id,
      lat: newPothole.lat,
      lon: newPothole.lng,
      ts: newPothole.timestamp.getTime(),
      user_id: userId
    };
    if (storeRef.current && typeof storeRef.current.addReport === 'function') {
      storeRef.current.addReport(rep).catch(() => {});
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsMenuOpen(false);
      toast({ title: '👋 Signed out', description: 'See you next time!' });
    } catch (err: any) {
      toast({ title: '❌ Error', description: err?.message || 'Failed to sign out', variant: 'destructive' });
    }
  };

  // Handle camera open - require authentication first
  const handleCameraOpen = () => {
    if (!user) {
      // Not authenticated - show auth modal
      // ...removed console.log for production...
      setAuthModalMode('signup');
      setAuthModalOpen(true);
      toast({ 
        title: '🔒 Sign in required', 
        description: 'Please sign in or create an account to detect potholes',
        duration: 3000
      });
      return;
    }
    
    // Authenticated - open camera
    // ...removed console.log for production...
    setIsCameraTrayOpen(true);
  };

  // Subscribe to nearby reports so all users see new ones instantly
  useEffect(() => {
    if (!storeReady || !userCenter || !storeRef.current) return;
    
    let unsub: (() => void) | null = null;
    let mounted = true;
    
    try {
      unsub = storeRef.current.subscribeNearby(
        { lat: userCenter.lat, lon: userCenter.lng }, 
        15_000, 
        (reports: PotholeReport[]) => {
          if (!mounted) return; // Don't update if unmounted
          
          // Merge with local state, prefer Firestore IDs
          const mapped: PotholeMarker[] = reports.map(r => ({ 
            id: r.id, 
            lat: r.lat, 
            lng: r.lon, 
            timestamp: new Date(r.ts) 
          }));
          setPotholes(prev => {
            // Merge by id (basic)
            const map = new Map(prev.map(p => [p.id, p] as const));
            for (const m of mapped) map.set(m.id, m);
            return Array.from(map.values());
          });
        }
      );
    } catch (error) {
      // ...removed console.error for production...
    }
    
    return () => {
      mounted = false;
      if (unsub) {
        try {
          unsub();
        } catch (error) {
          // ...removed console.error for production...
        }
      }
    };
  }, [storeReady, userCenter]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      {/* Welcome Modal */}
      <WelcomeModal isOpen={showWelcomeModal} onClose={handleCloseWelcome} />

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-30 p-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src="/icon-192.png" alt="Pothole Icon" className="w-8 h-8 md:w-10 md:h-10" />
          <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-tight">
            Tar<span className="text-primary">Trackers</span>
          </h1>
        </div>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          {isMenuOpen ? <X /> : <Menu />}
        </Button>
      </header>

      {/* Navigation Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40"
            />
            
            {/* Menu */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 h-full w-80 bg-background border-l-4 border-foreground z-50 p-6"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold uppercase">Menu</h2>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setIsMenuOpen(false)}
                  className="hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <X />
                </Button>
              </div>

              <nav className="space-y-4">
                {/* Auth-conditional navigation */}
                {!user ? (
                  <button
                    onClick={() => {
                      setAuthModalMode('login');
                      setAuthModalOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left text-xl font-bold uppercase py-3 px-4 rounded-xl hover:bg-primary hover:text-primary-foreground transition-colors border-2 border-transparent hover:border-foreground"
                  >
                  Sign In / Register 🔐 
                  </button>
                ) : (
                  <>
                    <Link
                      to="/profile"
                      onClick={() => setIsMenuOpen(false)}
                      className="block w-full text-left text-xl font-bold uppercase py-3 px-4 rounded-xl hover:bg-primary hover:text-primary-foreground transition-colors border-2 border-transparent hover:border-foreground"
                    >

                    Profile 👤 
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="block w-full text-left text-xl font-bold uppercase py-3 px-4 rounded-xl hover:bg-primary hover:text-primary-foreground transition-colors border-2 border-transparent hover:border-foreground"
                    >
                       Sign Out 
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setShowWelcomeModal(true);
                  }}
                  className="block w-full text-left text-xl font-bold uppercase py-3 px-4 rounded-xl hover:bg-primary hover:text-primary-foreground transition-colors border-2 border-transparent hover:border-foreground"
                >
                  About 
                </button>
              </nav>

              {/* Footer */}
              <div className="absolute bottom-6 left-6 right-6">
                <div className="border-t-2 border-foreground pt-4">
                  <p className="text-sm opacity-70 mb-3 flex items-center justify-center gap-2">
                    Made with Care by Ranita R
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Globe - Full Screen */}
      <div className="absolute inset-0">
        <Globe 
          potholes={potholes} 
          onGpsUpdate={setCurrentGpsPosition} 
        />
      </div>



      {/* Swipe Up Handle - Bottom Center - Always visible */}
      <AnimatePresence>
        {!isCameraTrayOpen && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute bottom-0 left-0 right-0 z-30"
          >
            <motion.div 
              {...(!isDesktop ? {
                drag: 'y' as const,
                dragConstraints: { top: -30, bottom: 0 },
                dragElastic: 0.5,
                dragMomentum: false,
                onDragEnd: (_: any, info: any) => {
                  if (info.offset.y < -20) {
                    handleCameraOpen();
                  }
                }
              } : {})}
              onPointerDown={(e) => {
                if (isDesktop) swipeStartYRef.current = (e as any).clientY ?? 0;
              }}
              onPointerUp={(e) => {
                if (isDesktop && swipeStartYRef.current !== null) {
                  const endY = (e as any).clientY ?? 0;
                  if (swipeStartYRef.current - endY > 20) {
                    handleCameraOpen();
                  }
                  swipeStartYRef.current = null;
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleCameraOpen();
              }}
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              className="mx-auto w-full max-w-md cursor-pointer hover:shadow-2xl transition-shadow"
            >
              {/* Bottom bar with integrated swipe indicator */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  handleCameraOpen();
                }}
                className="bg-background border-t-4 border-foreground rounded-t-3xl pt-3 pb-6 px-6 text-center chunky-shadow-lg select-none hover:bg-primary/5 transition-colors cursor-pointer"
              >
                {/* Swipe Indicator */}
                <div className="w-12 h-1.5 bg-muted-foreground rounded-full mb-2 mx-auto opacity-50" />
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                  className="mb-2"
                >
                  <ChevronUp size={24} className="text-primary mx-auto" strokeWidth={3} />
                </motion.div>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-lg font-bold uppercase tracking-tight">
                    {isDesktop ? 'Click to start' : 'Swipe up to start'}
                  </p>
                  <img src="/icon-192.png" alt="Pothole" className="w-5 h-5" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Tray - Full Screen */}
      <CameraTray
        isOpen={isCameraTrayOpen}
        onClose={() => setIsCameraTrayOpen(false)}
        onPotholeDetected={handlePotholeDetected}
        gpsPosition={currentGpsPosition}
      />

      {/* Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
        initialMode={authModalMode}
      />
    </div>
  );
};

export default Index;
