import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response('Missing stripe-signature', { status: 400 })
  }

  let event: any
  try {
    event = await verifyAndParse(body, signature, Deno.env.get('STRIPE_LIVE_WEBHOOK_SECRET')!)
  } catch (err) {
    console.error('Webhook signature failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    if (session.payment_status === 'paid') {
      try {
        await processOrder(session)
      } catch (err) {
        console.error('Order processing failed:', err)
        return new Response('Processing error', { status: 500 })
      }
    }
  }

  return Response.json({ received: true })
}

async function processOrder(session: any) {
  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })

  const email = session.customer_details?.email ?? session.customer_email ?? ''
  const name = session.customer_details?.name ?? ''
  const phone = session.customer_details?.phone ?? ''
  const country = session.customer_details?.address?.country ?? ''

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
  await sendEmail(email, name, downloadUrl)
}

async function sendEmail(to: string, name: string, downloadUrl: string) {
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
      html: emailHtml(firstName, downloadUrl),
    }),
  })

  if (!res.ok) throw new Error(`Resend: ${await res.text()}`)
}

function emailHtml(firstName: string, url: string): string {
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

async function verifyAndParse(payload: string, signature: string, secret: string): Promise<any> {
  const parts = signature.split(',')
  const ts = parts.find(p => p.startsWith('t='))?.slice(2)
  const v1 = parts.find(p => p.startsWith('v1='))?.slice(3)
  if (!ts || !v1) throw new Error('Malformed signature')

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`))
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  if (computed !== v1) throw new Error('Signature mismatch')
  return JSON.parse(payload)
}
