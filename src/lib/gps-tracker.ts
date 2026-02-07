// GPS tracking with Kalman filter for smooth, accurate positioning
// Handles interpolation for moving vehicles

interface GPSPoint {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null; // m/s
  heading: number | null; // degrees
  timestamp: number;
}

class KalmanFilter {
  private q = 0.00001; // Process variance
  private r = 0.01; // Measurement variance
  private p = 1.0; // Estimation error covariance
  private x = 0.0; // Value
  private k = 0.0; // Kalman gain

  constructor(q = 0.00001, r = 0.01) {
    this.q = q;
    this.r = r;
  }

  filter(measurement: number): number {
    // Prediction
    this.p = this.p + this.q;

    // Update
    this.k = this.p / (this.p + this.r);
    this.x = this.x + this.k * (measurement - this.x);
    this.p = (1 - this.k) * this.p;

    return this.x;
  }

  reset(value: number) {
    this.x = value;
    this.p = 1.0;
  }
}

export class GPSTracker {
  private buffer: GPSPoint[] = [];
  private readonly maxBufferSize = 10;
  private latFilter = new KalmanFilter();
  private lngFilter = new KalmanFilter();
  private lastPosition: GPSPoint | null = null;

  addPoint(point: GPSPoint) {
    // Apply Kalman filtering
    const filteredLat = this.latFilter.filter(point.lat);
    const filteredLng = this.lngFilter.filter(point.lng);

    const filtered: GPSPoint = {
      ...point,
      lat: filteredLat,
      lng: filteredLng,
    };

    this.buffer.push(filtered);
    this.lastPosition = filtered;

    // Keep buffer size manageable
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  // Get current position with interpolation for moving vehicles
  getCurrentPosition(timestamp?: number): GPSPoint | null {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) return this.buffer[0];

    const now = timestamp ?? Date.now();
    const latest = this.buffer[this.buffer.length - 1];

    // If we have a recent update (within 2 seconds), use it directly
    if (now - latest.timestamp < 2000) {
      return latest;
    }

    // For moving vehicles, predict position based on velocity
    if (latest.speed !== null && latest.speed > 0.5 && latest.heading !== null) {
      const timeDelta = (now - latest.timestamp) / 1000; // seconds
      const distanceMoved = latest.speed * timeDelta; // meters

      // Don't extrapolate too far (max 3 seconds)
      if (timeDelta > 3) {
        return latest;
      }

      // Convert heading to radians and calculate new position
      const headingRad = (latest.heading * Math.PI) / 180;
      const latChange = (distanceMoved * Math.cos(headingRad)) / 111320; // ~111km per degree lat
      const lngChange =
        (distanceMoved * Math.sin(headingRad)) /
        (111320 * Math.cos((latest.lat * Math.PI) / 180));

      return {
        lat: latest.lat + latChange,
        lng: latest.lng + lngChange,
        accuracy: latest.accuracy * 1.5, // Increase uncertainty for prediction
        speed: latest.speed,
        heading: latest.heading,
        timestamp: now,
      };
    }

    return latest;
  }

  // Get interpolated position at a specific timestamp (for detection matching)
  getPositionAt(timestamp: number): GPSPoint | null {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) return this.buffer[0];

    // Find the two points that bracket this timestamp
    let before: GPSPoint | null = null;
    let after: GPSPoint | null = null;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (
        this.buffer[i].timestamp <= timestamp &&
        this.buffer[i + 1].timestamp >= timestamp
      ) {
        before = this.buffer[i];
        after = this.buffer[i + 1];
        break;
      }
    }

    // If timestamp is after all points, use velocity prediction
    if (!before && !after) {
      const latest = this.buffer[this.buffer.length - 1];
      if (timestamp > latest.timestamp) {
        return this.getCurrentPosition(timestamp);
      }
      return this.buffer[0]; // Before all points
    }

    if (!before || !after) return this.buffer[0];

    // Linear interpolation between two GPS points
    const totalTime = after.timestamp - before.timestamp;
    const ratio = (timestamp - before.timestamp) / totalTime;

    return {
      lat: before.lat + (after.lat - before.lat) * ratio,
      lng: before.lng + (after.lng - before.lng) * ratio,
      accuracy: Math.max(before.accuracy, after.accuracy),
      speed: before.speed !== null && after.speed !== null 
        ? before.speed + (after.speed - before.speed) * ratio 
        : before.speed,
      heading: before.heading !== null && after.heading !== null
        ? this.interpolateHeading(before.heading, after.heading, ratio)
        : before.heading,
      timestamp,
    };
  }

  // Interpolate heading accounting for circular nature (0-360)
  private interpolateHeading(h1: number, h2: number, ratio: number): number {
    let diff = h2 - h1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    let result = h1 + diff * ratio;
    if (result < 0) result += 360;
    if (result >= 360) result -= 360;
    return result;
  }

  getSpeed(): number {
    return this.lastPosition?.speed ?? 0;
  }

  getHeading(): number | null {
    return this.lastPosition?.heading ?? null;
  }

  getAccuracy(): number {
    return this.lastPosition?.accuracy ?? 50;
  }

  getBuffer(): GPSPoint[] {
    return [...this.buffer];
  }

  reset() {
    this.buffer = [];
    this.lastPosition = null;
    this.latFilter = new KalmanFilter();
    this.lngFilter = new KalmanFilter();
  }
}
