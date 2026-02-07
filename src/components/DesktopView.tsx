import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Smartphone, X, Menu } from 'lucide-react';
import { useState } from 'react';

interface DesktopViewProps {
  onClose: () => void;
}

const DesktopView = ({ onClose }: DesktopViewProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="fixed inset-0 bg-background z-50 overflow-y-auto scroll-smooth">
      {/* Header */}
      <div className="border-b-4 border-foreground px-6 py-4 flex justify-between items-center sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="Pothole Icon" className="w-10 h-10" />
          <h2 className="text-3xl font-bold uppercase">
            Tar<span className="text-primary"> Trackers</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            {isMenuOpen ? <X /> : <Menu />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <X className="w-7 h-7" />
          </Button>
        </div>
      </div>

      {/* Navigation Menu */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />
          
          {/* Menu */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-80 bg-background border-l-4 border-foreground z-50 p-6"
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
              <button
                onClick={() => setIsMenuOpen(false)}
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

      {/* Main Content */}
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          
          {/* Left Side - Mobile Prompt & QR Code */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/10 border-4 border-foreground rounded-3xl p-8 chunky-shadow-lg"
          >
            <div className="text-center space-y-6">
              <Smartphone className="w-20 h-20 mx-auto text-primary animate-pulse" />
              
              <h3 className="text-3xl font-black uppercase">Use Your Mobile Device</h3>
              
              <p className="text-lg text-muted-foreground">
                Pothole detection requires camera access and GPS, which work best on mobile devices.
              </p>

              {/* QR Code */}
              <div className="bg-white p-6 rounded-2xl border-4 border-foreground inline-block">
                <img 
                  src="/qr-code.png" 
                  alt="Scan to open on mobile" 
                  className="w-[200px] h-[200px]"
                />
              </div>

              <div className="space-y-2">
                <p className="font-bold text-lg">Scan this QR code on your phone</p>
                <p className="text-sm text-muted-foreground">
                  Or visit: <span className="font-mono font-bold text-primary">Tar.Trackers</span>
                </p>
              </div>
            </div>
          </motion.div>

          {/* Right Side - About Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            <div className="bg-background border-4 border-foreground rounded-3xl p-8 chunky-shadow-lg">
              <h3 className="text-2xl font-black uppercase mb-4">About Tar Trackers</h3>
              
              <div className="space-y-4 text-muted-foreground">
                <p className="text-lg text-foreground">
                  Tar Tracker is a community-powered platform that uses AI-driven mobile camera detection to map potholes in real time.
                </p>
              </div>
            </div>

            {/* Call to Action */}
            <div className="bg-destructive text-destructive-foreground border-4 border-foreground rounded-3xl p-6 chunky-shadow text-center">
              <h4 className="font-bold text-xl mb-2">Ready to Help Fix Roads?</h4>
              <p className="mb-4">Scan the QR code with your phone to start detecting potholes!</p>
              <p className="text-sm mb-4 opacity-90">On browser, you can view the potholes mapped by others</p>
              <Button 
                variant="secondary" 
                size="lg"
                onClick={onClose}
                className="font-bold"
              >
                View Pothole Map
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default DesktopView;
