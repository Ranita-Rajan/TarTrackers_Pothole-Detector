// Simplified share module for generating share images and text
type Point = { lat: number; lon: number };
/**
 * Reverse geocode a lat/lon to get a location name
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const response = await fetch(
      "https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lon + "&zoom=14"
    );
    if (!response.ok) {
      console.warn("[Share] Reverse geocode failed:", response.status);
      return "Unknown Location";
    }
    const data = await response.json();
    // Build location string from available components
    const parts = [];
    if (data.address?.city) parts.push(data.address.city);
    else if (data.address?.town) parts.push(data.address.town);
    else if (data.address?.village) parts.push(data.address.village);
    if (data.address?.state) parts.push(data.address.state);
    else if (data.address?.country) parts.push(data.address.country);
    return parts.length > 0 ? parts.join(", ") : "Unknown Location";
  } catch (error) {
    console.error("[Share] Reverse geocode error:", error);
    return "Unknown Location";
  }
}
/**
 * Generate Google Maps URL for a location
 */
export function generateMapUrl(lat: number, lon: number): string {
  return "https://www.google.com/maps?q=" + lat + "," + lon;
}
/**
 * Generate share text for a detection session
 */
export function generateShareText(
  potholeCount: number,
  durationSeconds: number,
  distanceKm: number | null,
  locationLabel?: string
): string {
  const duration = Math.round(durationSeconds / 60);
  let text = "Just mapped " + potholeCount + " " + (potholeCount === 1 ? "pothole" : "potholes") + " on our roads!\n\n";
  if (locationLabel && locationLabel !== "Unknown Location") {
    text += "📍 " + locationLabel + "\n";
  }
  text += "⏱️ " + duration + " " + (duration === 1 ? "minute" : "minutes");
  if (distanceKm !== null && distanceKm > 0) {
    text += " • 🚗 " + distanceKm.toFixed(1) + " km";
  }
  text += "\n\nSee the full map here: https://Tar.Trackers\n\n";
  return text;
}
/**
 * Generate a simple share image with just text (no map background)
 */
export async function generateSessionShareImage(
  potholeCount: number,
  durationSeconds: number,
  distanceKm: number | null,
  points: Point[],
  locationLabel?: string
): Promise<Blob> {
  const width = 1200;
  const height = 1200;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  // Dark gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#1e293b");
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  // Title
  ctx.textAlign = "center";
  ctx.font = "700 72px system-ui";
  ctx.fillStyle = "#ef4444";
  ctx.fillText("POTHOLES MAPPED", width / 2, 180);
  // Big number
  ctx.font = "900 280px system-ui";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(potholeCount.toString(), width / 2, 500);
  // Pothole/potholes label
  ctx.font = "600 52px system-ui";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(potholeCount === 1 ? "pothole" : "potholes", width / 2, 600);
  // Stats
  const duration = Math.round(durationSeconds / 60);
  let statsText = duration + " " + (duration === 1 ? "minute" : "minutes");
  if (distanceKm !== null && distanceKm > 0) {
    statsText += " • " + distanceKm.toFixed(1) + " km";
  }
  ctx.font = "500 42px system-ui";
  ctx.fillStyle = "#64748b";
  ctx.fillText(statsText, width / 2, 680);
  // Location (if available)
  if (locationLabel && locationLabel !== "Unknown Location") {
    ctx.font = "500 38px system-ui";
    ctx.fillStyle = "#64748b";
    ctx.fillText("📍 " + locationLabel, width / 2, 750);
  }
  // Footer
  ctx.font = "600 48px system-ui";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Help fix our roads!", width / 2, height - 140);
  ctx.font = "500 38px system-ui";
  ctx.fillStyle = "#64748b";
  ctx.fillText("potholes.live", width / 2, height - 80);
  return await canvas.convertToBlob({ type: "image/png", quality: 0.95 });
}
