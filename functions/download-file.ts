import { createAdminClient } from 'https://esm.sh/@insforge/sdk@latest'

const BUCKET = 'capnodis-files-spain'

const ALLOWED_FILES: Record<string, { storageKey: string; downloadName: string }> = {
  'guia-principal.pdf':   { storageKey: 'guia-principal.pdf',  downloadName: 'Guia-Practica-Capnodis.pdf' },
  'bono1-calendario.pdf': { storageKey: 'bono1-calendario.pdf', downloadName: 'Bono1-Calendario-Mensual.pdf' },
  'bono2-checklist.pdf':  { storageKey: 'bono2-checklist.pdf',  downloadName: 'Bono2-Checklist-Diagnostico.pdf' },
  'bono3-decision.pdf':   { storageKey: 'bono3-decision.pdf',   downloadName: 'Bono3-Arbol-Decision.pdf' },
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const file = url.searchParams.get('file')

  if (!token || !file) return new Response('Parámetros faltantes', { status: 400 })
  if (!ALLOWED_FILES[file]) return new Response('Archivo no válido', { status: 400 })

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  })

  const { data, error } = await admin.database
    .from('download_tokens')
    .select('expires_at')
    .eq('token', token)
    .single()

  if (error || !data) return new Response('Token no válido', { status: 403 })
  if (new Date(data.expires_at) < new Date()) return new Response('Token expirado', { status: 410 })

  const { storageKey, downloadName } = ALLOWED_FILES[file]

  const { data: blob, error: storageErr } = await admin.storage
    .from(BUCKET)
    .download(storageKey)

  if (storageErr || !blob) {
    console.error('Storage download error:', storageErr)
    return new Response('Archivo no disponible temporalmente', { status: 500 })
  }
  return new Response(blob, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
