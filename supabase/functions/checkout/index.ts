// Supabase Edge Function: checkout
// The register page sends the family's cart here. We save the order in the database
// (prices and the family discount are decided there, never by the browser), then:
//   card       -> build a Square checkout for the whole order and send the family to it
//               (monthly = Square subscription that stops by itself after the set number of payments)
//   e-Transfer -> return the amount and message to show (the database emails the instructions)
// Secrets: SQUARE_ACCESS_TOKEN. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Settings: "Verify JWT" OFF (the public website calls it).

const SQ = 'https://connect.squareup.com/v2';
const SITE = 'https://livinglearningacademy.com';
const SQ_VERSION = '2024-12-18';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
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

async function db(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: dbHeaders(),
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${fn}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const squareToken = () => (Deno.env.get('SQUARE_ACCESS_TOKEN') || '').trim();

async function sq(path: string, body?: unknown) {
  const res = await fetch(SQ + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${squareToken()}`,
      'Square-Version': SQ_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (res.status === 401) {
    // Diagnose without revealing the token: length, whitespace, and whether Square's test (sandbox) server accepts it.
    const raw = Deno.env.get('SQUARE_ACCESS_TOKEN') || '';
    const t = await fetch('https://connect.squareupsandbox.com/v2/locations', { headers: { Authorization: `Bearer ${squareToken()}`, 'Square-Version': SQ_VERSION } });
    console.error(`square token check: length ${raw.length}, trimmed ${raw.trim().length}, starts ${raw.trim().slice(0, 4)}, sandbox accepts: ${t.ok}`);
  }
  if (!res.ok) throw new Error(`square ${path}: ${JSON.stringify(json.errors || json)}`);
  return json;
}

let locationId = '';
async function location() {
  if (locationId) return locationId;
  const r = await sq('/locations');
  const loc = (r.locations || []).find((l: { status: string }) => l.status === 'ACTIVE') || r.locations[0];
  locationId = loc.id;
  return locationId;
}

const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);

// One Square subscription plan per monthly amount (e.g. $139 x 2), made once and remembered.
async function planVariation(amount: number, months: number) {
  const known = await db('square_plan_get', { p_amount: amount, p_months: months });
  if (known) return known as string;
  const r = await sq('/catalog/batch-upsert', {
    idempotency_key: crypto.randomUUID(),
    batches: [{
      objects: [
        { type: 'SUBSCRIPTION_PLAN', id: '#plan', subscription_plan_data: { name: `LLA courses: ${money(amount)} a month for ${months} months` } },
        {
          type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#variation',
          subscription_plan_variation_data: {
            name: `${money(amount)} a month for ${months} months`,
            subscription_plan_id: '#plan',
            phases: [{ cadence: 'MONTHLY', periods: months, ordinal: 0, pricing: { type: 'STATIC', price_money: { amount, currency: 'CAD' } } }],
          },
        },
      ],
    }],
  });
  const variation = (r.id_mappings || []).find((m: { client_object_id: string }) => m.client_object_id === '#variation')?.object_id;
  if (!variation) throw new Error('square plan: no variation id');
  await db('square_plan_save', { p_amount: amount, p_months: months, p_variation: variation });
  return variation as string;
}

type Item = { name: string; child: string; amount_cents: number; family_discount: boolean };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);

  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return reply({ error: 'invalid' }, 400); }
  if (p.website) return reply({ ok: true });  // spam bot filled the hidden field

  // Safety net (called every 10 minutes by the database): ask Square whether unpaid card orders were paid.
  if (p.action === 'sync') {
    const rows = (await db('orders_to_sync', {})) as { id: string; square_order_id: string }[];
    let paid = 0;
    for (const row of rows || []) {
      try {
        const o = (await sq(`/orders/${row.square_order_id}`)).order || {};
        const tenders = (o.tenders || []) as { id: string; payment_id?: string }[];
        const due = o.net_amount_due_money ? o.net_amount_due_money.amount : null;
        if (o.state === 'COMPLETED' || (tenders.length && due === 0)) {
          if (await db('order_paid_from_square', { p_order: row.id, p_payment_ids: tenders.map((t) => t.payment_id || t.id) })) paid++;
        }
      } catch (e) { console.error('sync', row.id, String(e)); }
    }
    return reply({ checked: (rows || []).length, paid });
  }

  // 1. Save the order (database checks everything and decides prices).
  let order: Record<string, any>;
  try {
    order = await db('create_order', { p });
  } catch (e) {
    const msg = String(e);
    const full = msg.match(/course_full:([a-z0-9-]+)/);
    if (full) return reply({ error: 'course_full', course_id: full[1] }, 409);
    console.error(msg);
    return reply({ error: 'invalid' }, 400);
  }
  if (order.method === 'etransfer') {
    return reply({ order_id: order.order_id, method: 'etransfer', total_cents: order.total_cents,
      etransfer_to: order.etransfer_to, etransfer_message: order.etransfer_message, items: order.items });
  }

  // 2. Card: build the Square checkout.
  const oid = order.order_id as string;
  const items = order.items as Item[];
  const kids = [...new Set(items.map((i) => i.child))];
  const title = items.length === 1 ? `${items[0].name}: ${items[0].child}` : `LLA courses for ${kids.join(', ')}`;
  const common = {
    idempotency_key: oid,
    payment_note: `LLA order ${oid}`,
    pre_populated_data: { buyer_email: order.email },
    checkout_options: {
      redirect_url: `${SITE}/register/?order=${oid}`,
      merchant_support_email: 'info@livinglearningacademy.com',
      ask_for_shipping_address: false,
      allow_tipping: false,
    } as Record<string, unknown>,
  };
  try {
    const loc = await location();
    let body: Record<string, unknown>;
    let variation: string | null = null;
    if (order.plan === 'monthly') {
      variation = await planVariation(order.monthly_cents, order.months);
      common.checkout_options.subscription_plan_id = variation;
      body = { ...common, quick_pay: { name: `${title} (${order.months} monthly payments)`, price_money: { amount: order.monthly_cents, currency: 'CAD' }, location_id: loc } };
    } else {
      body = {
        ...common,
        order: {
          location_id: loc,
          reference_id: oid,
          line_items: items.map((i) => ({
            name: `${i.name}: ${i.child}`.slice(0, 500),
            quantity: '1',
            base_price_money: { amount: i.amount_cents, currency: 'CAD' },
            note: i.family_discount ? '10% family discount included' : undefined,
          })),
        },
      };
    }
    const r = await sq('/online-checkout/payment-links', body);
    const link = r.payment_link;
    await db('order_set_checkout', { p_order: oid, p_link_id: link.id, p_square_order: link.order_id || null, p_url: link.url, p_variation: variation });
    return reply({ order_id: oid, method: 'card', checkout_url: link.url });
  } catch (e) {
    console.error(String(e));
    try { await db('order_abort', { p_order: oid }); } catch (_) { /* ignore */ }
    return reply({ error: 'checkout_unavailable' }, 502);
  }
});
