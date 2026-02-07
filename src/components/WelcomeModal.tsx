import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  const [showMore, setShowMore] = useState(false);

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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-2xl h-[90vh] pointer-events-auto"
            >
              <div className="bg-background border-4 border-foreground rounded-3xl chunky-shadow-lg h-full flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b-4 border-foreground">
                  <div className="flex items-center gap-4">
                    <img src="/icon-192.png" alt="Potholes" className="w-12 h-12" />
                    <div>
                      <h2 className="text-2xl font-bold uppercase">Unveiling Tar Tracker!</h2>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-muted rounded-xl transition-colors"
                  >
                    <X size={24} strokeWidth={3} />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Main intro */}
                  <div className="space-y-4">
                    <p className="text-lg font-bold">
                      Pothole Detector — Potholes themselves wouldn’t get lost!
                    </p>
                    
                    <p>
                       On the move—driving, biking, or walking? Open the site, turn on location and camera, and let the AI detect and map potholes around you in real       
                      time. 
                    </p>

                    <p>
                      Share your findings on social media to make local authorities take notice and act.      
                    </p>
                  </div>

                  {/* Read More Button */}
                  {!showMore && (
                    <button
                      onClick={() => setShowMore(true)}
                      className="w-full py-3 px-6 bg-foreground text-background font-bold uppercase rounded-xl hover:bg-foreground/90 transition-colors"
                    >
                      Read More
                    </button>
                  )}

                  {/* Extended Content */}
                  <AnimatePresence>
                    {showMore && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-6"
                      >
                      {/* The Harsh Reality */}
                      <div className="space-y-4 border-t-4 border-foreground pt-6">
                        <h3 className="text-xl font-bold uppercase">The Harsh Reality of Indian Roads</h3>
                        
                        <p>
                          Potholes are not just a construction problem—they’re a systemic issue involving poor planning, heavy traffic, weather damage, bureaucratic delays and funding constraints. Without community reporting, preventive maintenance and better governance, potholes will continue to plague Indian roads.
                        </p>

                        <p className="font-bold">
                          Despite repeated incidents, authorities often deny or downplay the problem instead of addressing it head-on.
                        </p>
                      </div>

                      {/* Why it matters? */}
                      <div className="space-y-4 border-t-4 border-foreground pt-6">
                        <h3 className="text-xl font-bold uppercase">Why it matters?</h3>
                        
                        <p>
                         Poorly maintained roads with potholes continue to be a major safety and infrastructure issue across Indian cities and highways. They are linked to serious accidents, public anger, legal scrutiny, and both grassroots and civic efforts to force action from authorities.                        
                        </p>
                        
                      </div>
                  </motion.div>
              )
            }
                </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="p-6 border-t-4 border-foreground">
                  <button
                    onClick={onClose}
                    className="w-full py-3 px-6 bg-primary text-primary-foreground font-bold uppercase rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    Let's Get Started!
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
