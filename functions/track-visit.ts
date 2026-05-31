import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  let body: any = {}
  try { body = await req.json() } catch (_) {}

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })

  await admin.database.from('visits').insert([{
    page:         body.page         ?? '/',
    utm_source:   body.utm_source   ?? null,
    utm_medium:   body.utm_medium   ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_content:  body.utm_content  ?? null,
    utm_term:     body.utm_term     ?? null,
    fbclid:       body.fbclid       ?? null,
    referrer:     body.referrer     ?? null,
    user_agent:   req.headers.get('user-agent') ?? null,
  }])

  return new Response('ok', { status: 200, headers: cors })
}
