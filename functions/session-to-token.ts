import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'

export default async function handler(req: Request): Promise<Response> {
  const sessionId = new URL(req.url).searchParams.get('session_id')
  if (!sessionId) return Response.json({ error: 'missing' }, { status: 400 })

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })

  const { data, error } = await admin.database
    .from('orders')
    .select('amount, download_tokens(token, expires_at)')
    .eq('stripe_session_id', sessionId)
    .eq('stripe_payment_status', 'paid')
    .single()

  if (error || !data) return Response.json({ error: 'not_found' }, { status: 404 })

  const tokens = (data as any).download_tokens
  const token = Array.isArray(tokens) ? tokens[0] : tokens
  if (!token) return Response.json({ error: 'not_found' }, { status: 404 })

  if (new Date(token.expires_at) < new Date()) {
    return Response.json({ error: 'expired' }, { status: 410 })
  }

  // Return the real order amount so the thank-you page reports the true
  // Purchase value to Meta (instead of a hard-coded price).
  return Response.json({ token: token.token, amount: (data as any).amount ?? null })
}
