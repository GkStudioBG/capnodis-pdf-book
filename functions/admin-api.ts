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
    const [ordersRes, visitsRes, recentRes] = await Promise.all([
      admin.database.from('orders').select('amount, created_at, stripe_payment_status'),
      admin.database.from('visits').select('utm_source, created_at'),
      admin.database
        .from('orders')
        .select('id, customer_email, customer_name, customer_phone, billing_country, amount, stripe_session_id, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const orders = ordersRes.data ?? []
    const visits = visitsRes.data ?? []
    const recent = recentRes.data ?? []

    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.amount ?? 0), 0)
    const totalOrders = orders.length

    const now = new Date()
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

    // UTM source breakdown (last 30 days)
    const monthVisits = visits.filter((v: any) => (now.getTime() - new Date(v.created_at).getTime()) < 30 * 86400000)
    const sourceMap: Record<string, number> = {}
    monthVisits.forEach((v: any) => {
      const src = v.utm_source ?? 'direct'
      sourceMap[src] = (sourceMap[src] ?? 0) + 1
    })
    const totalVisits = monthVisits.length
    const sources = Object.entries(sourceMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([source, count]) => ({
        source,
        count,
        pct: totalVisits > 0 ? Math.round((count / totalVisits) * 100) : 0,
      }))

    return Response.json({
      stats: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders,
        today: { orders: today.length, revenue: Math.round(today.reduce((s: number, o: any) => s + (o.amount ?? 0), 0) * 100) / 100 },
        week:  { orders: week.length,  revenue: Math.round(week.reduce((s: number, o: any) => s + (o.amount ?? 0), 0) * 100) / 100 },
        month: { orders: month.length, revenue: Math.round(month.reduce((s: number, o: any) => s + (o.amount ?? 0), 0) * 100) / 100 },
        totalVisits,
        convRate: totalVisits > 0 ? Math.round((totalOrders / totalVisits) * 1000) / 10 : 0,
      },
      daily: dailyMap,
      sources,
      recent,
    }, { headers: cors })
  }

  return Response.json({ error: 'Unknown section' }, { status: 400, headers: cors })
}
