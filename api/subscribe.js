// Vercel serverless function — receives a lead from the static landing page
// and inserts it into the intranet's Supabase `contact_submissions` table
// using the service-role key. The key lives only in Vercel env vars, never in
// the browser. Founders read the lead from the intranet at /leads.
//
// Required env vars (set in the Vercel project):
//   SUPABASE_URL                 e.g. https://pfielfopdfrtfjqcudot.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    the intranet project's secret key

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};

  // Honeypot: bots fill hidden fields, humans don't. Pretend success, drop it.
  if (body.website) return res.status(200).json({ ok: true });

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const company = String(body.company || '').trim();
  const consent = body.pipaConsent === true || body.pipaConsent === 'true';

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || !company || !emailOk || !consent) {
    return res.status(400).json({ ok: false, error: 'Invalid submission' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[subscribe] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ ok: false, error: 'Server not configured' });
  }

  try {
    const resp = await fetch(url.replace(/\/$/, '') + '/rest/v1/contact_submissions', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ name, email, company, pipa_consent: true }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error('[subscribe] supabase insert failed:', resp.status, detail);
      return res.status(502).json({ ok: false, error: 'Submission failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[subscribe] error:', err);
    return res.status(500).json({ ok: false, error: 'Submission failed' });
  }
};
