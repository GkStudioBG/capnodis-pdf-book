import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const password = req.headers.get('x-admin-password') ?? ''
  const adminPassword = Deno.env.get('ADMIN_PASSWORD') ?? ''

  if (!adminPassword || password !== adminPassword) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })

  const url = new URL(req.url)
  const section = url.searchParams.get('section') ?? 'dashboard'

  if (section === 'dashboard') {
    const now = new Date()
    const since30 = new Date(now.getTime() - 30 * 86400000).toISOString()

    const [ordersRes, visitsRes, eventsRes, recentRes] = await Promise.all([
      admin.database.from('orders').select('amount, created_at, stripe_payment_status, utm_source, utm_content, visitor_id'),
      admin.database.from('visits').select('utm_source, created_at, visitor_id, is_bot').gte('created_at', since30),
      admin.database.from('events').select('event_name, visitor_id, is_bot').gte('created_at', since30),
      admin.database
        .from('orders')
        .select('id, customer_email, customer_name, customer_phone, billing_country, amount, stripe_session_id, created_at, utm_source, utm_campaign, utm_content, visitor_id')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const orders = ordersRes.data ?? []
    const visits = visitsRes.data ?? []
    const events = eventsRes.data ?? []
    const recent = recentRes.data ?? []

    const round2 = (n: number) => Math.round(n * 100) / 100
    const isHuman = (v: any) => v.is_bot !== true

    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.amount ?? 0), 0)
    const totalOrders = orders.length

    const today = orders.filter((o: any) => {
      const d = new Date(o.created_at)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    })
    const week = orders.filter((o: any) => (now.getTime() - new Date(o.created_at).getTime()) < 7 * 86400000)
    const month = orders.filter((o: any) => (now.getTime() - new Date(o.created_at).getTime()) < 30 * 86400000)

    // Daily orders for last 14 days
    const dailyMap: Record<string, number> = {}
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      dailyMap[d.toISOString().slice(0, 10)] = 0
    }
    orders.forEach((o: any) => {
      const day = o.created_at?.slice(0, 10)
      if (day && day in dailyMap) dailyMap[day]++
    })

    // ── Traffic (last 30 days, bots excluded) ────────────────────────
    const humanVisits = visits.filter(isHuman)
    const pageviews = humanVisits.length
    const uniqueSet = new Set(humanVisits.filter((v: any) => v.visitor_id).map((v: any) => v.visitor_id))
    const uniqueVisitors = uniqueSet.size

    // Per-source: unique visitors + orders + revenue + conversion
    const srcVisitors: Record<string, Set<string>> = {}
    humanVisits.forEach((v: any) => {
      const src = v.utm_source || 'direct'
      if (!v.visitor_id) return
      ;(srcVisitors[src] = srcVisitors[src] || new Set()).add(v.visitor_id)
    })
    const srcOrders: Record<string, { orders: number; revenue: number }> = {}
    month.forEach((o: any) => {
      const src = o.utm_source || 'direct'
      const cur = srcOrders[src] || { orders: 0, revenue: 0 }
      cur.orders += 1
      cur.revenue += o.amount ?? 0
      srcOrders[src] = cur
    })
    const allSources = new Set([...Object.keys(srcVisitors), ...Object.keys(srcOrders)])
    const sources = [...allSources].map((source) => {
      const visitors = srcVisitors[source]?.size ?? 0
      const o = srcOrders[source] || { orders: 0, revenue: 0 }
      return {
        source,
        count: visitors,            // kept for backwards compatibility (was visit count)
        visitors,
        orders: o.orders,
        revenue: round2(o.revenue),
        conv: visitors > 0 ? Math.round((o.orders / visitors) * 1000) / 10 : 0,
        pct: uniqueVisitors > 0 ? Math.round((visitors / uniqueVisitors) * 100) : 0,
      }
    }).sort((a, b) => b.visitors - a.visitors || b.orders - a.orders).slice(0, 10)

    // Top creatives by utm_content (from orders, last 30 days)
    const contentMap: Record<string, { orders: number; revenue: number }> = {}
    month.forEach((o: any) => {
      const c = o.utm_content || 'unattributed'
      const cur = contentMap[c] || { orders: 0, revenue: 0 }
      cur.orders += 1
      cur.revenue += o.amount ?? 0
      contentMap[c] = cur
    })
    const creatives = Object.entries(contentMap)
      .map(([content, v]) => ({ content, orders: v.orders, revenue: round2(v.revenue) }))
      .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
      .slice(0, 10)

    // ── Funnel (last 30 days, by unique visitor, bots excluded) ──────
    const initiatedSet = new Set(
      events.filter((e: any) => isHuman(e) && e.visitor_id &&
        (e.event_name === 'checkout_click' || e.event_name === 'InitiateCheckout'))
        .map((e: any) => e.visitor_id)
    )
    const purchasedSet = new Set(
      month.filter((o: any) => o.visitor_id).map((o: any) => o.visitor_id)
    )
    let viewCount = 0, initiateCount = 0, purchaseCount = 0
    uniqueSet.forEach((vid) => {
      viewCount++
      if (initiatedSet.has(vid)) initiateCount++
      if (purchasedSet.has(vid)) purchaseCount++
    })

    return Response.json({
      stats: {
        totalRevenue: round2(totalRevenue),
        totalOrders,
        today: { orders: today.length, revenue: round2(today.reduce((s: number, o: any) => s + (o.amount ?? 0), 0)) },
        week:  { orders: week.length,  revenue: round2(week.reduce((s: number, o: any) => s + (o.amount ?? 0), 0)) },
        month: { orders: month.length, revenue: round2(month.reduce((s: number, o: any) => s + (o.amount ?? 0), 0)) },
        totalVisits: pageviews,                 // kept: now means human pageviews (30d)
        pageviews,
        uniqueVisitors,
        pageviewsPerVisitor: uniqueVisitors > 0 ? Math.round((pageviews / uniqueVisitors) * 10) / 10 : 0,
        convRate: uniqueVisitors > 0 ? Math.round((month.length / uniqueVisitors) * 1000) / 10 : 0,
      },
      daily: dailyMap,
      sources,
      creatives,
      funnel: { view: viewCount, initiate: initiateCount, purchase: purchaseCount },
      recent,
    }, { headers: cors })
  }

  return Response.json({ error: 'Unknown section' }, { status: 400, headers: cors })
}
