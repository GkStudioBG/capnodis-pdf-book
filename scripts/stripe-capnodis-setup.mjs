// Създава продуктите, цените и Payment Link-овете на Capnodis в собствения
// Stripe акаунт (acct_1UNXo2FQ0Sq9LOrr). Нищо не се свързва със сайта —
// линковете се ползват едва при превключването.
//
//   STRIPE_CAPNODIS_SECRET_KEY=sk_live_... node scripts/stripe-capnodis-setup.mjs
//
// Безопасно е да се пусне повторно: всеки обект има фиксиран Idempotency-Key.

const KEY = process.env.STRIPE_CAPNODIS_SECRET_KEY
const ACCOUNT = 'acct_1UNXo2FQ0Sq9LOrr'
if (!KEY) {
  console.error('Missing STRIPE_CAPNODIS_SECRET_KEY')
  process.exit(1)
}

async function stripe(method, path, params, idempotencyKey) {
  const headers = { Authorization: `Bearer ${KEY}` }
  if (idempotencyKey) headers['Idempotency-Key'] = `capnodis-setup-v1/${idempotencyKey}`
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params) : undefined,
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${method} ${path}: ${body.error?.message ?? res.status}`)
  return body
}

const account = await stripe('GET', 'account')
if (account.id !== ACCOUNT) {
  console.error(`Wrong Stripe account: ${account.id} (expected ${ACCOUNT})`)
  process.exit(1)
}

const PRODUCTS = [
  {
    slug: 'almendro',
    name: 'Guía Práctica contra el Gusano Cabezudo en Almendro (+3 Bonos)',
    description: 'Guía digital en PDF para el diagnóstico, ciclo y manejo integrado del gusano cabezudo en almendro. ¿Qué incluye? ✓ Guía principal PDF — diagnóstico, ciclo y tratamiento ✓ Bono 1: Calendario mensual de manejo integrado ✓ Bono 2: Checklist de diagnóstico en campo ✓ Bono 3: Árbol de decisión según el nivel de daño Recibirás un enlace de descarga en tu correo al instante.',
    image: 'https://files.stripe.com/links/MDB8YWNjdF8xUW9BbXZGRmVOdU16cUhGfGZsX2xpdmVfU0k1UWFSZTBBUWZSMlVVWjQ5TGlIMlA300Oof2WSIM',
    redirect: 'https://capnodis.com/gracias?session_id={CHECKOUT_SESSION_ID}',
    billingAddress: 'required',
  },
  {
    slug: 'frutales',
    name: 'Guía Práctica contra el Gusano Cabezudo en Frutales de Hueso + 3 bonos',
    description: 'Guía digital en PDF con calendario de vigilancia, checklist de diagnóstico y árbol de decisión incluidos.',
    image: 'https://files.stripe.com/links/MDB8YWNjdF8xUW9BbXZGRmVOdU16cUhGfGZsX2xpdmVfM0pMV3JWOUhjS09WRzU4bGtjUXhGTGlO008iqIGW8J',
    redirect: 'https://capnodis.com/frutales/gracias?session_id={CHECKOUT_SESSION_ID}',
    billingAddress: 'auto',
  },
]

const result = {}
for (const p of PRODUCTS) {
  const product = await stripe('POST', 'products', {
    name: p.name,
    description: p.description,
    'images[0]': p.image,
    tax_code: 'txcd_10000000',
    'metadata[shop]': 'capnodis.com',
    'metadata[slug]': p.slug,
  }, `product/${p.slug}`)

  const price = await stripe('POST', 'prices', {
    product: product.id,
    currency: 'eur',
    unit_amount: '1990',
    tax_behavior: 'inclusive',
    'metadata[slug]': p.slug,
  }, `price/${p.slug}`)

  await stripe('POST', `products/${product.id}`, { default_price: price.id })

  const link = await stripe('POST', 'payment_links', {
    'line_items[0][price]': price.id,
    'line_items[0][quantity]': '1',
    'after_completion[type]': 'redirect',
    'after_completion[redirect][url]': p.redirect,
    allow_promotion_codes: 'true',
    billing_address_collection: p.billingAddress,
    'automatic_tax[enabled]': 'false',
    'metadata[shop]': 'capnodis.com',
    'metadata[slug]': p.slug,
  }, `payment_link/${p.slug}`)

  result[p.slug] = { product: product.id, price: price.id, payment_link: link.id, url: link.url }
}

// 100% промокод само за проверка на доставката при превключването (макс. 5 ползвания).
const coupon = await stripe('POST', 'coupons', {
  percent_off: '100',
  duration: 'once',
  name: 'Prueba de entrega',
}, 'coupon/test100')
const promo = await stripe('POST', 'promotion_codes', {
  'promotion[type]': 'coupon',
  'promotion[coupon]': coupon.id,
  code: 'TEST100CAP',
  max_redemptions: '5',
}, 'promotion_code/test100')
result.test_promotion_code = { code: promo.code, id: promo.id }

console.log(JSON.stringify(result, null, 2))
