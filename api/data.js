// Stockage synchronisé PC <-> téléphone (Upstash Redis via son API REST, sans dépendance npm).
// Protégé par un code d'accès : variable d'environnement ACCESS_CODE sur Vercel.
// Fusion par prospect : la version la plus récente (champ `u` = timestamp de modif) gagne.

const KEY = 'prospectpro:data';

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

async function redis(cmd) {
  const { url, token } = redisEnv();
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Redis HTTP ${r.status}`);
  return j.result;
}

function sameCode(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function merge(cur, inc) {
  const map = new Map();
  for (const p of cur?.prospects || []) map.set(p.id, p);
  for (const p of inc?.prospects || []) {
    const old = map.get(p.id);
    if (!old || (p.u || 0) > (old.u || 0)) map.set(p.id, p);
  }
  const blocked = [...new Set([...(cur?.blocked || []), ...(inc?.blocked || [])])];
  return { prospects: [...map.values()], blocked };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const expected = process.env.ACCESS_CODE;
  const { url, token } = redisEnv();
  if (!expected || !url || !token) {
    return res.status(500).json({ error: 'Serveur non configuré (ACCESS_CODE ou base Upstash manquant)' });
  }
  if (!sameCode(req.headers['x-access-code'], expected)) {
    return res.status(401).json({ error: "Code d'accès incorrect" });
  }

  try {
    const raw = await redis(['GET', KEY]);
    const cur = raw ? JSON.parse(raw) : { prospects: [], blocked: [] };

    if (req.method === 'GET') return res.status(200).json(cur);

    if (req.method === 'PUT') {
      const inc = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const merged = merge(cur, inc);
      await redis(['SET', KEY, JSON.stringify(merged)]);
      return res.status(200).json(merged);
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
