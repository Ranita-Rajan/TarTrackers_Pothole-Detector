import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Share2, MapPin, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { getReportStore, type PotholeReport } from '@/lib/reportStore';

import { toast } from '@/hooks/use-toast';

const Profile = () => {
  const { user } = useAuth();
  const [userReports, setUserReports] = useState<PotholeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    
    let unsub: (() => void) | null = null;
    let mounted = true;
    
    (async () => {
      try {
        const store = await getReportStore();
        // Use subscribeByUser with the correct user ID field
        const userId = user.id || user.uid;
        
        if (store.subscribeByUser) {
          unsub = store.subscribeByUser(
            userId,
            (reports) => {
              if (!mounted) return;
              setUserReports(reports);
              setLoading(false);
            }
          );
        } else {
          // Fallback: subscribe to all and filter client-side
          unsub = store.subscribeNearby(
            { lat: 0, lon: 0 }, 
            999999,
            (reports) => {
              if (!mounted) return;
              const filtered = reports.filter(r => r.user_id === userId || r.uid === userId);
              setUserReports(filtered);
              setLoading(false);
            }
          );
        }
      } catch (err) {
        // ...removed console.error for production...
        if (mounted) setLoading(false);
      }
    })();
    
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
  }, [user]);

  const handleReShare = async (report: PotholeReport) => {
    setSharingId(report.id);
    try {
      const shareText = `I mapped a pothole using Tar Trackers! Help make our roads safer by reporting potholes in real-time. Join me at Tar Trackers and let's fix our roads together.`;
      
      if (navigator.share) {
        await navigator.share({
          title: 'Pothole Detected',
          text: shareText
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        toast({ title: 'Copied!', description: 'Share text copied to clipboard' });
      }
    } catch (err) {
      // ...removed console.error for production...
      // Fallback to clipboard
      try {
        const shareText = `I mapped a pothole using Tar Trackers! Help make our roads safer by reporting potholes in real-time. Join me at Tar Trackers and let's fix our roads together.`;
        await navigator.clipboard.writeText(shareText);
        toast({ title: 'Copied!', description: 'Share text copied to clipboard' });
      } catch {
        toast({ title: '❌ Share failed', variant: 'destructive' });
      }
    } finally {
      setSharingId(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold uppercase mb-4">Login Required</h2>
          <p className="text-lg mb-6">You need to be logged in to view your profile.</p>
          <Link to="/">
            <Button size="lg" className="text-lg font-bold uppercase">
              <ArrowLeft className="mr-2" />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-4 border-foreground bg-background p-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft />
            </Button>
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold uppercase">
            Your Profile
          </h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-6">
        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary text-primary-foreground rounded-2xl border-4 border-foreground chunky-shadow-lg p-8 mb-8"
        >
          <div className="text-center">
            <h2 className="text-lg font-bold uppercase mb-2">Total Potholes Mapped</h2>
            <div className="text-6xl font-bold mb-2">{userReports.length}</div>
            <p className="text-sm opacity-90">
              {userReports.length === 0 ? 'Start detecting to make a difference!' :
               userReports.length === 1 ? 'Great start! Keep mapping!' :
               userReports.length < 10 ? 'You\'re making an impact!' :
               userReports.length < 50 ? 'Amazing contribution!' :
               'Road safety champion!'}
            </p>
          </div>
        </motion.div>

        {/* User Info */}
        <div className="bg-muted rounded-2xl border-4 border-foreground chunky-shadow-sm p-6 mb-8">
          <h3 className="text-xl font-bold uppercase mb-4">Account Info</h3>
          <div className="space-y-2">
            <p className="text-sm"><span className="font-bold">Email:</span> {user.email}</p>
            {user.displayName && (
              <p className="text-sm"><span className="font-bold">Name:</span> {user.displayName}</p>
            )}
          </div>
        </div>

        {/* Reports List */}
        <div className="bg-background rounded-2xl border-4 border-foreground chunky-shadow-sm p-6">
          <h3 className="text-xl font-bold uppercase mb-4">Recent Detections</h3>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading your reports...</p>
          ) : userReports.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No potholes mapped yet. Start detecting to see your contributions!
            </p>
          ) : (
            <div className="space-y-4">
              {userReports
                .sort((a, b) => b.ts - a.ts)
                .slice(0, 3)
                .map((report) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-muted rounded-xl border-2 border-foreground p-4 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin size={16} className="text-primary" />
                        <span className="text-sm font-bold">
                          {report.lat.toFixed(5)}, {report.lon.toFixed(5)}
                        </span>
                      </div>
                      {report.conf && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Confidence: {(report.conf * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={() => handleReShare(report)}
                      disabled={sharingId === report.id}
                      size="sm"
                      variant="outline"
                      className="font-bold"
                    >
                      {sharingId === report.id ? '...' : <Share2 size={16} />}
                    </Button>
                  </motion.div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
