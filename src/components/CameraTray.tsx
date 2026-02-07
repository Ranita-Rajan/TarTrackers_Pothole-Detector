import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Camera } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { usePotholeWorker } from '@/hooks/use-pothole-worker';
import { reverseGeocode } from '@/lib/share';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from './AuthModal';
import ShareModal from './ShareModal';
import DesktopView from './DesktopView';
import { GPSTracker } from '@/lib/gps-tracker';
import { DetectionSmoother } from '@/lib/detection-smoother';
import { PotholeFingerprintTracker } from '@/lib/pothole-fingerprint';
import confetti from 'canvas-confetti';

interface CameraTrayProps {
  isOpen: boolean;
  onClose: () => void;
  onPotholeDetected: (location: { lat: number; lng: number }) => void;
  gpsPosition: { lat: number; lng: number; accuracy: number } | null;
}

type SessionReport = {
  id: string;
  lat: number;
  lon: number;
  ts: number;
};

const sanitizeLocationName = (location: string) => {
  if (!location) return 'my area';
  const lower = location.toLowerCase();
  if (lower.includes('loading location') || lower.includes('detecting location') || lower.includes('location unavailable')) {
    return 'my area';
  }
  return location;
};

const buildPlaceHashtag = (location: string) => {
  const cleaned = location
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  if (!cleaned) return '#makeOurRoadsGreatAgain';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return '#makeOurRoadsGreatAgain';

  const capitalized = parts
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return `#make${capitalized}RoadsGreatAgain`;
};

const createShareMessage = (count: number, location: string, sessionId?: string, coordinates?: { lat: number; lon: number }) => {
  const potholeWord = count === 1 ? 'pothole' : 'potholes';
  
  return `Just mapped ${count} ${potholeWord} near my area. I'm helping make our roads safer by reporting potholes in real-time. Join me at Tar Trackers and let's fix our roads together.`;
};

const CameraTray = ({ isOpen, onClose, onPotholeDetected, gpsPosition }: CameraTrayProps) => {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  
  // Detect if device is desktop/laptop (no touch or large screen)
  const [isDesktop, setIsDesktop] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [potholeCount, setPotholeCount] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('Loading location...');
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [sessionDistance, setSessionDistance] = useState(0); // meters
  const [detections, setDetections] = useState<any[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const detectionLoopRunningRef = useRef(false); // Track if loop is running
  const previousLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const sessionReportsRef = useRef<SessionReport[]>([]); // Store reports for share image
  const fingerprintTrackerRef = useRef<PotholeFingerprintTracker>(new PotholeFingerprintTracker());
  const shareLocationLabel = useMemo(() => sanitizeLocationName(locationName), [locationName]);
  const shareMessage = useMemo(() => {
    const coordinates = userLocation ? { lat: userLocation.lat, lon: userLocation.lng } : undefined;
    return createShareMessage(potholeCount, shareLocationLabel, currentSessionId || undefined, coordinates);
  }, [potholeCount, shareLocationLabel, currentSessionId, userLocation]);

  // Worker-based detector and session dedup - MODEL PRELOADS ON MOUNT!
  const { init, sendVideoFrame, stop: stopWorker, isLoading: modelLoading, isReady, isReadyRef, lastDetections, lastStats, backend } = usePotholeWorker({
    autoLoad: true, // Preload model immediately when component mounts
    modelUrl: '/models/model.onnx'
  });
  
  // GPS tracking with Kalman filter and interpolation
  const gpsTrackerRef = useRef<GPSTracker>(new GPSTracker());
  const detectionSmootherRef = useRef<DetectionSmoother>(new DetectionSmoother());

  // Haversine formula to calculate distance between two GPS points
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  // Detect if device is desktop on mount
  useEffect(() => {
    const checkIfDesktop = () => {
      // Check multiple factors to determine if desktop
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isLargeScreen = window.innerWidth >= 1024;
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      
      // Desktop if: large screen AND (no touch OR not mobile user agent)
      const desktop = isLargeScreen && (!hasTouch || !isMobileUA);
      setIsDesktop(desktop);
      
      console.log('[CameraTray] Device detection:', {
        isDesktop: desktop,
        hasTouch,
        isLargeScreen,
        isMobileUA,
        userAgent: userAgent.substring(0, 50)
      });
    };

    checkIfDesktop();
    window.addEventListener('resize', checkIfDesktop);
    return () => window.removeEventListener('resize', checkIfDesktop);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      handleClose();
      return;
    }

    if (isDesktop) {
      // Ensure any active mobile-only resources are stopped when switching to desktop view
      if (detectionIntervalRef.current) {
        clearTimeout(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
        detectionLoopRunningRef.current = false;
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      return;
    }

    // Mobile: start camera flow
    startCamera();
    setUserLocation({ lat: 20.5937, lng: 78.9629 });
    
    /*
    // Start watching user location (same approach as Globe component)
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const gpsPoint = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            timestamp: position.timestamp,
          };
          
          // Add to GPS tracker for smoothing and interpolation
          gpsTrackerRef.current.addPoint(gpsPoint);
          
          // Update UI with smoothed position
          const smoothed = gpsTrackerRef.current.getCurrentPosition();
          if (smoothed) {
            const newLoc = { lat: smoothed.lat, lng: smoothed.lng };
            setUserLocation(newLoc);
            
            // Calculate distance traveled for stats
            if (isDetecting && previousLocationRef.current) {
              setSessionDistance(prev => prev + calculateDistance(
                previousLocationRef.current.lat,
                previousLocationRef.current.lng,
                newLoc.lat,
                newLoc.lng
              ));
            }
            previousLocationRef.current = newLoc;
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
          toast({
            title: "Location Access",
            description: "Using approximate location. Enable GPS for accuracy.",
            variant: "default"
          });
          // Fallback to India center
          setUserLocation({ lat: 20.5937, lng: 78.9629 });
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 10000
        }
      );
    }
    */

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (detectionIntervalRef.current) {
        clearTimeout(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
        detectionLoopRunningRef.current = false;
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen, isDesktop]);

  // Update userLocation from gpsPosition prop (from Globe)
  useEffect(() => {
    if (gpsPosition) {
      console.log('[CameraTray] 📍 Updating location from Globe GPS:', gpsPosition);
      setUserLocation({ lat: gpsPosition.lat, lng: gpsPosition.lng });
      if (isDetecting && previousLocationRef.current) {
        setSessionDistance(prev => prev + calculateDistance(
          previousLocationRef.current.lat,
          previousLocationRef.current.lng,
          gpsPosition.lat,
          gpsPosition.lng
        ));
      }
      previousLocationRef.current = { lat: gpsPosition.lat, lng: gpsPosition.lng };
    }
  }, [gpsPosition, isDetecting]);

  // Reverse geocode location to get street/place name
  useEffect(() => {
    if (!userLocation) return;
    
    const controller = new AbortController();
    
    const fetchLocationName = async () => {
      try {
        const name = await reverseGeocode(userLocation.lat, userLocation.lng, controller.signal);
        if (name) {
          // Extract the most relevant part (first two parts usually road + area)
          const parts = name.split(',').slice(0, 2).join(',').trim();
          setLocationName(parts || name);
        } else {
          // Fallback to "Detecting location..."
          setLocationName('Detecting location...');
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Reverse geocode error:', error);
          setLocationName('Location unavailable');
        }
      }
    };
    
    fetchLocationName();
    
    return () => {
      controller.abort();
    };
  }, [userLocation]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1280, height: 720 }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      toast({
        title: "Camera Access Denied",
        description: "Please allow camera access to detect potholes",
        variant: "destructive"
      });
    }
  };

  const toggleDetection = async () => {
    const newIsDetecting = !isDetecting;
    
    // Prefer GPS for mapping, but allow scanning to continue without it
    if (newIsDetecting && !gpsPosition) {
      console.warn('[CameraTray] ⚠️ GPS unavailable at start — continuing with approximate location');
      toast({
        title: "📍 GPS Missing",
        description: "We'll keep scanning, but map pins may be less accurate until GPS locks on.",
      });
    }
    
    // Validate GPS accuracy
    if (newIsDetecting && gpsPosition && gpsPosition.accuracy > 50) {
      console.warn(`[CameraTray] ⚠️ Low GPS accuracy: ${gpsPosition.accuracy.toFixed(1)}m`);
      toast({
        title: "⚠️ Low GPS Accuracy",
        description: `GPS accuracy is ${gpsPosition.accuracy.toFixed(0)}m. For better results, wait for stronger signal.`,
      });
      // Still allow, but warn user
    }
    
    if (newIsDetecting && gpsPosition) {
      console.log('[CameraTray] ✅ GPS VALIDATED:', {
        lat: gpsPosition.lat.toFixed(6),
        lng: gpsPosition.lng.toFixed(6),
        accuracy: `${gpsPosition.accuracy.toFixed(1)}m`
      });
    } else if (newIsDetecting) {
      console.log('[CameraTray] ✅ Starting detection with approximate location (GPS pending)');
    }
    
    setIsDetecting(newIsDetecting);

    if (newIsDetecting) {
      // Start detection
      console.log('[CameraTray] 🔍 Starting detection...');
      setSessionStart(new Date());
      setSessionDistance(0);
      setPotholeCount(0);
      sessionReportsRef.current = [];
      detectionSmootherRef.current.reset();
    gpsTrackerRef.current.reset();
    fingerprintTrackerRef.current.reset();
    previousLocationRef.current = gpsPosition ? { lat: gpsPosition.lat, lng: gpsPosition.lng } : null;
      toast({
        title: "🔍 Scanning Road",
        description: "AI-powered pothole detection active!",
      });
      
      // Initialize worker if not already ready (autoLoad should have preloaded it)
      if (!isReadyRef.current) {
        console.log('[CameraTray] 📦 Initializing worker with model...');
        await init('/models/model.onnx');
        console.log('[CameraTray] ✅ Worker initialized, isReady:', isReady);
      } else {
        console.log('[CameraTray] ✅ Worker already ready (preloaded), skipping init');
      }
      
      // Use ref to control loop (prevents closure stale state bug)
      detectionLoopRunningRef.current = true;
      
      // Adaptive frame rate: lower on mobile for better battery & performance
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const frameDelay = isMobile ? 100 : 50; // 10 FPS on mobile, 20 FPS on desktop
      console.log(`[CameraTray] 📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}, Frame delay: ${frameDelay}ms`);
      
      const loop = async () => {
        if (!detectionLoopRunningRef.current) {
          console.log('[CameraTray] ⏹️ Loop stopped (detectionLoopRunningRef is false)');
          return;
        }
        if (videoRef.current && isReadyRef.current) { // Use isReadyRef, not isReady state!
          await sendVideoFrame(videoRef.current);
        } else {
          if (!videoRef.current) {
            console.warn('[CameraTray] ⚠️ Loop running but videoRef is null');
          }
          if (!isReadyRef.current) {
            console.warn('[CameraTray] ⚠️ Loop running but isReadyRef is false (isReady state:', isReady, ')');
          }
        }
        if (detectionLoopRunningRef.current) { // Check again before scheduling
          detectionIntervalRef.current = window.setTimeout(loop, frameDelay);
        }
      };
      console.log('[CameraTray] 🔄 Starting detection loop... isReadyRef:', isReadyRef.current, 'isReady state:', isReady);
      loop();
      
    } else {
      // Stop detection
      detectionLoopRunningRef.current = false; // Stop the loop
      if (detectionIntervalRef.current) {
        clearTimeout(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      setDetections([]);
      previousLocationRef.current = null;
      
      // Clear canvas immediately
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      
      const sessionReports = sessionReportsRef.current.slice();
      const reportCount = sessionReports.length;
      setPotholeCount(reportCount);
      fingerprintTrackerRef.current.reset();

      // Session data already stored in Supabase via reportStore
      // Each pothole report includes user_id for authenticated users
      if (sessionStart && reportCount > 0) {
        const duration = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
        const reports = sessionReports;
        
        console.log('[CameraTray] ✅ Session completed:', {
          potholes: reportCount,
          duration: `${duration}s`,
          distance: `${(sessionDistance / 1000).toFixed(2)}km`,
          reports: reports.length
        });
      }

      // Show share modal if we have findings
      if (reportCount > 0) {
        // Confetti celebration!
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        
        setFlash(true);
        setShowShareModal(true);
        setTimeout(() => setFlash(false), 250);
        
        // Prompt for registration if user not logged in (after share modal is closed)
        // This will show after user closes the share modal
      } else {
        // No potholes found, just prompt for registration if needed
        if (!user) {
          setTimeout(() => setShowRegisterPrompt(true), 500);
        }
      }
    }
  };

  // Draw detection boxes on canvas
  const drawDetections = (detectionResults: any[]) => {
    if (!canvasRef.current || !videoRef.current) {
      console.warn('[CameraTray] ⚠️ Cannot draw - canvas or video ref missing');
      return;
    }
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[CameraTray] ⚠️ Cannot get canvas context');
      return;
    }
    
    // Match canvas size to video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    console.log(`[CameraTray] 🎨 Drawing ${detectionResults.length} detections on ${canvas.width}x${canvas.height} canvas`);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw bounding boxes
    detectionResults.forEach((detection, idx) => {
      const [x, y, w, h] = detection.bbox;
      
      console.log(`[CameraTray] 📦 Box ${idx}: [${x.toFixed(0)}, ${y.toFixed(0)}, ${w.toFixed(0)}, ${h.toFixed(0)}] conf: ${(detection.confidence * 100).toFixed(1)}%`);
      
      // Draw box
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
      
      // Draw label
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(x, y - 30, w, 30);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(
        `Pothole ${(detection.confidence * 100).toFixed(0)}%`,
        x + 5,
        y - 8
      );
    });
    
    console.log('[CameraTray] ✅ Drawing complete');
  };

  // Generate share image
  const generateShareImage = async (): Promise<string | null> => {
    try {
      const duration = sessionStart ? Math.floor((Date.now() - sessionStart.getTime()) / 1000) : 0;
      const reports = sessionReportsRef.current;
      
      console.log('[CameraTray] 📸 Generating share image...', {
        reportsCount: reports.length,
        potholeCount,
        duration
      });
      
      if (reports.length === 0) {
        console.warn('[CameraTray] ⚠️ No reports to generate image from');
        return null;
      }
      
      const points = reports.map(r => ({ lat: r.lat, lon: r.lon }));
      
      console.log('[CameraTray] 🗺️ Generating map image with', points.length, 'points');
      
      const blob = await generateSessionShareImage(points, { 
        title: 'Tar.Trackers',
        subtitle: '', // No location in image
        stats: {
          distance: sessionDistance,
        }
      });
      
      const imageUrl = URL.createObjectURL(blob);
      console.log('[CameraTray] ✅ Share image generated:', imageUrl);
      return imageUrl;
    } catch (e) {
      console.error('[CameraTray] ❌ Failed to generate share image:', e);
      return null;
    }
  };

  // Handle share from modal
  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Tar.Trackers', text: shareMessage });
      } else {
        await navigator.clipboard.writeText(shareMessage);
        toast({ title: 'Copied!', description: 'Share text copied to clipboard' });
      }
      setShowShareModal(false);
    } catch (e) {
      console.error('Share failed:', e);
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(shareMessage);
        toast({ title: 'Copied!', description: 'Share text copied to clipboard' });
      } catch (clipboardError) {
        toast({ title: '❌ Share failed', description: 'Unable to share or copy text', variant: 'destructive' });
      }
    }
  };



  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopWorker();
    gpsTrackerRef.current.reset();
    detectionSmootherRef.current.reset();
    fingerprintTrackerRef.current.reset();
    setIsDetecting(false);
    setPotholeCount(0);
    setSessionStart(null);
    setDetections([]);
    sessionReportsRef.current = []; // Clear reports
    previousLocationRef.current = null;
    onClose();
  };

  // React to worker detections: draw every box and use fingerprinting for counting
  useEffect(() => {
    if (!videoRef.current || !isDetecting) return;

    const frameWidth = videoRef.current.videoWidth;
    const frameHeight = videoRef.current.videoHeight;

    if (!lastDetections.length || frameWidth === 0 || frameHeight === 0) {
      setDetections([]);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      return;
    }

    console.log('[CameraTray] 🎯 Processing', lastDetections.length, 'detections');

    const { allDetections, newPotholesToCount } = fingerprintTrackerRef.current.processDetections(
      lastDetections,
      frameWidth,
      frameHeight
    );

    setDetections(allDetections);
    drawDetections(allDetections);

    if (!newPotholesToCount.length) {
      return;
    }

    const baseLocation = gpsPosition ?? userLocation;
    if (!baseLocation) {
      console.warn('[CameraTray] ⚠️ No location fix available; counted detections will be skipped for mapping.');
      return;
    }

    const latCos = Math.cos(baseLocation.lat * Math.PI / 180);
    const timestamp = Date.now();

    newPotholesToCount.forEach((fp) => {
      const offsetLat = (fp.relativeY - 0.5) * 0.00003; // ~3m vertical span per frame
      const offsetLon = (fp.relativeX - 0.5) * 0.00003 / (latCos || 1);
      const lat = baseLocation.lat + offsetLat;
      const lon = baseLocation.lng + offsetLon;

      const report: SessionReport = { id: fp.id, lat, lon, ts: timestamp };
      sessionReportsRef.current.push(report);
      onPotholeDetected({ lat, lng: lon });
      console.log('[CameraTray] 📍 Report stored (fingerprint):', report);
    });

    setPotholeCount(sessionReportsRef.current.length);
  }, [lastDetections, isDetecting, gpsPosition, userLocation]);

  return (
    <AnimatePresence>
      {/* Desktop View - Show instead of camera on desktop browsers */}
      {isOpen && isDesktop && (
        <DesktopView onClose={onClose} />
      )}

      {/* Mobile Camera View - Only show on mobile devices */}
      {isOpen && !isDesktop && (
        <motion.div
          key="camera-tray"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-0 bg-background z-50 flex flex-col"
        >
          {/* Header - Always visible */}
          <div className="portrait:px-6 portrait:py-4 landscape:px-3 landscape:py-2 border-b-4 border-foreground flex justify-between items-center flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src="/icon-192.png" alt="Pothole Icon" className="portrait:w-8 portrait:h-8 landscape:w-6 landscape:h-6" />
              <h2 className="portrait:text-2xl landscape:text-lg font-bold uppercase">Tar<span className="text-primary">Trackers</span></h2>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} className="portrait:w-auto portrait:h-auto landscape:w-8 landscape:h-8">
              <X className="portrait:w-7 portrait:h-7 landscape:w-5 landscape:h-5" />
            </Button>
          </div>

            {/* Content - Fullscreen video */}
            <div className="flex-1 overflow-hidden flex portrait:flex-col landscape:flex-row">
              {/* Video Feed - Full height */}
              <div className="relative flex-1 bg-black overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                
                {/* Canvas overlay for detection boxes */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ objectFit: 'cover' }}
                />

                {/* Model Loading */}
                {modelLoading && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
                      <p className="text-white font-bold">Loading AI Model...</p>
                    </div>
                  </div>
                )}

                {/* Detection Status - Responsive positioning */}
                {isDetecting && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute portrait:top-4 portrait:left-4 landscape:top-2 landscape:left-2 bg-destructive text-destructive-foreground portrait:px-4 portrait:py-2 landscape:px-3 landscape:py-1.5 rounded-full border-4 border-foreground chunky-shadow-sm font-bold flex items-center gap-2 z-10 portrait:text-base landscape:text-sm"
                  >
                    <div className="portrait:w-3 portrait:h-3 landscape:w-2 landscape:h-2 bg-destructive-foreground rounded-full animate-pulse" />
                    DETECTING
                  </motion.div>
                )}


                {isDetecting && lastStats && (
                  <div className="absolute portrait:bottom-4 portrait:left-4 landscape:bottom-2 landscape:left-2 bg-background/90 backdrop-blur portrait:px-3 portrait:py-2 landscape:px-2 landscape:py-1 rounded-xl border-2 border-foreground/60 text-foreground portrait:text-xs landscape:text-[10px] font-bold z-10 shadow-lg">
                    AI {backend?.toUpperCase() ?? 'WASM'} • {lastStats.timeMs.toFixed(1)} ms • {lastStats.count} potholes
                  </div>
                )}

                {/* Flash animation on stop → share */}
                <AnimatePresence>
                  {flash && (
                    <motion.div
                      key="flash-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.85 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 bg-white z-50"
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Controls - Narrower sidebar in landscape */}
              <div className="portrait:px-4 portrait:py-3 landscape:p-2 portrait:space-y-3 landscape:space-y-2 bg-background portrait:border-t-4 landscape:border-l-4 border-foreground flex-shrink-0 landscape:w-40 landscape:flex landscape:flex-col landscape:justify-center">
                <div className="flex portrait:flex-row landscape:flex-col gap-2 items-stretch">
                  <Button
                    variant="default"
                    size="lg"
                    onClick={toggleDetection}
                    disabled={modelLoading}
                    className="flex-1 portrait:text-lg landscape:text-xs font-bold uppercase portrait:h-auto landscape:h-10 landscape:px-2"
                  >
                    <Camera className="portrait:mr-2 landscape:mr-1 portrait:w-5 portrait:h-5 landscape:w-3 landscape:h-3" />
                    <span className="portrait:inline landscape:inline">{modelLoading ? 'Loading' : isDetecting ? 'Pause' : 'Start'}</span>
                  </Button>
                  
                  <div className="flex items-center justify-center portrait:min-w-[68px] portrait:h-16 landscape:min-w-[56px] landscape:h-14 bg-background border-4 border-foreground rounded-2xl chunky-shadow text-destructive font-black portrait:text-4xl landscape:text-2xl leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                    {potholeCount}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
      )}

      {/* Registration prompt after detection - Only on mobile */}
      {!isDesktop && showRegisterPrompt && (
        <AuthModal 
          key="register-prompt"
          isOpen={showRegisterPrompt} 
          onClose={() => setShowRegisterPrompt(false)} 
          initialMode="signup"
        />
      )}

      {/* Share modal - Only on mobile */}
      {!isDesktop && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            // Show registration prompt after closing share modal if user not logged in
            if (!user && potholeCount > 0) {
              setTimeout(() => setShowRegisterPrompt(true), 500);
            }
          }}
          imageUrl={null}
          potholeCount={potholeCount}
          locationName={shareLocationLabel} 
          onShare={handleShare}
          shareMessage={shareMessage}
        />
      )}
    </AnimatePresence>
  );
};

export default CameraTray;
