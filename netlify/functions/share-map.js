// Netlify Function: Proxy Mapbox Static Images API
// Hides the MAPBOX_ACCESS_TOKEN from the client.

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  try {
    const token = context?.env?.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Server missing MAPBOX_ACCESS_TOKEN' }), { status: 500 });
    }

    // Expect JSON body: { points: [{lat, lon}], width, height, center?: {lat, lon, zoom}, style? }
    const body = await req.json();
    const points = Array.isArray(body?.points) ? body.points : [];
    const width = Math.min(Math.max(parseInt(body?.width || 1080, 10), 100), 1280);
    const height = Math.min(Math.max(parseInt(body?.height || 1920, 10), 100), 2048);
    const style = body?.style || 'mapbox/navigation-night-v1';

    // Helpers to build overlay strings similarly to the client code
    const pinUrl = encodeURIComponent(body?.pinUrl || 'https://potholes.live/icon-192.png');
    const pins = points
      .map((p) => `url-${pinUrl}(${Number(p.lon).toFixed(6)},${Number(p.lat).toFixed(6)})`)
      .join(',');

    function latToMercator(lat) {
      const clamped = Math.max(Math.min(lat, 85), -85);
      const rad = (clamped * Math.PI) / 180;
      return Math.log(Math.tan(Math.PI / 4 + rad / 2));
    }

    function calcBounds(pts) {
      if (!pts.length) return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
      let minLat = pts[0].lat, maxLat = pts[0].lat, minLon = pts[0].lon, maxLon = pts[0].lon;
      for (const p of pts) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
      }
      return { minLat, maxLat, minLon, maxLon };
    }

    function calcAdaptiveZoom(pts, mapWidth, mapHeight) {
      if (pts.length <= 1) return 16.5;
      const bounds = calcBounds(pts);
      const paddingFactor = 1.25;
      const tileSize = 512;
      const latFraction = Math.max((latToMercator(bounds.maxLat) - latToMercator(bounds.minLat)) / (2 * Math.PI), 0.00001) * paddingFactor;
      const lonFraction = Math.max(bounds.maxLon - bounds.minLon, 0.00001) / 360 * paddingFactor;
      const latZoom = Math.log2(mapHeight / tileSize / latFraction);
      const lonZoom = Math.log2(mapWidth / tileSize / lonFraction);
      let zoom = Math.min(latZoom, lonZoom);
      if (pts.length <= 3) zoom = Math.min(zoom + 0.8, 17);
      else if (pts.length >= 20) zoom = Math.max(zoom - 1.2, 9);
      else if (pts.length >= 10) zoom = Math.max(zoom - 0.6, 9.5);
      return Math.max(9, Math.min(17, zoom));
    }

    const mapWidth = width;
    const mapHeight = Math.floor(height * 0.55);
    let centerParam = '77.5946,12.9716,10';

    if (points.length > 0) {
      const b = calcBounds(points);
      const centerLat = (b.minLat + b.maxLat) / 2;
      const centerLon = (b.minLon + b.maxLon) / 2;
      const zoom = calcAdaptiveZoom(points, mapWidth, mapHeight);
      centerParam = `${centerLon.toFixed(6)},${centerLat.toFixed(6)},${zoom.toFixed(2)}`;
    } else if (body?.center && typeof body.center.lat === 'number' && typeof body.center.lon === 'number') {
      const z = typeof body.center.zoom === 'number' ? body.center.zoom : 10;
      centerParam = `${Number(body.center.lon).toFixed(6)},${Number(body.center.lat).toFixed(6)},${Number(z).toFixed(2)}`;
    }

    const pathOverlay = (points?.length > 1)
      ? `path-5+2196F3-0.8(${points.map(p => `${Number(p.lon).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(',')})`
      : '';

    let overlay = '';
    if (pathOverlay) overlay += pathOverlay + ',';
    if (pins) overlay += pins + ',';
    if (overlay.endsWith(',')) overlay = overlay.slice(0, -1);
    overlay = overlay ? `${overlay}/` : '';

    const url = `https://api.mapbox.com/styles/v1/${style}/static/${overlay}${centerParam}/${mapWidth}x${mapHeight}@2x?access_token=${encodeURIComponent(token)}&logo=false&attribution=false`;

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: 'Map fetch failed', status: res.status, body: text }), { status: 502 });
    }

    // Stream image back to client
    const headers = new Headers({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store'
    });
    return new Response(res.body, { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error', message: err?.message || String(err) }), { status: 500 });
  }
};
