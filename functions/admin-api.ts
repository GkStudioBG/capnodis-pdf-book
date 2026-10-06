import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'

// Admin панел за capnodis.com: статистика по продукти + месечен XML по Наредба Н-18.
// Достъп: заглавки x-admin-user / x-admin-password срещу секретите ADMIN_USERNAME / ADMIN_PANEL_PASSWORD
// (ADMIN_PASSWORD е reserved в InsForge и не може да се променя).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-user, x-admin-password',
  'Access-Control-Expose-Headers': 'Content-Disposition',
  'Cache-Control': 'no-store',
}

const TZ = 'Europe/Sofia'
const PRODUCTS = {
  almendro: 'гусано кабесудо в бадем',
  frutales: 'гусано кабесудо в костилкови',
} as const
type ProductKey = keyof typeof PRODUCTS

const SHOP = { eik: '208149507', domain: 'capnodis.com', type: '1', paym: '4' }

const round2 = (n: number) => Math.round(n * 100) / 100
const sofiaDay = (iso: string | Date) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: cors })
}

async function sameText(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(ha), y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

async function authorized(req: Request): Promise<boolean> {
  const expectedUser = Deno.env.get('ADMIN_USERNAME') ?? ''
  const expectedPass = Deno.env.get('ADMIN_PANEL_PASSWORD') ?? ''
  if (!expectedUser || !expectedPass) return false
  const user = req.headers.get('x-admin-user') ?? ''
  const pass = req.headers.get('x-admin-password') ?? ''
  const userOk = await sameText(user, expectedUser)
  const passOk = await sameText(pass, expectedPass)
  return userOk && passOk
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  if (!(await authorized(req))) {
    await new Promise((r) => setTimeout(r, 600))
    return json({ error: 'Unauthorized' }, 401)
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })

  const url = new URL(req.url)
  const section = url.searchParams.get('section') ?? 'dashboard'

  try {
    if (section === 'dashboard') return json(await dashboard(admin))
    if (section === 'n18_xml') return await n18Xml(admin, url.searchParams.get('month') ?? '')
  } catch (err) {
    console.error('admin-api failed', section, err instanceof Error ? err.message : err)
    return json({ error: 'Server error' }, 500)
  }
  return json({ error: 'Unknown section' }, 400)
}

// ─────────────────────────────── Dashboard ───────────────────────────────

type Sale = {
  product: ProductKey
  amount: number
  created_at: string
  email: string
  name: string
  country: string
  utm_source: string | null
  utm_content: string | null
  visitor_id: string | null
}

async function dashboard(admin: any) {
  const now = new Date()
  const since30 = new Date(now.getTime() - 30 * 86400000).toISOString()

  const [almRes, fruRes, visitsRes, eventsRes, docsRes] = await Promise.all([
    admin.database.from('orders')
      .select('amount, created_at, customer_email, customer_name, billing_country, utm_source, utm_content, visitor_id'),
    admin.database.from('frutales_orders')
      .select('amount_total, currency, livemode, created_at, customer_email, customer_name, utm_source, utm_content, visitor_id'),
    admin.database.from('visits').select('page, utm_source, created_at, visitor_id, is_bot').gte('created_at', since30),
    admin.database.from('events').select('event_name, page, visitor_id, is_bot').gte('created_at', since30),
    admin.database.from('n18_documents')
      .select('doc_number_text, issued_at, source, total_gross, vat_amount, view_token')
      .order('doc_number', { ascending: false }),
  ])

  const sales: Sale[] = [
    ...(almRes.data ?? []).map((o: any) => ({
      product: 'almendro' as const, amount: Number(o.amount ?? 0), created_at: o.created_at,
      email: o.customer_email ?? '', name: o.customer_name ?? '', country: o.billing_country ?? '',
      utm_source: o.utm_source, utm_content: o.utm_content, visitor_id: o.visitor_id,
    })),
    ...(fruRes.data ?? []).filter((o: any) => o.livemode !== false).map((o: any) => ({
      product: 'frutales' as const, amount: Number(o.amount_total ?? 0) / 100, created_at: o.created_at,
      email: o.customer_email ?? '', name: o.customer_name ?? '', country: '',
      utm_source: o.utm_source, utm_content: o.utm_content, visitor_id: o.visitor_id,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at))

  const todayKey = sofiaDay(now)
  const inDays = (s: Sale, days: number) => now.getTime() - new Date(s.created_at).getTime() < days * 86400000
  const summarize = (list: Sale[]) => ({
    orders: list.length,
    paid: list.filter((s) => s.amount > 0).length,
    revenue: round2(list.reduce((sum, s) => sum + s.amount, 0)),
  })
  const periods = (list: Sale[]) => ({
    today: summarize(list.filter((s) => sofiaDay(s.created_at) === todayKey)),
    week: summarize(list.filter((s) => inDays(s, 7))),
    month: summarize(list.filter((s) => inDays(s, 30))),
    all: summarize(list),
  })

  // Дневна серия за последните 30 дни (българско време), по продукт
  const days: string[] = []
  for (let i = 29; i >= 0; i--) days.push(sofiaDay(new Date(now.getTime() - i * 86400000)))
  const daily = days.map((day) => {
    const row: Record<string, number | string> = { day, almendro: 0, frutales: 0, almendroRevenue: 0, frutalesRevenue: 0 }
    return row
  })
  const dayIndex = new Map(days.map((d, i) => [d, i]))
  for (const s of sales) {
    const i = dayIndex.get(sofiaDay(s.created_at))
    if (i === undefined) continue
    daily[i][s.product] = (daily[i][s.product] as number) + 1
    daily[i][`${s.product}Revenue`] = round2((daily[i][`${s.product}Revenue`] as number) + s.amount)
  }

  const byProduct = Object.fromEntries((Object.keys(PRODUCTS) as ProductKey[]).map((key) => {
    const list = sales.filter((s) => s.product === key)
    const paid = list.filter((s) => s.amount > 0)
    return [key, {
      name: PRODUCTS[key],
      ...periods(list),
      avgOrder: paid.length ? round2(paid.reduce((sum, s) => sum + s.amount, 0) / paid.length) : 0,
      lastSaleAt: paid[0]?.created_at ?? null,
    }]
  }))

  // Трафик за 30 дни, разделен по продукт според страницата (/frutales/... или главната)
  const isHuman = (v: any) => v.is_bot !== true
  const productOfPage = (page: string | null): ProductKey => (page ?? '').startsWith('/frutales') ? 'frutales' : 'almendro'
  const allVisits = (visitsRes.data ?? []).filter(isHuman)
  const allEvents = (eventsRes.data ?? []).filter(isHuman)
  const month = sales.filter((s) => inDays(s, 30))

  const trafficFor = (key: ProductKey) => {
    const visits = allVisits.filter((v: any) => productOfPage(v.page) === key)
    const sold = month.filter((s) => s.product === key && s.amount > 0)
    const uniqueSet = new Set<string>(visits.filter((v: any) => v.visitor_id).map((v: any) => v.visitor_id as string))

    const srcVisitors: Record<string, Set<string>> = {}
    visits.forEach((v: any) => {
      if (!v.visitor_id) return
      ;(srcVisitors[v.utm_source || 'direct'] ??= new Set()).add(v.visitor_id)
    })
    const srcOrders: Record<string, { orders: number; revenue: number }> = {}
    sold.forEach((s) => {
      const cur = srcOrders[s.utm_source || 'direct'] ??= { orders: 0, revenue: 0 }
      cur.orders += 1
      cur.revenue += s.amount
    })
    const sources = [...new Set([...Object.keys(srcVisitors), ...Object.keys(srcOrders)])].map((source) => {
      const visitors = srcVisitors[source]?.size ?? 0
      const o = srcOrders[source] ?? { orders: 0, revenue: 0 }
      return { source, visitors, orders: o.orders, revenue: round2(o.revenue), conv: visitors ? round2((o.orders / visitors) * 100) : 0 }
    }).sort((a, b) => b.visitors - a.visitors || b.orders - a.orders).slice(0, 10)

    const initiated = new Set(allEvents
      .filter((e: any) => e.visitor_id && productOfPage(e.page) === key && (e.event_name === 'checkout_click' || e.event_name === 'InitiateCheckout'))
      .map((e: any) => e.visitor_id))
    const purchased = new Set(sold.filter((s) => s.visitor_id).map((s) => s.visitor_id))
    let initiate = 0, purchase = 0
    uniqueSet.forEach((vid) => {
      if (initiated.has(vid)) initiate++
      if (purchased.has(vid)) purchase++
    })

    return {
      pageviews: visits.length,
      uniqueVisitors: uniqueSet.size,
      convRate: uniqueSet.size ? round2((sold.length / uniqueSet.size) * 100) : 0,
      sources,
      funnel: { view: uniqueSet.size, initiate, purchase },
    }
  }

  // Наредба Н-18
  const docs = docsRes.data ?? []
  const thisMonth = todayKey.slice(0, 7)
  const docMonths = [...new Set(docs.map((d: any) => sofiaDay(d.issued_at).slice(0, 7)))].sort().reverse()
  const monthDocs = docs.filter((d: any) => sofiaDay(d.issued_at).startsWith(thisMonth))

  return {
    generatedAt: now.toISOString(),
    totals: periods(sales),
    products: byProduct,
    daily,
    traffic: { almendro: trafficFor('almendro'), frutales: trafficFor('frutales') },
    n18: {
      shopNumber: Deno.env.get('N18_SHOP_NUMBER') ?? null,
      lastDocument: docs[0]?.doc_number_text ?? null,
      totalDocuments: docs.length,
      months: [...new Set([thisMonth, ...docMonths])].sort().reverse(),
      currentMonth: {
        month: thisMonth,
        documents: monthDocs.length,
        gross: round2(monthDocs.reduce((s: number, d: any) => s + Number(d.total_gross), 0)),
        vat: round2(monthDocs.reduce((s: number, d: any) => s + Number(d.vat_amount), 0)),
      },
      recent: docs.slice(0, 10).map((d: any) => ({
        number: d.doc_number_text, issuedAt: d.issued_at, product: d.source, total: Number(d.total_gross), token: d.view_token,
      })),
    },
    recent: sales.slice(0, 40).map((s) => ({
      product: s.product, amount: s.amount, createdAt: s.created_at,
      email: s.email, name: s.name, country: s.country, source: s.utm_source,
    })),
  }
}

// ─────────────────────── Месечен XML (Приложение № 38) ───────────────────────

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const money = (n: unknown) => Number(n).toFixed(2)
const cents = (n: unknown) => Math.round(Number(n) * 100)

export type AuditDoc = {
  doc_number: number | string
  order_number: string
  transaction_ref: string
  product_name: string
  quantity: number | string
  vat_rate: number | string
  unit_price_net: number | string
  subtotal_net: number | string
  discount_net: number | string
  vat_amount: number | string
  total_gross: number | string
  stripe_account: string | null
  issued_on: string
}
export type AuditRefund = { order_number: string, amount: number | string, refunded_on: string, refund_method: number | string }

// Същата структура като n18-generator/n18.py (валидирана срещу официалната dec_audit.xsd).
export function buildAuditXml(
  month: string, shopNumber: string, createdOn: string, docs: AuditDoc[], refunds: AuditRefund[],
): string {
  const [god, mon] = month.split('-')
  for (const d of docs) {
    const ok = cents(d.subtotal_net) - cents(d.discount_net) + cents(d.vat_amount) === cents(d.total_gross)
    if (!ok) throw new Error(`Документ ${d.doc_number}: сумите не се равняват`)
  }
  const tag = (name: string, value: unknown) => `<${name}>${esc(value)}</${name}>`
  const orders = docs.map((d) => [
    '    <orderenum>',
    `      ${tag('ord_n', d.order_number)}`,
    `      ${tag('ord_d', d.issued_on)}`,
    `      ${tag('doc_n', Number(d.doc_number))}`,
    `      ${tag('doc_date', d.issued_on)}`,
    '      <art>',
    '        <artenum>',
    `          ${tag('art_name', d.product_name)}`,
    `          ${tag('art_quant', money(d.quantity))}`,
    `          ${tag('art_price', money(d.unit_price_net))}`,
    `          ${tag('art_vat_rate', Number(d.vat_rate))}`,
    `          ${tag('art_vat', money(d.vat_amount))}`,
    `          ${tag('art_sum', money(d.total_gross))}`,
    '        </artenum>',
    '      </art>',
    `      ${tag('ord_total1', money(d.subtotal_net))}`,
    `      ${tag('ord_disc', money(d.discount_net))}`,
    `      ${tag('ord_vat', money(d.vat_amount))}`,
    `      ${tag('ord_total2', money(d.total_gross))}`,
    `      ${tag('paym', SHOP.paym)}`,
    `      ${tag('trans_n', d.transaction_ref)}`,
    `      ${tag('proc_id', d.stripe_account ?? '')}`,
    '    </orderenum>',
  ].join('\n'))
  const refundOrders = new Set(refunds.map((r) => r.order_number))
  const refundTotal = refunds.reduce((s, r) => s + cents(r.amount), 0) / 100
  return [
    "<?xml version='1.0' encoding='UTF-8'?>",
    '<audit>',
    `  ${tag('eik', SHOP.eik)}`,
    `  ${tag('e_shop_n', shopNumber)}`,
    `  ${tag('domain_name', SHOP.domain)}`,
    `  ${tag('e_shop_type', SHOP.type)}`,
    `  ${tag('creation_date', createdOn)}`,
    `  ${tag('mon', mon)}`,
    `  ${tag('god', god)}`,
    '  <order>',
    ...orders,
    '  </order>',
    `  ${tag('r_ord', refundOrders.size)}`,
    ...(refunds.length ? [
      '  <rorder>',
      ...refunds.map((r) => [
        '    <rorderenum>',
        `      ${tag('r_ord_n', r.order_number)}`,
        `      ${tag('r_amount', money(r.amount))}`,
        `      ${tag('r_date', r.refunded_on)}`,
        `      ${tag('r_paym', Number(r.refund_method))}`,
        '    </rorderenum>',
      ].join('\n')),
      '  </rorder>',
    ] : []),
    `  ${tag('r_total', money(refundTotal))}`,
    '</audit>',
    '',
  ].join('\n')
}

async function n18Xml(admin: any, month: string): Promise<Response> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: 'Невалиден месец' }, 400)
  const shopNumber = Deno.env.get('N18_SHOP_NUMBER')
  if (!shopNumber) return json({ error: 'Липсва номер на електронния магазин (N18_SHOP_NUMBER)' }, 409)

  // Широк UTC прозорец, после точен филтър по българска дата.
  const [y, m] = month.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, 1) - 86400000).toISOString()
  const to = new Date(Date.UTC(y, m, 1) + 86400000).toISOString()
  const [docsRes, refundsRes] = await Promise.all([
    admin.database.from('n18_documents')
      .select('doc_number, order_number, transaction_ref, product_name, quantity, vat_rate, unit_price_net, subtotal_net, discount_net, vat_amount, total_gross, stripe_account, issued_at')
      .gte('issued_at', from).lt('issued_at', to).order('doc_number', { ascending: true }),
    admin.database.from('n18_refunds')
      .select('order_number, amount, refunded_on, refund_method')
      .gte('refunded_on', `${month}-01`).lt('refunded_on', m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`),
  ])
  if (docsRes.error) throw new Error(docsRes.error.message)
  if (refundsRes.error) throw new Error(refundsRes.error.message)

  const docs: AuditDoc[] = (docsRes.data ?? [])
    .map((d: any) => ({ ...d, issued_on: sofiaDay(d.issued_at) }))
    .filter((d: AuditDoc) => d.issued_on.startsWith(month))
  if (!docs.length) return json({ error: `Няма издадени документи за ${month}` }, 404)

  const xml = buildAuditXml(month, shopNumber, sofiaDay(new Date()), docs, refundsRes.data ?? [])
  return new Response(xml, {
    headers: {
      ...cors,
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="N18_${shopNumber}_${month}.xml"`,
    },
  })
}
