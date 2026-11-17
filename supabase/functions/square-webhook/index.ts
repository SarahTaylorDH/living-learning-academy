// Supabase Edge Function: square-webhook
// Square calls this when a payment, subscription or invoice changes.
// We check Square's signature, then hand the event to the database (public.square_event),
// which marks orders paid, sends the thank-you, and alerts staff about failed monthly charges.
// Secrets: SQUARE_WEBHOOK_SIGNATURE_KEY (from the webhook subscription in the Square Developer Console).
// Settings: "Verify JWT" OFF (Square can't send a Supabase key).

const NOTIFICATION_URL = 'https://xvohkszqihispaabdpya.supabase.co/functions/v1/square-webhook';

async function validSignature(body: string, signature: string | null) {
  const key = (Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') || '').trim();
  if (!key || !signature) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(NOTIFICATION_URL + body)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// Server key for the database: legacy service_role key, or the newer sb_secret key.
function serverKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try { return Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))[0] as string; } catch { return ''; }
}
function dbHeaders() {
  const key = serverKey();
  const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const body = await req.text();
  if (!(await validSignature(body, req.headers.get('x-square-hmacsha256-signature')))) {
    console.error('square-webhook: bad signature');
    return new Response('bad signature', { status: 403 });
  }
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/square_event`, {
    method: 'POST',
    headers: dbHeaders(),
    body: JSON.stringify({ p_event: JSON.parse(body) }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('square_event failed', text);
    return new Response('error', { status: 500 });  // Square will retry
  }
  return new Response(text, { status: 200 });
});
