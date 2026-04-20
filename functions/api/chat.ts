// Cloudflare Pages Function: /api/chat
//
// Endpoint de chat conversacional con Gemini Pro. Recibe el historial
// de mensajes + datos del contexto (cliente, documento en progreso) y
// devuelve la respuesta del modelo. Se usa para que la IA haga
// preguntas sobre datos faltantes o para refinar el documento.

interface Env {
  GEMINI_API_KEY: string
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
  GEMINI_PRO_MODEL?: string
}

interface Message {
  role: 'user' | 'model'
  text: string
}

interface RequestBody {
  messages: Message[]
  systemContext?: string
}

interface Context {
  request: Request
  env: Env
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function verifyAuth(
  request: Request,
  env: Env,
): Promise<boolean> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const token = auth.slice(7)
  try {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function onRequestPost(context: Context): Promise<Response> {
  const { request, env } = context

  if (!env.GEMINI_API_KEY) {
    return json({ error: 'GEMINI_API_KEY no está configurada.' }, 500)
  }

  const authed = await verifyAuth(request, env)
  if (!authed) {
    return json({ error: 'No autorizado' }, 401)
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  if (!body.messages?.length) {
    return json({ error: 'No hay mensajes.' }, 400)
  }

  const proModel = env.GEMINI_PRO_MODEL || 'gemini-3.1-pro-preview'

  try {
    const systemInstruction = body.systemContext
      ? {
          parts: [{ text: body.systemContext }],
        }
      : undefined

    const contents = body.messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }))

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      proModel,
    )}:generateContent?key=${env.GEMINI_API_KEY}`

    const reqBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
    }
    if (systemInstruction) {
      reqBody.systemInstruction = systemInstruction
    }

    const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 524])
    const RETRY_DELAYS_MS = [2000, 5000, 10000]
    const payload = JSON.stringify(reqBody)
    let lastErr = ''
    let res: Response | null = null
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
      }
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
        })
      } catch (err) {
        lastErr = `fetch falló: ${(err as Error).message}`
        res = null
        continue
      }
      if (res.ok) break
      const errText = await res.text().catch(() => '')
      lastErr = `${res.status} ${errText.slice(0, 300)}`
      if (!RETRY_STATUSES.has(res.status)) break
      res = null
    }
    if (!res || !res.ok) {
      throw new Error(
        `Gemini ${proModel} falló tras ${RETRY_DELAYS_MS.length + 1} intentos: ${lastErr}`,
      )
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!reply) throw new Error('Gemini devolvió una respuesta vacía')

    return json({ reply })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
}
