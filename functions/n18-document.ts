import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'
import { toString as qrToString } from 'https://esm.sh/qrcode@1.5.4'

// Наредба Н-18, чл. 52о: показва издадения документ за регистриране на
// продажбата. Достъп само с личния view_token от имейла на клиента.

const SELLER = {
  name: 'ИНФИНИТИ КРИЕЙТИВ ООД',
  eik: '208149507',
  vat: 'BG208149507',
  address: 'гр. Стара Загора 6010, ж.к. Три Чучура, бл. 106, вх. Б, ет. 8, ап. 62',
  email: 'infinitycreativeltd@gmail.com',
  phone: '+359 895 423 994',
  shop: 'capnodis.com',
}

const PAYMENT_LABELS: Record<string, string> = {
  card: 'Банкова карта / Tarjeta bancaria',
  link: 'Банкова карта чрез Link / Tarjeta (Link)',
  apple_pay: 'Банкова карта чрез Apple Pay / Tarjeta (Apple Pay)',
  google_pay: 'Банкова карта чрез Google Pay / Tarjeta (Google Pay)',
  revolut_pay: 'Revolut Pay',
}

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const money = (n: unknown, currency: string) => `${Number(n).toFixed(2)} ${currency === 'EUR' ? '€' : esc(currency)}`

export default async function handler(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{64}$/.test(token)) return page(404, notFound())

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })
  const { data: doc, error } = await admin.database
    .from('n18_documents')
    .select('*')
    .eq('view_token', token)
    .maybeSingle()

  if (error) {
    console.error('n18-document lookup failed', error.message)
    return page(500, notFound())
  }
  if (!doc) return page(404, notFound())

  const qrSvg: string = await qrToString(doc.qr_payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
  return page(200, documentHtml(doc, qrSvg))
}

function page(status: number, html: string): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  })
}

function notFound(): string {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Documento no encontrado</title>
<body style="font-family:Arial,sans-serif;padding:40px;color:#172116">Документът не е намерен. / Documento no encontrado.</body></html>`
}

function documentHtml(d: any, qrSvg: string): string {
  const issued = new Date(d.issued_at)
  const sofia = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('bg-BG', { timeZone: 'Europe/Sofia', ...opts }).format(issued)
  const date = sofia({ day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = sofia({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const unitGross = Number(d.subtotal_gross) / Number(d.quantity)
  const payment = PAYMENT_LABELS[d.payment_method] ?? esc(d.payment_method)

  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Документ за продажба № ${esc(d.doc_number_text)}</title>
<style>
  :root{--ink:#172116;--muted:#5d6858;--line:#d9dccf;--bg:#fbf7ed}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Arial,Helvetica,sans-serif}
  main{max-width:760px;margin:24px auto;background:#fff;border:1px solid var(--line);border-radius:12px;padding:28px}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:var(--muted);margin:0 0 20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .box{border:1px solid var(--line);border-radius:8px;padding:12px 14px}
  .box h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0 0 6px}
  .box p{margin:0}
  table{width:100%;border-collapse:collapse;margin:8px 0 16px}
  th,td{border-bottom:1px solid var(--line);padding:8px 6px;text-align:left;vertical-align:top}
  th{font-size:12px;color:var(--muted);font-weight:normal}
  td.num,th.num{text-align:right;white-space:nowrap}
  .totals{margin-left:auto;max-width:440px}
  .totals td{border:0;padding:3px 6px}
  .totals tr.total td{font-weight:bold;font-size:16px;border-top:2px solid var(--ink);padding-top:8px}
  .qr{display:flex;gap:16px;align-items:center;margin-top:24px;border-top:1px solid var(--line);padding-top:18px}
  .qr svg{width:34mm;height:34mm;flex:none}
  .small{font-size:12px;color:var(--muted);word-break:break-all}
  .print{margin-top:20px}
  @media (max-width:600px){main{margin:0;border-radius:0;padding:18px 16px}.grid{grid-template-columns:1fr}}
  @media print{body{background:#fff}main{border:0;margin:0}.print{display:none}}
</style>
</head>
<body>
<main>
  <h1>Документ за регистриране на продажба № ${esc(d.doc_number_text)}</h1>
  <p class="sub">Documento de registro de venta · Дата / Fecha: ${esc(date)} ${esc(time)}</p>

  <div class="grid">
    <div class="box">
      <h2>Продавач / Vendedor</h2>
      <p><strong>${esc(SELLER.name)}</strong></p>
      <p>ЕИК: ${esc(SELLER.eik)} · ДДС №: ${esc(SELLER.vat)}</p>
      <p>${esc(SELLER.address)}</p>
      <p>${esc(SELLER.email)} · ${esc(SELLER.phone)}</p>
    </div>
    <div class="box">
      <h2>Електронен магазин / Tienda online</h2>
      <p><strong>${esc(SELLER.shop)}</strong></p>
      <p>№ на е-магазина (НАП): ${esc(d.e_shop_number)}</p>
      <p>Поръчка / Pedido: <span class="small">${esc(d.order_number)}</span></p>
      <p>Трансакция / Transacción: <span class="small">${esc(d.transaction_ref)}</span></p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Наименование / Descripción</th>
        <th>Данъчна група / Grupo IVA</th>
        <th class="num">Кол. / Cant.</th>
        <th class="num">Ед. цена / Precio unit.</th>
        <th class="num">Стойност / Importe</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${esc(d.product_name)}</td>
        <td>${esc(d.tax_group)} (${esc(d.vat_rate)}%)</td>
        <td class="num">${Number(d.quantity)}</td>
        <td class="num">${money(unitGross, d.currency)}</td>
        <td class="num">${money(d.subtotal_gross, d.currency)}</td>
      </tr>
    </tbody>
  </table>

  <table class="totals">
    ${Number(d.discount_net) > 0 ? `<tr><td>Отстъпка / Descuento</td><td class="num">−${money(Number(d.subtotal_gross) - Number(d.total_gross), d.currency)}</td></tr>` : ''}
    <tr><td>Данъчна основа / Base imponible</td><td class="num">${money(Number(d.total_gross) - Number(d.vat_amount), d.currency)}</td></tr>
    <tr><td>ДДС ${esc(d.vat_rate)}% / IVA ${esc(d.vat_rate)}%</td><td class="num">${money(d.vat_amount, d.currency)}</td></tr>
    <tr class="total"><td>Обща сума / Total</td><td class="num">${money(d.total_gross, d.currency)}</td></tr>
    <tr><td>Начин на плащане / Forma de pago</td><td class="num">${payment}</td></tr>
  </table>

  <div class="qr">
    ${qrSvg}
    <p class="small">${esc(d.qr_payload)}</p>
  </div>

  <p class="print"><button onclick="window.print()">Печат / Imprimir</button></p>
</main>
</body>
</html>`
}
