// Recherche de prospects sur Google Maps.
// 1) Nouvelle API Places (New) : site + téléphone dès le 1er appel, jusqu'à 60 résultats (3 pages de 20).
//    Coût : 1 appel par page (SKU Text Search Enterprise : 1 000 gratuits / mois).
// 2) Repli sur l'ancienne API si la nouvelle n'est pas activée sur le compte Google (10 résultats max).
const MAX_PAGES = 3;
const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.websiteUri',
  'places.nationalPhoneNumber', 'places.rating', 'places.userRatingCount', 'nextPageToken',
].join(',');

async function searchNew(query, apiKey) {
  const results = [];
  let pageToken = '';
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = { textQuery: query, languageCode: 'fr', pageSize: 20 };
    if (pageToken) body.pageToken = pageToken;
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = new Error(data?.error?.message || 'Erreur API');
      err.status = data?.error?.status || '';
      err.http = resp.status;
      throw err;
    }
    for (const p of data.places || []) {
      results.push({
        id: p.id,
        nom: p.displayName?.text || '',
        adresse: p.formattedAddress || '',
        website: p.websiteUri || '',
        tel: p.nationalPhoneNumber || '',
        rating: p.rating || 0,
        reviews: p.userRatingCount || 0,
        hasWebsite: !!p.websiteUri,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return results;
}

async function searchLegacy(query, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=fr&key=${apiKey}`;
  const data = await (await fetch(url)).json();
  if (data.status === 'REQUEST_DENIED') {
    const err = new Error(data.error_message || 'Clé API invalide');
    err.invalidKey = true;
    throw err;
  }
  const results = [];
  for (const place of (data.results || []).slice(0, 10)) {
    const durl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,website,formatted_phone_number,rating,user_ratings_total&language=fr&key=${apiKey}`;
    const det = (await (await fetch(durl)).json()).result || {};
    results.push({
      id: place.place_id,
      nom: det.name || place.name,
      adresse: det.formatted_address || place.formatted_address || '',
      website: det.website || '',
      tel: det.formatted_phone_number || '',
      rating: det.rating || 0,
      reviews: det.user_ratings_total || 0,
      hasWebsite: !!det.website,
    });
  }
  return results;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const query = req.method === 'POST' ? req.body?.query : req.query?.query;
  const apiKey = req.method === 'POST' ? req.body?.apiKey : req.query?.apiKey;
  if (!query || !apiKey) {
    return res.status(400).json({ error: 'Paramètres manquants', query, apiKey: apiKey ? 'présente' : 'absente' });
  }

  try {
    try {
      const results = await searchNew(query, apiKey);
      return res.status(200).json({ results, total: results.length, api: 'new' });
    } catch (e) {
      // Nouvelle API pas activée (ou clé limitée à l'ancienne) → on se rabat sur l'ancienne
      if (e.http !== 403 && e.status !== 'PERMISSION_DENIED') throw e;
      const results = await searchLegacy(query, apiKey);
      return res.status(200).json({ results, total: results.length, api: 'legacy', warning: e.message });
    }
  } catch (e) {
    if (e.invalidKey || e.status === 'INVALID_ARGUMENT' && /api key/i.test(e.message)) {
      return res.status(403).json({ error: 'Clé API invalide', details: e.message });
    }
    return res.status(500).json({ error: e.message });
  }
}
