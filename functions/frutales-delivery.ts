import { createAdminClient } from 'https://esm.sh/@insforge/sdk@1.5.2'

const BASE = 'https://je8fwbkk.eu-central.insforge.app'
const ORIGIN = 'https://capnodis.com'
// Приемат се продуктите и в стария споделен акаунт, и в собствения акаунт на
// Capnodis (acct_1UNXo2FQ0Sq9LOrr), докато плащанията не бъдат превключени.
const LINKS = ['plink_1UM510FFeNuMzqHFAkeNP6JP','plink_1UNZlQFQ0Sq9LOrrYMNaxPfm']
const PRICES = ['price_1UM4wbFFeNuMzqHFBtF2N8vj','price_1UNZlPFQ0Sq9LOrraqnBJd8w']
const PRODUCTS = ['prod_VMoZnvvKGXU2Ur','prod_VOMUs5xiTg0Ln3']
const STRIPE_ACCOUNTS = [
  {account:'acct_1UNXo2FQ0Sq9LOrr',keyEnv:'STRIPE_CAPNODIS_SECRET_KEY',webhookEnv:'FRUTALES_STRIPE_WEBHOOK_SECRET_CAPNODIS'},
  {account:'acct_1QoAmvFFeNuMzqHF',keyEnv:'STRIPE_LIVE_SECRET_KEY',webhookEnv:'FRUTALES_STRIPE_WEBHOOK_SECRET'}
]
// Наредба Н-18, чл. 52о — активно само когато е зададен N18_SHOP_NUMBER.
const PRODUCT_NAME = 'Guía Práctica contra el Gusano Cabezudo en Frutales de Hueso + 3 bonos'
const N18_VAT_RATE = 20
const N18_TAX_GROUP = 'Б'
const BUCKET = 'frutales-files-spain'
const FILES = {
  'guia-principal.pdf': 'Guia-Practica-Frutales-de-Hueso.pdf',
  'bono1-calendario.pdf': 'Bono-1-Calendario-de-Vigilancia.pdf',
  'bono2-checklist.pdf': 'Bono-2-Checklist-de-Diagnostico.pdf',
  'bono3-decision.pdf': 'Bono-3-Arbol-de-Decision.pdf'
}
const enc = new TextEncoder()
const hex = bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2,'0')).join('')
async function hash(text) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(text))) }
async function hmac(key, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), {name:'HMAC',hash:'SHA-256'}, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(text)))
}
function equal(a,b) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i=0; i<a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}
function secret(name) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Missing server configuration: '+name)
  return value
}
function admin() { return createAdminClient({baseUrl:BASE,apiKey:secret('API_KEY')}) }
function headers() { return {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Expose-Headers':'Content-Disposition','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'} }
function json(data,status=200) { return Response.json(data,{status,headers:headers()}) }
async function tokenFor(sessionId) { return hmac(secret('FRUTALES_TOKEN_SECRET'), 'frutales:download:'+sessionId) }
function deliveryEmail(download,test=false,doc=null) {
  const safeUrl=download.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')
  const asset=ORIGIN+'/frutales/assets/'
  const bonuses=[['01','Calendario de vigilancia','Organiza tus observaciones en campo.','bonus-1-calendario-de-vigilancia-cover.jpg'],['02','Checklist de diagnóstico','Comprueba y registra las señales.','bonus-2-checklist-de-diagnostico-cover.jpg'],['03','Árbol de decisión','Ordena tus próximos pasos.','bonus-3-arbol-de-decision-cover.jpg']]
  const rows=bonuses.map(([number,title,description,cover])=>`<tr><td style="padding:16px 0;border-bottom:1px solid #e7eadf;width:58px;vertical-align:top"><img src="${asset}product-visuals/${cover}" width="44" alt="Portada del bono ${number}" style="display:block;width:44px;height:auto;border:0"></td><td style="padding:16px 0;border-bottom:1px solid #e7eadf;vertical-align:middle"><p style="margin:0 0 4px;font-size:10px;letter-spacing:1px;color:#697741">BONO ${number}</p><p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#1d3522">${title}</p><p style="margin:0;font-size:13px;line-height:1.5;color:#66705f">${description}</p></td></tr>`).join('')
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Tu biblioteca Capnodis</title>
<style>@media only screen and (max-width:620px){.outer-pad{padding:16px 10px!important}.email-pad{padding-left:22px!important;padding-right:22px!important}.email-title{font-size:32px!important}.cover-cell{display:block!important;width:100%!important;padding:0 0 20px!important}.cover-cell img{width:125px!important;margin:0 auto!important}.book-cell{display:block!important;width:100%!important;text-align:center!important}.email-cta{display:block!important;padding:17px 12px!important;font-size:15px!important}}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}</style></head>
<body style="margin:0;padding:0;background:#fbf7ed;color:#1d3522;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;color:#fbf7ed;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">Tu guía de 75 páginas y los 3 bonos están listos. Accede a tu biblioteca personal.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fbf7ed"><tr><td class="outer-pad" align="center" style="padding:36px 16px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border:1px solid #e4e7dc;border-radius:18px;overflow:hidden">
<tr><td class="email-pad" bgcolor="#1d3522" style="padding:30px 38px;background:#1d3522"><img src="${ORIGIN}/assets/logo-white.png" width="165" alt="Capnodis" style="display:block;width:165px;max-width:100%;height:auto;border:0;color:#fff;font-size:28px"><p style="margin:16px 0 0;color:#d9e2cd;font-size:11px;letter-spacing:1.5px">CONOCIMIENTO PRÁCTICO PARA EL CAMPO</p></td></tr>
<tr><td class="email-pad" style="padding:36px 38px 28px"><p style="margin:0 0 14px;font-size:11px;letter-spacing:1.5px;color:#697741">${test?'PRUEBA DE ENTREGA':'TU BIBLIOTECA ESTÁ LISTA'}</p><h1 class="email-title" style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.15;font-weight:normal;letter-spacing:-1px;color:#1d3522">De la lectura<br>a la práctica.</h1><p style="margin:0;font-size:15px;line-height:1.75;color:#66705f">${test?'Este es un correo de prueba de tu nueva biblioteca Capnodis.':'Gracias por confiar en Capnodis.'} Tu guía y las tres herramientas prácticas ya están disponibles en un único lugar.</p></td></tr>
<tr><td class="email-pad" style="padding:0 38px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f3e9" style="background:#f1f3e9;border-radius:12px"><tr><td style="padding:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="cover-cell" width="130" style="width:130px;padding-right:22px;vertical-align:middle"><img src="${asset}product-visuals/main-guide-front-cover.jpg" width="108" alt="Guía práctica contra el gusano cabezudo" style="display:block;width:108px;height:auto;border:0"></td><td class="book-cell" style="vertical-align:middle"><p style="margin:0 0 8px;font-size:10px;letter-spacing:1px;color:#697741">GUÍA PRINCIPAL · 75 PÁGINAS</p><h2 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:23px;line-height:1.25;color:#1d3522">Contra el gusano cabezudo<br>en frutales de hueso</h2><p style="margin:0;font-size:12px;line-height:1.6;color:#66705f">Diagnóstico, prevención y manejo integrado.</p></td></tr></table></td></tr></table></td></tr>
<tr><td class="email-pad" style="padding:0 38px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#cfb035" style="background:#cfb035;border-radius:9px;mso-padding-alt:18px 20px"><a class="email-cta" href="${safeUrl}" style="display:block;padding:18px 20px;font-size:16px;line-height:1.4;font-weight:bold;text-align:center;text-decoration:none;color:#1d3522;border:1px solid #cfb035;border-radius:9px">Descargar mi guía y los 3 bonos</a></td></tr></table><p style="margin:12px 0 0;text-align:center;font-size:11px;line-height:1.6;color:#66705f">4 archivos PDF · Acceso personal durante 30 días</p></td></tr>
<tr><td class="email-pad" style="padding:0 38px 30px"><h2 style="margin:0 0 8px;font-size:17px;color:#1d3522">También tienes tus tres bonos</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
${doc?`<tr><td class="email-pad" style="padding:0 38px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e7dc;border-radius:12px"><tr><td style="padding:16px 20px"><p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#1d3522">Documento de venta Nº ${doc.doc_number_text}</p><p style="margin:0;font-size:13px;line-height:1.6;color:#66705f">Документ за регистриране на продажба · <a href="${BASE}/functions/n18-document?t=${doc.view_token}" style="color:#1d3522;text-decoration:underline">Ver el documento</a></p></td></tr></table></td></tr>`:''}
<tr><td class="email-pad" bgcolor="#f5f6ef" style="padding:24px 38px;background:#f5f6ef"><p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#1d3522">Guárdalos hoy. Consúltalos en el campo.</p><p style="margin:0;font-size:13px;line-height:1.7;color:#66705f">Descarga los archivos en tu móvil u ordenador para usarlos sin conexión. Conserva este correo: el enlace es personal y válido durante 30 días.</p></td></tr>
<tr><td class="email-pad" style="padding:24px 38px"><p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#66705f">¿Necesitas ayuda? Responde a este correo y te ayudaremos con la descarga.</p><p style="margin:0;font-size:11px;line-height:1.7;color:#66705f">Si el botón no funciona, <a href="${safeUrl}" style="color:#1d3522;text-decoration:underline">abre tu biblioteca desde aquí</a>.</p>${test?'<p style="margin:16px 0 0;font-size:11px;color:#66705f">Este correo es una prueba; no corresponde a una compra.</p>':''}</td></tr>
</table><!--[if mso]></td></tr></table><![endif]--><p style="margin:22px 0 0;font-size:11px;line-height:1.6;color:#66705f">Capnodis · Frutales de hueso<br>Observa · Comprueba · Registra · Decide</p></td></tr></table></body></html>`
  return {from:'Capnodis <noreply@capnodis.com>',reply_to:'Infinitycreativeltd@gmail.com',subject:(test?'PRUEBA · ':'')+'Tu guía Capnodis para frutales de hueso + 3 bonos',html,text:(test?'Correo de prueba.\n\n':'Gracias por confiar en Capnodis.\n\n')+'Tu guía práctica de 75 páginas y los tres bonos están listos: calendario de vigilancia, checklist de diagnóstico y árbol de decisión.\n\nAbre tu biblioteca: '+download+'\n\nTu enlace es personal y válido durante 30 días. Guarda los PDF en tu dispositivo. Si necesitas ayuda, responde a este correo.'+(doc?'\n\nDocumento de venta Nº '+doc.doc_number_text+': '+BASE+'/functions/n18-document?t='+doc.view_token:'')}
}
async function sendDeliveryEmail(email,download,sessionId,test=false,doc=null) {
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+secret('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':'frutales-delivery/'+sessionId},body:JSON.stringify({...deliveryEmail(download,test,doc),to:[email]}),signal:AbortSignal.timeout(20000)})
  if (!response.ok) throw new Error('Email delivery failed: '+response.status)
  const result=await response.json()
  if (!result.id) throw new Error('Email provider confirmation missing')
  return result.id
}
async function stripe(path, key) {
  const response = await fetch('https://api.stripe.com/v1/'+path,{headers:{Authorization:'Bearer '+key}})
  if (!response.ok) throw new Error('Stripe verification failed: '+response.status)
  return response.json()
}
// Намира сесията в акаунта, в който е създадена, и запомня ключа за същия акаунт.
async function findSession(id) {
  for (const a of STRIPE_ACCOUNTS) {
    const key = Deno.env.get(a.keyEnv)
    if (!key) continue
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+key}})
    if (response.ok) { const session = await response.json(); session._account = a.account; session._key = key; return session }
  }
  throw new Error('Stripe verification failed: session not found')
}
function belongs(session) {
  return session.livemode === true && session.mode === 'payment' && LINKS.includes(session.payment_link)
    && ['paid','no_payment_required'].includes(session.payment_status) && session.currency === 'eur'
}
async function issueN18Document(db,session,email) {
  const shopNumber = Deno.env.get('N18_SHOP_NUMBER')
  if (!shopNumber || !session.amount_total) return null
  const piId = typeof session.payment_intent==='string' ? session.payment_intent : session.payment_intent?.id
  if (!piId) throw new Error('N18: payment_intent missing on paid session')
  const pi = await stripe('payment_intents/'+encodeURIComponent(piId)+'?expand[]=latest_charge',session._key)
  const details = pi.latest_charge?.payment_method_details
  const r = await db.database.rpc('n18_issue_document',{p_source:'frutales',p_e_shop_number:shopNumber,p_stripe_account:session._account,p_order_number:session.id,p_transaction_ref:piId,p_payment_method:details?.card?.wallet?.type||details?.type||'card',p_product_name:PRODUCT_NAME,p_quantity:1,p_currency:session.currency,p_subtotal_gross:(session.amount_subtotal??session.amount_total)/100,p_total_gross:session.amount_total/100,p_vat_rate:N18_VAT_RATE,p_tax_group:N18_TAX_GROUP,p_customer_email:email})
  if (r.error || !r.data) throw new Error('N18 document creation failed')
  return Array.isArray(r.data) ? r.data[0] : r.data
}
async function getOrder(db,sessionId) {
  const r = await db.database.from('frutales_orders').select('id,stripe_session_id,email_status,email_lease_until,email_attempts,customer_email').eq('stripe_session_id',sessionId).maybeSingle()
  if (r.error) throw new Error('Order lookup failed')
  return r.data
}
async function ensureToken(db,order,token) {
  const digest = await hash(token)
  let r = await db.database.from('frutales_download_tokens').select('token_hash,expires_at,revoked_at').eq('order_id',order.id).maybeSingle()
  if (r.error) throw new Error('Token lookup failed')
  if (!r.data) {
    const inserted = await db.database.from('frutales_download_tokens').insert([{order_id:order.id,token_hash:digest,expires_at:new Date(Date.now()+30*86400000).toISOString()}])
    if (inserted.error && inserted.error.code!=='23505') throw new Error('Token creation failed')
    r = await db.database.from('frutales_download_tokens').select('token_hash,expires_at,revoked_at').eq('order_id',order.id).single()
    if (r.error) throw new Error('Token confirmation failed')
  }
  return !r.data.revoked_at && new Date(r.data.expires_at).getTime()>Date.now() && equal(r.data.token_hash,digest)
}
async function fulfill(session) {
  if (!belongs(session)) return 'ignored'
  const lines = await stripe('checkout/sessions/'+encodeURIComponent(session.id)+'/line_items?limit=2',session._key)
  if (lines.has_more || lines.data.length!==1 || lines.data[0].quantity!==1 || !PRICES.includes(lines.data[0].price?.id) || !PRODUCTS.includes(lines.data[0].price?.product)) return 'ignored'
  const email = session.customer_details?.email || session.customer_email
  if (!email || email.length>254) throw new Error('Customer email missing')
  const db=admin()
  let order=await getOrder(db,session.id)
  if (!order) {
    const inserted=await db.database.from('frutales_orders').insert([{stripe_session_id:session.id,stripe_payment_link_id:session.payment_link,stripe_price_id:lines.data[0].price.id,stripe_payment_status:session.payment_status,livemode:true,amount_total:session.amount_total,currency:session.currency,customer_email:email,customer_name:session.customer_details?.name||null,visitor_id:typeof session.client_reference_id==='string'?session.client_reference_id.slice(0,200):null}])
    if (inserted.error && inserted.error.code!=='23505') throw new Error('Order creation failed')
    order=await getOrder(db,session.id)
  }
  if (!order) throw new Error('Order unavailable')
  const token=await tokenFor(session.id)
  if (!await ensureToken(db,order,token)) throw new Error('Access expired or revoked')
  if (order.email_status==='sent') return 'already_delivered'
  if (order.email_status==='sending' && new Date(order.email_lease_until).getTime()>Date.now()) throw new Error('Delivery in progress; retry required')
  const lease=new Date(Date.now()+5*60000).toISOString()
  let claim=db.database.from('frutales_orders').update({email_status:'sending',email_lease_until:lease,email_attempts:order.email_attempts+1}).eq('id',order.id).eq('email_status',order.email_status)
  claim=order.email_lease_until?claim.eq('email_lease_until',order.email_lease_until):claim.is('email_lease_until',null)
  const claimed=await claim.select('id')
  if (claimed.error || !claimed.data?.length) throw new Error('Delivery lease unavailable; retry required')
  const download=ORIGIN+'/frutales/descargas#token='+token
  try {
    const doc=await issueN18Document(db,session,email)
    await sendDeliveryEmail(email,download,session.id,false,doc)
    const saved=await db.database.from('frutales_orders').update({email_status:'sent',email_sent_at:new Date().toISOString(),email_lease_until:null}).eq('id',order.id).eq('email_lease_until',lease)
    if (saved.error) throw new Error('Email state persistence failed')
  } catch (error) {
    await db.database.from('frutales_orders').update({email_status:'failed',email_lease_until:null}).eq('id',order.id).eq('email_lease_until',lease)
    throw error
  }
  return 'delivered'
}
async function download(db,token,file) {
  if (!/^[0-9a-f]{64}$/.test(token||'') || !Object.hasOwn(FILES,file||'')) return json({error:'Acceso no válido'},403)
  const r=await db.database.from('frutales_download_tokens').select('expires_at,revoked_at').eq('token_hash',await hash(token)).maybeSingle()
  if (r.error) throw new Error('Access verification failed')
  if (!r.data || r.data.revoked_at) return json({error:'Acceso no válido'},403)
  if (new Date(r.data.expires_at).getTime()<=Date.now()) return json({error:'Enlace caducado'},410)
  const stored=await db.storage.from(BUCKET).download(file)
  if (stored.error || !stored.data) throw new Error('Protected file unavailable')
  const pdf=new Blob([stored.data],{type:'application/pdf'})
  if (file==='guia-principal.pdf' && (pdf.size!==3466579 || hex(await crypto.subtle.digest('SHA-256',await pdf.arrayBuffer()))!=='bf64f39c28e00b068b2866a4f303039c066a3f3afd033c99f26b00b741fa5064')) throw new Error('Book integrity verification failed')
  return new Response(pdf,{headers:{...headers(),'Content-Type':'application/pdf','Content-Length':String(pdf.size),'Content-Disposition':'attachment; filename="'+FILES[file]+'"'}})
}
export default async function handler(req) {
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:headers()})
  const url=new URL(req.url), action=url.searchParams.get('action')
  try {
    if (action==='webhook' && req.method==='POST') {
      if (Number(req.headers.get('content-length')||0)>1000000) return json({error:'Payload too large'},413)
      const raw=await req.text()
      if (raw.length>1000000) return json({error:'Payload too large'},413)
      // Без проверка на подписа (одобрено от собственика, 06.10.2026): InsForge gateway-ят
      // компактира JSON тялото, а Stripe подписва оригиналния текст, така че подписът
      // никога не съвпада. Събитието се проверява, като сесията се изтегля директно от
      // Stripe с нашия ключ (findSession) и се сверява с LINKS/PRICES/PRODUCTS —
      // както в stripe-order-handler.
      const event=JSON.parse(raw)
      if (!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) return json({received:true,ignored:true})
      const id=event.data?.object?.id
      if (!/^cs_live_[A-Za-z0-9]+$/.test(id||'')) return json({received:true,ignored:true})
      const session=await findSession(id)
      return json({received:true,result:await fulfill(session)})
    }
    if (action==='session' && req.method==='POST') {
      if (req.headers.get('origin') && req.headers.get('origin')!==ORIGIN) return json({error:'Origen no válido'},403)
      const {session_id:id}=await req.json()
      if (!/^cs_live_[A-Za-z0-9]{20,200}$/.test(id||'')) return json({error:'Sesión no válida'},400)
      const session=await findSession(id)
      if (!belongs(session)) return json({error:'Pago no válido para este producto'},403)
      const db=admin(), order=await getOrder(db,id)
      if (!order) return json({pending:true},202)
      const token=await tokenFor(id)
      const r=await db.database.from('frutales_download_tokens').select('expires_at,revoked_at').eq('token_hash',await hash(token)).eq('order_id',order.id).maybeSingle()
      if (r.error) throw new Error('Access lookup failed')
      if (!r.data) return json({pending:true},202)
      if (r.data.revoked_at || new Date(r.data.expires_at).getTime()<=Date.now()) return json({error:'Enlace caducado'},410)
      return json({token})
    }
    if (action==='download' && req.method==='POST') {
      const {token,file}=await req.json()
      return download(admin(),token,file)
    }
    return json({error:'Ruta no válida'},404)
  } catch(error) {
    console.error('Frutales operation failed',action,error instanceof Error?error.message:'unknown')
    return json({error:'No se pudo completar la operación. Inténtalo de nuevo.'},500)
  }
}

