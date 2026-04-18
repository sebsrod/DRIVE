// Cloudflare Pages Function: /api/analyze-style
//
// Recibe los documentos modelo del usuario en base64, los envía a
// Gemini Pro para que extraiga una guía de estilo de redacción, y
// guarda el resultado en profiles.writing_style vía Supabase.
// De esta forma la guía queda persistida en la BD y no hace falta
// re-analizarla cada vez que se genere un nuevo documento.

interface Env {
  GEMINI_API_KEY: string
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
  GEMINI_PRO_MODEL?: string
}

interface Attachment {
  filename: string
  mimeType: string
  base64: string
}

interface RequestBody {
  attachments: Attachment[]
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
): Promise<{ ok: boolean; userId?: string; token?: string }> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return { ok: false }
  const token = auth.slice(7)
  try {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
    if (!res.ok) return { ok: false }
    const user = (await res.json()) as { id: string }
    return { ok: true, userId: user.id, token }
  } catch {
    return { ok: false }
  }
}

async function callGemini(
  model: string,
  apiKey: string,
  parts: unknown[],
  temperature = 0.3,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature, maxOutputTokens: 8192 },
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(
      `Gemini ${model} respondió ${res.status}: ${errText.slice(0, 500)}`,
    )
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini devolvió una respuesta vacía')
  return text
}

const STYLE_PROMPT = `Eres un experto en análisis de estilo de redacción jurídica venezolana.

Analiza cuidadosamente todos los documentos adjuntos y extrae una guía de estilo detallada y concisa que cubra:

1. **Estructura general**: cómo organiza el documento (encabezado, identificación de partes, exposición, cláusulas, cierre y firma).
2. **Vocabulario jurídico preferido**: expresiones y fórmulas legales recurrentes (ej: "comparece por ante mí", "se deja constancia", "por voluntad de las partes").
3. **Formato de cláusulas**: numeración (PRIMERA, SEGUNDA vs 1., 2.), longitud típica, estilo (narrativo vs enumerativo).
4. **Identificación de las partes**: cómo refiere al otorgante, apoderado, contratante (nombre completo, cédula, domicilio — formato exacto).
5. **Formato de datos**: cómo escribe fechas, montos en letras y números, referencias a registros mercantiles.
6. **Tono y formalidad**: nivel de solemnidad, uso de tercera persona, tiempo verbal predominante.
7. **Patrones de cierre**: despedida, declaración de conformidad, fórmula de firma.
8. **Actos de asamblea comunes identificados**: lista los tipos de actos societarios que aparecen en los documentos (si hay actas).

Esta guía será usada como instrucción para generar nuevos documentos que emulen fielmente el estilo del usuario. Sé preciso y completo pero conciso. No incluyas el contenido de los documentos, solo el análisis del estilo.`

export async function onRequestPost(context: Context): Promise<Response> {
  const { request, env } = context

  if (!env.GEMINI_API_KEY) {
    const keys = Object.keys(env).filter((k) => !k.startsWith('__')).join(', ')
    return json(
      {
        error: `GEMINI_API_KEY no está configurada. Variables disponibles: [${keys || 'ninguna'}]. Verifica que el nombre sea exacto en Cloudflare → Settings → Variables and Secrets para Production.`,
      },
      500,
    )
  }

  const auth = await verifyAuth(request, env)
  if (!auth.ok || !auth.userId || !auth.token) {
    return json({ error: 'No autorizado' }, 401)
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  if (!body.attachments?.length) {
    return json({ error: 'No se enviaron documentos modelo.' }, 400)
  }

  const proModel = env.GEMINI_PRO_MODEL || 'gemini-3.1-pro'

  try {
    // Enviar todos los PDFs al modelo Pro para análisis de estilo
    const parts: unknown[] = [{ text: STYLE_PROMPT }]
    for (const att of body.attachments) {
      if (!att?.base64 || !att?.mimeType) continue
      parts.push({
        inline_data: { mime_type: att.mimeType, data: att.base64 },
      })
    }

    const styleGuide = await callGemini(proModel, env.GEMINI_API_KEY, parts, 0.3)

    // Guardar la guía de estilo en el perfil del usuario vía Supabase
    const saveRes = await fetch(
      `${env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${auth.userId}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          apikey: env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${auth.token}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ writing_style: styleGuide }),
      },
    )
    if (!saveRes.ok) {
      const errText = await saveRes.text().catch(() => '')
      throw new Error(`Error guardando estilo en perfil: ${saveRes.status} ${errText}`)
    }

    return json({ style: styleGuide })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
}
