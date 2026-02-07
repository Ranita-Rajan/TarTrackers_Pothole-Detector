import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  potholeCount: number;
  locationName: string;
  onShare: () => void;
  shareMessage: string;
}

export default function ShareModal({
  isOpen,
  onClose,
  imageUrl,
  potholeCount,
  locationName,
  onShare,
  shareMessage
}: ShareModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Share Your Map</DialogTitle>
          <DialogDescription>
            Share your pothole detection session on social media
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2 text-center">
            <p className="text-lg font-semibold">
              Mapped <span className="text-destructive font-bold">{potholeCount}</span> pothole{potholeCount === 1 ? '' : 's'} with <span className="font-bold">Tar.Trackers</span>
            </p>
            <p className="text-sm font-semibold">Share message</p>
            <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-left text-sm font-mono whitespace-pre-wrap max-h-[150px] overflow-y-auto">
              {shareMessage}
            </div>
            <Button 
              onClick={onShare}
              className="w-full text-lg font-bold mt-2"
              size="lg"
            >
              <Share2 className="w-5 h-5 mr-2" />
              Share Now
            </Button>
          </div>
          <div className="mt-6 text-center">
            <p className="italic text-xs text-muted-foreground leading-relaxed">
              Highlight your impact! Capture your pothole map, share it with your message, and repost reports from your Profile. Don’t forget to tag local leaders to make our roads safer!
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
