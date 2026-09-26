export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const query = req.method === 'POST' ? req.body?.query : req.query?.query;
  const apiKey = req.method === 'POST' ? req.body?.apiKey : req.query?.apiKey;

  if (!query || !apiKey) {
    return res.status(400).json({ error: 'Paramètres manquants', query, apiKey: apiKey ? 'présente' : 'absente' });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=fr&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status === 'REQUEST_DENIED') {
      return res.status(403).json({ error: 'Clé API invalide', details: data.error_message });
    }

    const places = (data.results || []).slice(0, 10);
    const results = [];

    for (const place of places) {
      const durl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,website,formatted_phone_number,rating,user_ratings_total&language=fr&key=${apiKey}`;
      const dr = await fetch(durl);
      const dd = await dr.json();
      const det = dd.result || {};

      results.push({
        id: place.place_id,
        nom: det.name || place.name,
        adresse: det.formatted_address || place.formatted_address || '',
        website: det.website || '',
        tel: det.formatted_phone_number || '',
        rating: det.rating || 0,
        reviews: det.user_ratings_total || 0,
        hasWebsite: !!(det.website),
      });
    }

    return res.status(200).json({ results, total: results.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
