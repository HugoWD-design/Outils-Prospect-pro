export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { query, apiKey } = req.body || req.query;
  
  if (!query || !apiKey) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  try {
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=fr&key=${apiKey}`;
    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();

    if (searchData.status === 'REQUEST_DENIED') {
      return res.status(403).json({ error: 'Clé API invalide' });
    }

    const places = (searchData.results || []).slice(0, 10);
    const results = [];

    for (const place of places) {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,website,formatted_phone_number,rating,user_ratings_total&language=fr&key=${apiKey}`;
      const detailResp = await fetch(detailUrl);
      const detailData = await detailResp.json();
      const det = detailData.result || {};

      results.push({
        id: place.place_id,
        nom: det.name || place.name,
        adresse: det.formatted_address || '',
        website: det.website || '',
        tel: det.formatted_phone_number || '',
        rating: det.rating || 0,
        reviews: det.user_ratings_total || 0,
        hasWebsite: !!(det.website),
      });
    }

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
