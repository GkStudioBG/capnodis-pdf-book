import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const BOT_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /scrape/i, /headless/i, /phantom/i,
  /lighthouse/i, /preview/i, /facebookexternalhit/i, /twitterbot/i,
  /linkedinbot/i, /whatsapp/i, /telegrambot/i, /slackbot/i, /discord/i,
  /pingdom/i, /uptimerobot/i, /gtmetrix/i, /pagespeed/i, /bingbot/i, /googlebot/i,
  /python-requests/i, /curl\//i, /wget/i, /node-fetch/i, /axios/i,
]

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true
  return BOT_PATTERNS.some((p) => p.test(userAgent))
}

// Only these events are persisted — keeps the table lean. PageView/ViewContent
// are intentionally excluded (already covered by `visits` + Pixel).
const ALLOWED_EVENTS = new Set([
  'checkout_click', 'InitiateCheckout',
  'hero_buy_click', 'hero_content_click', 'sticky_buy', 'final_cta',
  'faq_open',
  'scroll_50', 'scroll_75', 'scroll_90',
])

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  let body: any = {}
  try { body = await req.json() } catch (_) {}

  const eventName = typeof body.event_name === 'string' ? body.event_name : ''
  if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
    // Silently accept-and-drop unknown events so the client never errors.
    return new Response('ok', { status: 200, headers: cors })
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })

  const userAgent = req.headers.get('user-agent') ?? null

  await admin.database.from('events').insert([{
    event_name: eventName,
    event_id:   body.event_id   ?? null,
    visitor_id: body.visitor_id ?? null,
    session_id: body.session_id ?? null,
    page:       body.page       ?? null,
    payload:    body.payload    ?? null,
    user_agent: userAgent,
    is_bot:     isBot(userAgent),
  }])

  return new Response('ok', { status: 200, headers: cors })
}
