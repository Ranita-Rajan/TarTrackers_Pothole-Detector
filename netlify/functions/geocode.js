// Netlify Function: Proxy Mapbox Reverse Geocoding API
// Hides MAPBOX_ACCESS_TOKEN from the client.

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  try {
    const token = context?.env?.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) return new Response(JSON.stringify({ error: 'Server missing MAPBOX_ACCESS_TOKEN' }), { status: 500 });

    let lat, lon;
    if (req.method === 'GET') {
      const url = new URL(req.url);
      lat = parseFloat(url.searchParams.get('lat'));
      lon = parseFloat(url.searchParams.get('lon'));
    } else {
      const body = await req.json().catch(() => ({}));
      lat = parseFloat(body?.lat);
      lon = parseFloat(body?.lon);
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response(JSON.stringify({ error: 'lat and lon are required' }), { status: 400 });
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${encodeURIComponent(token)}&types=place,address&limit=1`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: 'Geocode failed', status: res.status, body: text }), { status: 502 });
    }

    const json = await res.json();
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error', message: err?.message || String(err) }), { status: 500 });
  }
};
