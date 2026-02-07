// Visual fingerprinting system for pothole deduplication
// Uses bbox characteristics and visual appearance to identify the same pothole

export interface Detection {
  bbox: [number, number, number, number]; // [x, y, width, height]
  confidence: number;
  class: string;
}

export interface PotholeFingerprint {
  // Spatial characteristics (relative to frame)
  relativeX: number; // 0-1, center X position in frame
  relativeY: number; // 0-1, center Y position in frame
  aspectRatio: number; // width/height ratio
  size: number; // relative size (area / frame_area)
  
  // Temporal tracking
  firstSeen: number; // timestamp
  lastSeen: number; // timestamp
  seenCount: number; // how many frames detected
  
  // Counting status
  counted: boolean; // Whether this pothole has been counted yet
  
  // Unique ID
  id: string;
}

export class PotholeFingerprintTracker {
  private fingerprints: Map<string, PotholeFingerprint> = new Map();
  private readonly similarityThreshold = 0.1; // 10% difference allowed (90% match)
  private readonly ttlMs = 8000; // 8 seconds - keep fingerprints longer to avoid recounts
  private countedIds: Set<string> = new Set(); // Track what's been counted
  
  /**
   * Calculate visual fingerprint from detection
   */
  private calculateFingerprint(
    det: Detection, 
    frameWidth: number, 
    frameHeight: number,
    timestamp: number
  ): PotholeFingerprint {
    const [x, y, w, h] = det.bbox;
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const frameArea = frameWidth * frameHeight;
    const bboxArea = w * h;
    
    return {
      relativeX: centerX / frameWidth,
      relativeY: centerY / frameHeight,
      aspectRatio: w / h,
      size: bboxArea / frameArea,
      firstSeen: timestamp,
      lastSeen: timestamp,
      seenCount: 1,
      counted: false, // New pothole, not counted yet
      id: `fp_${timestamp}_${Math.random().toString(36).substr(2, 9)}`
    };
  }
  
  /**
   * Calculate similarity between two fingerprints
   * Returns 0 (completely different) to 1 (identical)
   */
  private calculateSimilarity(fp1: PotholeFingerprint, fp2: PotholeFingerprint): number {
    // Position similarity (most important for same pothole)
    const positionDiff = Math.sqrt(
      Math.pow(fp1.relativeX - fp2.relativeX, 2) +
      Math.pow(fp1.relativeY - fp2.relativeY, 2)
    );
    const positionSim = 1 - Math.min(positionDiff, 1);
    
    // Size similarity
    const sizeDiff = Math.abs(fp1.size - fp2.size) / Math.max(fp1.size, fp2.size);
    const sizeSim = 1 - Math.min(sizeDiff, 1);
    
    // Aspect ratio similarity
    const aspectDiff = Math.abs(fp1.aspectRatio - fp2.aspectRatio) / Math.max(fp1.aspectRatio, fp2.aspectRatio);
    const aspectSim = 1 - Math.min(aspectDiff, 1);
    
    // Weighted combination (position is most important)
    return (positionSim * 0.6) + (sizeSim * 0.25) + (aspectSim * 0.15);
  }
  
  /**
   * Process new detections - COUNT IMMEDIATELY on first sight
   * Returns ALL detections to draw + list of NEW potholes to count
   */
  processDetections(
    detections: Detection[],
    frameWidth: number,
    frameHeight: number
  ): { allDetections: Detection[], newPotholesToCount: PotholeFingerprint[] } {
    const now = Date.now();
    const newPotholesToCount: PotholeFingerprint[] = [];
    const confidenceFloor = 0.40; // Ignore low-confidence detections (likely artifacts/shadows)
    
    // Clean up old fingerprints (haven't been seen in TTL window)
    for (const [id, fp] of this.fingerprints.entries()) {
      if (now - fp.lastSeen > this.ttlMs) {
        console.log('[Fingerprint] 🗑️ Expired:', id, '(last seen', ((now - fp.lastSeen) / 1000).toFixed(1), 's ago)');
        this.fingerprints.delete(id);
        this.countedIds.delete(id);
      }
    }
    
    // Filter out low-confidence detections before processing
    const filteredDetections = detections.filter(det => {
      if (det.confidence < confidenceFloor) {
        console.log(`[Fingerprint] 🚫 Skipped low-confidence detection (${(det.confidence * 100).toFixed(0)}% < ${(confidenceFloor * 100).toFixed(0)}%)`);
        return false;
      }
      return true;
    });
    
    // Process each high-confidence detection
    for (const det of filteredDetections) {
      const newFp = this.calculateFingerprint(det, frameWidth, frameHeight, now);
      
      // Try to match with existing fingerprints
      let bestMatch: { id: string; fp: PotholeFingerprint; similarity: number } | null = null;
      
      for (const [id, existingFp] of this.fingerprints.entries()) {
        const similarity = this.calculateSimilarity(newFp, existingFp);
        
        // Threshold is stored as max difference allowed (0.15 = allow 15% difference = 85% match)
        // So we need: (1 - similarity) <= threshold  →  similarity >= (1 - threshold)
        if ((1 - similarity) <= this.similarityThreshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { id, fp: existingFp, similarity };
          }
        }
      }
      
      if (bestMatch) {
        // EXISTING pothole - just update tracking, DON'T count
        bestMatch.fp.lastSeen = now;
        bestMatch.fp.seenCount++;
        
        // Update position (moving average for stability)
        const alpha = 0.3; // Weight for new observation
        bestMatch.fp.relativeX = alpha * newFp.relativeX + (1 - alpha) * bestMatch.fp.relativeX;
        bestMatch.fp.relativeY = alpha * newFp.relativeY + (1 - alpha) * bestMatch.fp.relativeY;
        bestMatch.fp.size = alpha * newFp.size + (1 - alpha) * bestMatch.fp.size;
        
        console.log(`[Fingerprint] 🔄 Tracked (seen ${bestMatch.fp.seenCount}x, ${(bestMatch.similarity * 100).toFixed(0)}% match)`);
        
      } else {
        // NEW pothole - COUNT IMMEDIATELY!
  newFp.counted = true;
  this.fingerprints.set(newFp.id, newFp);
  this.countedIds.add(newFp.id);
        newPotholesToCount.push(newFp);
        console.log(`[Fingerprint] ✨ NEW pothole! ${newFp.id} → COUNT IT NOW!`);
      }
    }
    
    // Return ALL detections for drawing boxes + new potholes for counting
    // Note: allDetections includes both high and low confidence detections for visualization
    // but only high-confidence ones are counted
    return { 
      allDetections: detections,  // Draw all boxes (for user visibility)
      newPotholesToCount          // Count only high-confidence new ones
    };
  }
  
  /**
   * No longer needed - we count immediately
   */
  getConfirmedPotholes(): PotholeFingerprint[] {
    return [];
  }
  
  /**
   * No longer needed - we don't use seenCount for confirmation
   */
  markAsCounted(fingerprintId: string): void {
    this.countedIds.add(fingerprintId);
  }
  
  /**
   * Check if a fingerprint has already been counted
   */
  isCounted(fingerprintId: string): boolean {
    return this.countedIds.has(fingerprintId);
  }
  
  /**
   * Reset all tracking (e.g., when starting new detection session)
   */
  reset(): void {
    console.log('[Fingerprint] 🔄 Resetting tracker');
    this.fingerprints.clear();
    this.countedIds.clear();
  }
  
  /**
   * Get statistics for debugging
   */
  getStats(): { total: number; counted: number } {
    return {
      total: this.fingerprints.size,
      counted: this.countedIds.size
    };
  }
}
