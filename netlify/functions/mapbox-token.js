// Netlify Function: Return Mapbox token for map rendering
// This endpoint should be rate-limited and only used for map initialization
// The token returned here will have URL restrictions in Mapbox dashboard

export default async (req, context) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  try {
    const token = context?.env?.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Mapbox token not configured' }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Return token with proper CORS headers
    return new Response(
      JSON.stringify({ token }), 
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Server error', message: err?.message || String(err) }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
