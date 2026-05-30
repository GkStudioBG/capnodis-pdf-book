import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'

const FILES = [
  { key: 'guia-principal.pdf',    label: 'Guía principal PDF',                 icon: '📖' },
  { key: 'bono1-calendario.pdf',  label: 'Bono 1: Calendario mensual',          icon: '📅' },
  { key: 'bono2-checklist.pdf',   label: 'Bono 2: Checklist de diagnóstico',    icon: '✅' },
  { key: 'bono3-decision.pdf',    label: 'Bono 3: Árbol de decisión',           icon: '🌿' },
]

export default async function handler(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) return errorPage('Enlace no válido', 'No se ha proporcionado un token de descarga.')

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })

  const { data, error } = await admin.database
    .from('download_tokens')
    .select('id, expires_at, used_at, orders(customer_name)')
    .eq('token', token)
    .single()

  if (error || !data) return errorPage('Enlace no válido', 'Este enlace de descarga no existe.')
  if (new Date(data.expires_at) < new Date()) return errorPage('Enlace expirado', 'Tu enlace ha expirado (validez 30 días). Escríbenos a Infinitycreativeltd@gmail.com para solicitar uno nuevo.')

  // Track first access
  if (!data.used_at) {
    await admin.database
      .from('download_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', data.id)
  }

  const name = (data.orders as any)?.customer_name?.split(' ')[0] || ''
  const baseUrl = new URL(req.url).origin
  const downloadBase = `${Deno.env.get('INSFORGE_BASE_URL')!.replace('/api', '')}/functions/download-file`

  const buttons = FILES.map(f => `
    <a href="${downloadBase}?token=${encodeURIComponent(token)}&file=${f.key}" class="file-btn">
      <span class="file-icon">${f.icon}</span>
      <span class="file-label">${f.label}</span>
      <span class="file-dl">Descargar →</span>
    </a>`).join('')

  return new Response(downloadPageHtml(name, buttons), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function downloadPageHtml(name: string, buttons: string): string {
  const greeting = name ? `, ${name}` : ''
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tus materiales — Capnodis</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:0;background:#fbf7ed;font-family:Arial,sans-serif;color:#172116;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px}
  .card{background:#fff;border-radius:20px;padding:40px;max-width:560px;width:100%;box-shadow:0 4px 32px rgba(30,44,24,.12)}
  .logo{height:56px;width:auto;margin-bottom:24px;display:block}
  h1{margin:0 0 8px;font-size:22px;font-weight:800}
  .sub{margin:0 0 28px;font-size:15px;color:#636b5e;line-height:1.5}
  .file-btn{display:flex;align-items:center;gap:12px;background:#f7f3ea;border:1.5px solid #e8e0d0;border-radius:12px;padding:16px 18px;margin-bottom:12px;text-decoration:none;color:#172116;transition:border-color .15s,background .15s}
  .file-btn:hover{background:#f0e9d8;border-color:#cfb035}
  .file-icon{font-size:22px;flex-shrink:0}
  .file-label{flex:1;font-weight:600;font-size:15px}
  .file-dl{font-size:13px;color:#636b5e;flex-shrink:0}
  .note{margin-top:24px;font-size:12px;color:#9aa394;line-height:1.6;text-align:center}
  .note a{color:#1d3522;font-weight:700}
</style>
</head>
<body>
  <div class="card">
    <picture><source srcset="https://capnodis.com/assets/loogo.webp" type="image/webp"><img src="https://capnodis.com/assets/loogo.png" alt="Capnodis" class="logo"></picture>
    <h1>Tus materiales están listos${greeting}!</h1>
    <p class="sub">Descarga cada archivo por separado. Puedes volver a este enlace durante <strong>30 días</strong>.</p>
    ${buttons}
    <p class="note">¿Algún problema? <a href="mailto:Infinitycreativeltd@gmail.com">Infinitycreativeltd@gmail.com</a></p>
  </div>
</body>
</html>`
}

function errorPage(title: string, message: string): Response {
  return new Response(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Capnodis</title>
<style>*{box-sizing:border-box}body{margin:0;background:#fbf7ed;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}.card{background:#fff;border-radius:16px;padding:48px 40px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(30,44,24,.10)}.icon{font-size:48px;margin-bottom:16px}h1{font-size:22px;font-weight:800;margin:0 0 12px}p{font-size:15px;line-height:1.6;color:#636b5e;margin:0 0 8px}a{color:#1d3522;font-weight:700}</style>
</head>
<body><div class="card"><div class="icon">⚠️</div><h1>${title}</h1><p>${message}</p><p><a href="mailto:Infinitycreativeltd@gmail.com">Infinitycreativeltd@gmail.com</a></p></div></body>
</html>`, { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
