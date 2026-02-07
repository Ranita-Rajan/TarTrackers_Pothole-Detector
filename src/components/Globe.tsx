import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Map, {
  Marker,
  GeolocateControl,
  MapRef,
  useMap
} from 'react-map-gl';
import type { Projection } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import Supercluster from 'supercluster';

type ViewStateType = {
  latitude: number;
  longitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
};

// Use Mapbox's built-in dark navigation style (no terrain)
const MAP_STYLE = 'mapbox://styles/mapbox/navigation-night-v1';

// Fetch Mapbox token from secure Netlify Function (not exposed in frontend bundle)
// Falls back to environment variable in development
let cachedMapboxToken: string | null = null;

async function getMapboxToken(): Promise<string | null> {
  if (cachedMapboxToken) return cachedMapboxToken;
  
  // In development (localhost), use environment variable directly
  if (import.meta.env.DEV || window.location.hostname === 'localhost') {
    const envToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (envToken) {
      console.log('[Globe] 🔧 Using Mapbox token from environment (dev mode)');
      cachedMapboxToken = envToken;
      return cachedMapboxToken;
    }
  }
  
  // In production, fetch from Netlify function
  try {
    const res = await fetch('/.netlify/functions/mapbox-token');
    if (!res.ok) {
      console.error('[Globe] Failed to fetch Mapbox token:', res.status);
      
      // Final fallback: try environment variable even in production
      const envToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
      if (envToken) {
        console.warn('[Globe] ⚠️ Using fallback Mapbox token from environment');
        cachedMapboxToken = envToken;
        return cachedMapboxToken;
      }
      
      return null;
    }
    const data = await res.json();
    cachedMapboxToken = data.token;
    return cachedMapboxToken;
  } catch (error) {
    console.error('[Globe] Error fetching Mapbox token:', error);
    
    // Final fallback: try environment variable
    const envToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (envToken) {
      console.warn('[Globe] ⚠️ Using fallback Mapbox token from environment');
      cachedMapboxToken = envToken;
      return cachedMapboxToken;
    }
    
    return null;
  }
}

interface PotholeMarker {
  id: string;
  lat: number;
  lng: number;
  timestamp: Date;
}

interface GlobeProps {
  potholes: PotholeMarker[];
  onGpsUpdate?: (position: { lat: number; lng: number; accuracy: number }) => void;
}

export default function Globe({ potholes, onGpsUpdate }: GlobeProps) {
  const mapRef = useRef<MapRef>(null);
  const geolocateControlRef = useRef<any>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewStateType>({
    latitude: 20.5937,
    longitude: 78.9629,
    zoom: 1.5,
    bearing: 0,
    pitch: 30
  });

  // Fetch Mapbox token on mount
  useEffect(() => {
    getMapboxToken().then(token => {
      if (token) {
        setMapboxToken(token);
        console.log('[Globe] ✅ Mapbox token loaded securely');
      } else {
        console.error('[Globe] ❌ Failed to load Mapbox token');
      }
    });
  }, []);

  const handleMapLoad = useCallback(() => {
    // Map is loaded with navigation style
    console.log('[Globe] 🌍 Mapbox map loaded with navigation style');
  }, []);

  // Cluster potholes when zoomed out to avoid overcrowding
  const clusters = useMemo(() => {
    const supercluster = new Supercluster({
      radius: 60,
      maxZoom: 16,
      minZoom: 0,
    });

    const points = potholes.map(p => ({
      type: 'Feature' as const,
      properties: { 
        cluster: false,
        potholeId: p.id,
        timestamp: p.timestamp
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.lng, p.lat]
      }
    }));

    supercluster.load(points);
    
    const zoom = Math.floor(viewState.zoom);
    const bounds = mapRef.current?.getMap()?.getBounds();
    
    if (!bounds) {
      return supercluster.getClusters([-180, -85, 180, 85], zoom);
    }

    return supercluster.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom
    );
  }, [potholes, viewState.zoom, viewState.latitude, viewState.longitude]);

  // Trigger location request automatically when component mounts
  useEffect(() => {
    // Wait for the map and geolocate control to be fully initialized
    const timer = setTimeout(() => {
      if (geolocateControlRef.current) {
        // @ts-ignore - trigger the geolocate control programmatically
        geolocateControlRef.current.trigger();
      }
    }, 1000); // 1 second delay to ensure control is ready

    return () => clearTimeout(timer);
  }, []);

  // Don't render map until token is loaded
  if (!mapboxToken) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-8 pt-20 pb-36">
        <div className="w-full h-full max-w-6xl max-h-[70vh] rounded-3xl overflow-hidden border-4 border-foreground chunky-shadow-lg bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading map...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center p-8 pt-20 pb-36">
      <div className="w-full h-full max-w-6xl max-h-[70vh] rounded-3xl overflow-hidden border-4 border-foreground chunky-shadow-lg">
        <Map
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapboxAccessToken={mapboxToken}
          ref={mapRef}
          mapStyle={MAP_STYLE}
          maxPitch={85}
          minZoom={1}
          maxZoom={20}
          onLoad={handleMapLoad}
          projection={'globe' as unknown as Projection}
        >
          <GeolocateControl
            ref={geolocateControlRef}
            positionOptions={{ 
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0 // Never use cached position
            }}
            // Use Mapbox's built-in smooth animation
            trackUserLocation={true}
            showUserHeading={true}
            showAccuracyCircle={false} // Disable the large accuracy circle
            onGeolocate={(e) => {
              // Send GPS updates to parent component
              if (onGpsUpdate && e.coords) {
                const gpsData = {
                  lat: e.coords.latitude,
                  lng: e.coords.longitude,
                  accuracy: e.coords.accuracy
                };
                console.log('[Globe] 📡 GPS update:', gpsData);
                onGpsUpdate(gpsData);
              } else {
                console.warn('[Globe] ⚠️ GPS update missing coords or onGpsUpdate callback');
              }
            }}
            style={{
              borderRadius: '0.75rem',
              border: '4px solid black',
              backgroundColor: 'white'
            }}
          />

          {/* Pothole Markers with Clustering */}
          <AnimatePresence>
            {clusters.map((cluster) => {
              const [lng, lat] = cluster.geometry.coordinates;
              const isCluster = cluster.properties.cluster;
              const pointCount = cluster.properties.point_count;

              if (isCluster) {
                // Render cluster marker
                return (
                  <Marker
                    key={`cluster-${cluster.id}`}
                    latitude={lat}
                    longitude={lng}
                    anchor="center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      whileHover={{ scale: 1.2 }}
                      className="relative cursor-pointer"
                      onClick={() => {
                        // Zoom into cluster
                        if (mapRef.current) {
                          mapRef.current.flyTo({
                            center: [lng, lat],
                            zoom: Math.min(viewState.zoom + 2, 18),
                            duration: 1000
                          });
                        }
                      }}
                    >
                      {/* Pothole icon instead of number */}
                      <div
                        className="flex items-center justify-center bg-destructive border-4 border-foreground rounded-full shadow-xl overflow-hidden"
                        style={{
                          width: `${40 + Math.min(pointCount / 10, 40)}px`,
                          height: `${40 + Math.min(pointCount / 10, 40)}px`,
                        }}
                      >
                        <img 
                          src="/icon-192.png" 
                          alt="Pothole cluster" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {/* Pulsing ring - DISABLED */}
                      {/* <div
                        className="absolute inset-0 rounded-full border-4 border-destructive animate-ping opacity-75"
                        style={{
                          animationDuration: '2s',
                        }}
                      /> */}
                    </motion.div>
                  </Marker>
                );
              }

              // Render individual pothole marker
              const potholeId = cluster.properties.potholeId;
              return (
                <Marker
                  key={potholeId}
                  latitude={lat}
                  longitude={lng}
                  anchor="bottom"
                >
                  <motion.div
                    initial={{ scale: 0, y: 20 }}
                    animate={{
                      scale: 1, // Static scale, no pulsing
                      y: 0,
                    }}
                    exit={{ scale: 0, y: 20 }}
                    transition={{
                      duration: 0.3, // Quick fade-in only
                      ease: 'easeOut',
                    }}
                    className="relative group"
                  >
                    {/* Ripple effect - DISABLED */}
                    {/* <div className="absolute -inset-4 -bottom-4">
                      <div
                        className="absolute inset-0 rounded-full border-2 border-destructive opacity-0 animate-ripple"
                        style={{
                          animationDelay: '0s',
                        }}
                      />
                      <div
                        className="absolute inset-0 rounded-full border-2 border-destructive opacity-0 animate-ripple"
                        style={{
                          animationDelay: '0.5s',
                        }}
                      />
                      <div
                        className="absolute inset-0 rounded-full border-2 border-destructive opacity-0 animate-ripple"
                        style={{
                          animationDelay: '1s',
                        }}
                      />
                    </div> */}

                    {/* Pothole icon marker */}
                    <div className="flex items-center justify-center">
                      <div 
                        className="bg-destructive border-4 border-foreground rounded-full shadow-xl flex items-center justify-center overflow-hidden"
                        style={{
                          width: '48px',
                          height: '48px'
                        }}
                      >
                        <img 
                          src="/icon-192.png" 
                          alt="Pothole" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>

                    {/* Hover tooltip */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="ugly-badge">Pothole</div>
                    </div>
                  </motion.div>
                </Marker>
              );
            })}
          </AnimatePresence>
        </Map>
      </div>
    </div>
  );
}
