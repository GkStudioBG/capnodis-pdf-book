import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'

const STRIPE_API = 'https://api.stripe.com/v1'

// Capnodis sells through ONE Stripe Payment Link, but the Stripe account is
// SHARED (invoices + other products fire this same webhook). Only accept
// sessions that originated from the capnodis payment link; reject everything
// else so foreign payments never become capnodis orders / download emails.
const CAPNODIS_PAYMENT_LINKS = [
  'plink_1TclzCFFeNuMzqHFDiHv42sM', // стар акаунт INFINITY CREATIVE LTD
  'plink_1UNZlPFQ0Sq9LOrr6yQzVhKw', // акаунт Capnodis
]

// Capnodis има собствен Stripe акаунт (acct_1UNXo2FQ0Sq9LOrr) от 06.10.2026.
// Сесиите се търсят първо в него, после в стария споделен акаунт, докато
// плащанията не бъдат превключени изцяло.
const STRIPE_ACCOUNTS = [
  { account: 'acct_1UNXo2FQ0Sq9LOrr', keyEnv: 'STRIPE_CAPNODIS_SECRET_KEY' },
  { account: 'acct_1QoAmvFFeNuMzqHF', keyEnv: 'STRIPE_LIVE_SECRET_KEY' },
]

// Наредба Н-18, чл. 52о. Документите се издават само когато е зададен
// N18_SHOP_NUMBER (уникалният номер на електронния магазин от НАП).
const PRODUCT_NAME = 'Guía Práctica contra el Gusano Cabezudo en Almendro (+3 Bonos)'
const N18_VAT_RATE = 20
const N18_TAX_GROUP = 'Б'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let event: any
  try {
    event = JSON.parse(await req.text())
  } catch {
    return new Response('Invalid payload', { status: 400 })
  }

  if (event?.type !== 'checkout.session.completed') {
    return Response.json({ received: true })
  }

  const sessionId = event?.data?.object?.id
  if (!sessionId || typeof sessionId !== 'string') {
    return new Response('Missing session id', { status: 400 })
  }

  // Authoritative verification: re-fetch the session straight from Stripe.
  // This proves the event is genuine without depending on the webhook signing
  // secret (which proved fragile to misconfigure), and gives us trusted
  // payment + customer data to build the order from.
  const found = await fetchSession(sessionId)
  if (!found) {
    return new Response('Could not verify session', { status: 400 })
  }
  const { session, stripe } = found

  if (!session.livemode) {
    return Response.json({ received: true, ignored: 'test mode' })
  }
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return Response.json({ received: true, ignored: `payment_status=${session.payment_status}` })
  }

  // Shared-account guard: ignore sessions from any other payment link / product
  // (invoices, other Infinity Creative products) so they never pollute capnodis.
  if (!CAPNODIS_PAYMENT_LINKS.includes(session.payment_link)) {
    return Response.json({ received: true, ignored: `foreign payment_link=${session.payment_link}` })
  }

  try {
    await processOrder(session, stripe)
  } catch (err) {
    console.error('Order processing failed:', err)
    return new Response('Processing error', { status: 500 })
  }

  return Response.json({ received: true })
}

type StripeAccount = { account: string, key: string }

async function fetchSession(sessionId: string): Promise<{ session: any, stripe: StripeAccount } | null> {
  for (const { account, keyEnv } of STRIPE_ACCOUNTS) {
    const key = Deno.env.get(keyEnv)
    if (!key) continue
    const resp = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (resp.ok) return { session: await resp.json(), stripe: { account, key } }
    console.warn('Stripe session fetch failed:', account, resp.status)
  }
  return null
}

async function processOrder(session: any, stripe: StripeAccount) {
  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })

  const email = session.customer_details?.email ?? session.customer_email ?? ''
  const name = session.customer_details?.name ?? ''
  const phone = session.customer_details?.phone ?? ''
  const country = session.customer_details?.address?.country ?? ''

  if (!email) throw new Error('No customer email on session')

  // Idempotency: skip if order already exists for this session
  const { data: existing } = await admin.database
    .from('orders')
    .select('id')
    .eq('stripe_session_id', session.id)
    .maybeSingle()

  if (existing) return

  // Н-18 документът се издава преди поръчката: n18_issue_document е идемпотентна,
  // така че ако нещо по-нататък се провали, повторният опит на Stripe връща същия
  // документ и доставката продължава.
  const doc = await issueN18Document(admin, session, stripe, email)

  // Attribution join: the landing page round-trips its visitor_id through
  // Stripe's client_reference_id. Snapshot the latest non-bot visit for that
  // visitor onto the order so we can report source -> sale.
  const attribution = await lookupAttribution(admin, session.client_reference_id)

  const { data: order, error: orderErr } = await admin.database
    .from('orders')
    .insert([{
      customer_email: email,
      customer_name: name,
      customer_phone: phone,
      billing_country: country,
      stripe_session_id: session.id,
      stripe_payment_status: 'paid',
      amount: (session.amount_total ?? 1990) / 100,
      visitor_id:   attribution.visitor_id,
      utm_source:   attribution.utm_source,
      utm_medium:   attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content:  attribution.utm_content,
      utm_term:     attribution.utm_term,
      fbclid:       attribution.fbclid,
      referrer:     attribution.referrer,
      landing_time: attribution.landing_time,
    }])
    .select()
    .single()

  if (orderErr || !order) throw new Error(`Order insert: ${orderErr?.message}`)

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { error: tokenErr } = await admin.database
    .from('download_tokens')
    .insert([{
      order_id: order.id,
      token,
      expires_at: expiresAt.toISOString(),
    }])

  if (tokenErr) throw new Error(`Token insert: ${tokenErr.message}`)

  const downloadUrl = `https://je8fwbkk.eu-central.insforge.app/functions/verify-download?token=${token}`
  await sendEmail(email, name, downloadUrl, doc)
}

type N18Doc = { doc_number_text: string, view_token: string }

async function issueN18Document(admin: any, session: any, stripe: StripeAccount, email: string): Promise<N18Doc | null> {
  const shopNumber = Deno.env.get('N18_SHOP_NUMBER')
  if (!shopNumber) return null
  // Без плащане с карта (напр. 100% промокод) няма продажба за регистриране.
  if (!session.amount_total) return null

  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!piId) throw new Error('N18: payment_intent missing on paid session')
  const piResp = await fetch(`${STRIPE_API}/payment_intents/${encodeURIComponent(piId)}?expand[]=latest_charge`, {
    headers: { Authorization: `Bearer ${stripe.key}` },
  })
  if (!piResp.ok) throw new Error(`N18: payment_intent fetch ${piResp.status}`)
  const details = (await piResp.json()).latest_charge?.payment_method_details
  const method = details?.card?.wallet?.type ?? details?.type ?? 'card'

  const { data, error } = await admin.database.rpc('n18_issue_document', {
    p_source: 'almendro',
    p_e_shop_number: shopNumber,
    p_stripe_account: stripe.account,
    p_order_number: session.id,
    p_transaction_ref: piId,
    p_payment_method: method,
    p_product_name: PRODUCT_NAME,
    p_quantity: 1,
    p_currency: session.currency,
    p_subtotal_gross: (session.amount_subtotal ?? session.amount_total) / 100,
    p_total_gross: session.amount_total / 100,
    p_vat_rate: N18_VAT_RATE,
    p_tax_group: N18_TAX_GROUP,
    p_customer_email: email,
  })
  if (error || !data) throw new Error(`N18 document: ${error?.message ?? 'no data'}`)
  return Array.isArray(data) ? data[0] : data
}

type Attribution = {
  visitor_id: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  fbclid: string | null
  referrer: string | null
  landing_time: string | null
}

const EMPTY_ATTRIBUTION: Attribution = {
  visitor_id: null, utm_source: null, utm_medium: null, utm_campaign: null,
  utm_content: null, utm_term: null, fbclid: null, referrer: null, landing_time: null,
}

async function lookupAttribution(admin: any, visitorId: unknown): Promise<Attribution> {
  if (!visitorId || typeof visitorId !== 'string') return EMPTY_ATTRIBUTION

  const { data, error } = await admin.database
    .from('visits')
    .select('utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, referrer, created_at')
    .eq('visitor_id', visitorId)
    .eq('is_bot', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    // No visit row (e.g. tracking blocked) — keep the visitor_id, null the rest.
    console.warn('No visit found for visitor_id', visitorId, error?.message ?? '')
    return { ...EMPTY_ATTRIBUTION, visitor_id: visitorId }
  }

  return {
    visitor_id:   visitorId,
    utm_source:   data.utm_source   ?? null,
    utm_medium:   data.utm_medium   ?? null,
    utm_campaign: data.utm_campaign ?? null,
    utm_content:  data.utm_content  ?? null,
    utm_term:     data.utm_term     ?? null,
    fbclid:       data.fbclid       ?? null,
    referrer:     data.referrer     ?? null,
    landing_time: data.created_at   ?? null,
  }
}

async function sendEmail(to: string, name: string, downloadUrl: string, doc: N18Doc | null) {
  const firstName = name.split(' ')[0] || 'estimado agricultor'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Capnodis <noreply@capnodis.com>',
      to: [to],
      subject: 'Tu guía PDF contra el gusano cabezudo está lista',
      html: emailHtml(firstName, downloadUrl, doc),
    }),
  })

  if (!res.ok) throw new Error(`Resend: ${await res.text()}`)
}

function emailHtml(firstName: string, url: string, doc: N18Doc | null): string {
  const docBlock = doc ? `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;border:1px solid #e8e0d0;border-radius:12px;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#172116;">Documento de venta Nº ${doc.doc_number_text}</p>
          <p style="margin:0;font-size:13px;color:#3a4a35;line-height:1.6;">Документ за регистриране на продажба · <a href="https://je8fwbkk.eu-central.insforge.app/functions/n18-document?t=${doc.view_token}" style="color:#1d3522;">Ver el documento</a></p>
        </td></tr>
      </table>` : ''
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fbf7ed;font-family:Arial,sans-serif;color:#172116;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fbf7ed;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(30,44,24,.10);">
  <tr>
    <td style="background:#1d3522;padding:32px 40px;text-align:center;">
      <img src="https://capnodis.com/assets/logo-white.png" alt="Capnodis" style="height:52px;width:auto;display:block;margin:0 auto;">
      <p style="color:#b8c9b0;margin:10px 0 0;font-size:14px;">Guía Práctica contra el Gusano Cabezudo</p>
    </td>
  </tr>
  <tr>
    <td style="padding:40px 40px 32px;">
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;line-height:1.3;">¡Tu guía está lista, ${firstName}!</h1>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3a4a35;">Gracias por tu compra. Ya puedes descargar la <strong>Guía Práctica contra el Gusano Cabezudo en Almendro</strong> y los 3 bonus imprimibles.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0;">
        <tr><td align="center">
          <a href="${url}" style="display:inline-block;background:#1d3522;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 40px;border-radius:12px;">Descargar la guía y los bonus</a>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#f1e8d8;border-radius:12px;">
        <tr><td style="padding:20px 24px;">
          <p style="margin:0 0 10px;font-weight:700;font-size:13px;color:#172116;text-transform:uppercase;letter-spacing:.06em;">Incluye:</p>
          <p style="margin:0 0 6px;font-size:14px;color:#3a4a35;">✓ Guía principal PDF — diagnóstico, ciclo y manejo integrado</p>
          <p style="margin:0 0 6px;font-size:14px;color:#3a4a35;">✓ Bono 1: Calendario mensual de manejo integrado</p>
          <p style="margin:0 0 6px;font-size:14px;color:#3a4a35;">✓ Bono 2: Checklist de diagnóstico en campo</p>
          <p style="margin:0;font-size:14px;color:#3a4a35;">✓ Bono 3: Árbol de decisión según nivel de daño</p>
        </td></tr>
      </table>
      ${docBlock}
      <p style="margin:24px 0 0;font-size:13px;color:#636b5e;line-height:1.6;">Este enlace es personal y válido durante <strong>30 días</strong>. Si tienes algún problema, responde a este email.</p>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 40px;border-top:1px solid #e8e0d0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9aa394;">Capnodis · © Infinity Creative LTD · EIK: BG208149507</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
