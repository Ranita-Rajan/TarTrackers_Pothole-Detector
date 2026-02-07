// Temporal smoothing for detection results
// Reduces false positives by averaging predictions across frames

interface Detection {
  bbox: [number, number, number, number];
  confidence: number;
  class: string;
}

interface TrackedDetection {
  detections: Detection[];
  timestamps: number[];
  votes: number;
  avgConfidence: number;
  centerX: number;
  centerY: number;
}

export class DetectionSmoother {
  private tracks: Map<string, TrackedDetection> = new Map();
  private windowSize = 3; // Average over 3 frames
  private readonly iouThreshold = 0.5; // Intersection over union
  private minVotes = 2; // Need 2/3 detections to confirm
  private readonly trackTTL = 1000; // 1 second
  private readonly minConfidenceThreshold = 0.6; // Weighted confidence threshold

  // IMPROVEMENT: Adaptive window based on FPS
  setAdaptiveWindow(fps: number) {
    if (fps > 15) {
      this.windowSize = 3;
      this.minVotes = 2; // 2 of 3
    } else if (fps > 8) {
      this.windowSize = 2;
      this.minVotes = 2; // 2 of 2
    } else {
      this.windowSize = 2;
      this.minVotes = 1; // 1 of 2 (low FPS, accept more)
    }
  }

  // Process new frame detections
  processFrame(detections: Detection[], timestamp: number, fps?: number): Detection[] {
    // Adapt to FPS if provided
    if (fps !== undefined) {
      this.setAdaptiveWindow(fps);
    }
    
    this.cleanupOldTracks(timestamp);
    this.cleanupOldTracks(timestamp);

    const confirmed: Detection[] = [];

    // Match detections to existing tracks or create new ones
    for (const det of detections) {
      const center = this.getCenter(det.bbox);
      let matched = false;

      // Try to match with existing tracks
      for (const [id, track] of this.tracks.entries()) {
        if (this.isSimilarDetection(center, track)) {
          track.detections.push(det);
          track.timestamps.push(timestamp);
          track.votes++;

          // Keep window size limited
          if (track.detections.length > this.windowSize) {
            track.detections.shift();
            track.timestamps.shift();
          }

          // Update average confidence
          track.avgConfidence =
            track.detections.reduce((sum, d) => sum + d.confidence, 0) /
            track.detections.length;

          matched = true;

          // IMPROVEMENT: Weighted confidence voting
          // If we have enough votes AND confidence is high enough, confirm
          if (track.votes >= this.minVotes && track.avgConfidence >= this.minConfidenceThreshold) {
            confirmed.push(this.getAveragedDetection(track));
          }
          break;
        }
      }

      // Create new track if no match
      if (!matched) {
        const id = `${center.x.toFixed(2)}_${center.y.toFixed(2)}_${timestamp}`;
        this.tracks.set(id, {
          detections: [det],
          timestamps: [timestamp],
          votes: 1,
          avgConfidence: det.confidence,
          centerX: center.x,
          centerY: center.y,
        });
      }
    }

    return confirmed;
  }

  // Clean up old tracks
  private cleanupOldTracks(currentTime: number) {
    for (const [id, track] of this.tracks.entries()) {
      const lastSeen = track.timestamps[track.timestamps.length - 1];
      if (currentTime - lastSeen > this.trackTTL) {
        this.tracks.delete(id);
      }
    }
  }

  // Check if detection is similar to existing track
  private isSimilarDetection(
    center: { x: number; y: number },
    track: TrackedDetection
  ): boolean {
    const dx = center.x - track.centerX;
    const dy = center.y - track.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Allow some movement (e.g., 10% of frame)
    return distance < 0.1;
  }

  // Get center of bounding box (normalized 0-1)
  private getCenter(bbox: [number, number, number, number]): {
    x: number;
    y: number;
  } {
    const [x, y, w, h] = bbox;
    return {
      x: (x + w / 2) / 640, // Normalize to 0-1
      y: (y + h / 2) / 640,
    };
  }

  // Average detections in a track
  private getAveragedDetection(track: TrackedDetection): Detection {
    const avgBbox = track.detections.reduce(
      (sum, det) => {
        return [
          sum[0] + det.bbox[0],
          sum[1] + det.bbox[1],
          sum[2] + det.bbox[2],
          sum[3] + det.bbox[3],
        ] as [number, number, number, number];
      },
      [0, 0, 0, 0] as [number, number, number, number]
    );

    const n = track.detections.length;
    return {
      bbox: [
        avgBbox[0] / n,
        avgBbox[1] / n,
        avgBbox[2] / n,
        avgBbox[3] / n,
      ],
      confidence: track.avgConfidence,
      class: track.detections[0].class,
    };
  }

  reset() {
    this.tracks.clear();
  }

  getActiveTrackCount(): number {
    return this.tracks.size;
  }
}
