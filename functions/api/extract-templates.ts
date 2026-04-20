// Cloudflare Pages Function: /api/extract-templates
//
// Recibe PDFs modelo de una categoría y le pide a Gemini Pro que
// extraiga una plantilla textual por cada tipo de acto que encuentre.
// Cada plantilla conserva la redacción LITERAL del modelo pero
// reemplaza los datos específicos con placeholders (ej: {{nombre}}).
// Las plantillas se guardan en la tabla act_templates y se usan
// al generar documentos (sustitución directa, no generación libre).

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
  category: string
}

interface ExtractedTemplate {
  act_key: string
  act_label: string
  template_text: string
  placeholders: string[]
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

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 524])
const RETRY_DELAYS_MS = [2000, 5000, 10000]

async function callGemini(
  model: string,
  apiKey: string,
  parts: unknown[],
  temperature = 0.1,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${apiKey}`
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature, maxOutputTokens: 16384 },
  })
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
        body,
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
      `Gemini ${model} falló tras ${RETRY_DELAYS_MS.length + 1} intentos: ${lastErr}`,
    )
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini devolvió una respuesta vacía')
  return text
}

const CATEGORY_CONTEXT: Record<string, string> = {
  acta_asamblea:
    'Los documentos son Actas de Asamblea de Accionistas/Socios. ' +
    'Extrae plantillas para: encabezado del acta, convocatoria, quórum, ' +
    'cada tipo de acto societario que encuentres (aumento de capital, ' +
    'nombramiento de junta directiva, nombramiento de comisario, venta ' +
    'de acciones, reforma de estatutos, distribución de dividendos, ' +
    'disolución, fusión, cambio de domicilio, extensión de duración, ' +
    'etc.), la fórmula de cierre y la cláusula de autorización al ' +
    'presentante.',
  documento_constitutivo:
    'Los documentos son Documentos Constitutivos y Estatutos Sociales. ' +
    'Extrae plantillas para: comparecencia, cláusula de denominación, ' +
    'domicilio, objeto social, duración, capital social, ' +
    'administración, comisario, asambleas, ejercicio económico, ' +
    'utilidades, disolución, disposiciones transitorias y autorización ' +
    'al presentante.',
  poder:
    'Los documentos son Poderes (generales y especiales). Extrae ' +
    'plantillas para: comparecencia del otorgante, designación del ' +
    'apoderado, enumeración de facultades (general vs especial), ' +
    'limitaciones, revocación y cierre/firma.',
  contrato:
    'Los documentos son Contratos (arrendamiento, laboral, comercial). ' +
    'Extrae plantillas para: identificación de las partes, objeto del ' +
    'contrato, contraprestación, duración, obligaciones, causales de ' +
    'resolución, domicilio procesal y cierre/firma.',
}

function buildPrompt(category: string): string {
  const categoryCtx =
    CATEGORY_CONTEXT[category] ??
    'Extrae las plantillas de cada sección del documento.'

  return `Eres un experto en redacción jurídica venezolana y tu tarea es extraer PLANTILLAS TEXTUALES LITERALES de los documentos modelo adjuntos.

CONTEXTO: ${categoryCtx}

INSTRUCCIONES:
1. Lee TODOS los documentos adjuntos.
2. Identifica cada sección o "acto" distinto que aparezca.
3. Para cada sección, extrae la redacción LITERAL TAL COMO APARECE en el modelo.
4. Reemplaza SOLO los datos específicos del caso (nombres, cédulas, fechas, montos, direcciones, números de registro) por placeholders con formato {{nombre_del_placeholder}}.
5. CONSERVA absolutamente toda la redacción, fórmulas jurídicas, vocabulario, estructura, puntuación y estilo del modelo original.
6. NO reescribas, NO parafrasees, NO resumas. La plantilla debe ser una copia fiel del modelo con datos sustituidos por placeholders.

PLACEHOLDERS ESTÁNDAR:
- {{nombre_empresa}} {{rif}} {{domicilio_empresa}} {{registro_mercantil}} {{fecha_registro}} {{numero_registro}} {{tomo_registro}}
- {{capital_anterior}} {{capital_nuevo}} {{valor_nominal}}
- {{nombre_accionista}} {{cedula_accionista}} {{estado_civil}} {{domicilio_accionista}} {{porcentaje_accionario}}
- {{nombre_representante}} {{cedula_representante}} {{cargo}}
- {{nombre_comisario}} {{cedula_comisario}} {{colegio_comisario}} {{carnet_comisario}}
- {{fecha_asamblea}} {{hora_asamblea}} {{lugar_asamblea}}
- {{nombre_presidente_asamblea}} {{nombre_secretario_asamblea}}
- {{nombre_presentante}}
- {{fecha}} {{monto}} {{duracion}} {{objeto_social}}
Puedes crear placeholders adicionales siguiendo el mismo formato.

FORMATO DE RESPUESTA — Devuelve SOLO un JSON válido (sin markdown ni backticks) con esta estructura:
[
  {
    "act_key": "encabezado_acta",
    "act_label": "Encabezado del acta",
    "template_text": "En la ciudad de {{lugar_asamblea}}, siendo las {{hora_asamblea}} del día {{fecha_asamblea}}, se reunieron...",
    "placeholders": ["lugar_asamblea", "hora_asamblea", "fecha_asamblea"]
  },
  {
    "act_key": "aumento_capital",
    "act_label": "Aumento de Capital Social",
    "template_text": "PUNTO PRIMERO: Los accionistas por unanimidad acuerdan aumentar el capital social de la empresa de {{capital_anterior}} a {{capital_nuevo}}...",
    "placeholders": ["capital_anterior", "capital_nuevo"]
  }
]

IMPORTANTE:
- Cada act_key debe ser un slug en snake_case.
- template_text debe contener la redacción LITERAL del modelo, solo con datos reemplazados por placeholders.
- El arreglo placeholders lista TODOS los placeholders usados en esa plantilla.
- Si encuentras múltiples variantes del mismo acto en diferentes modelos, elige la más completa.
- Incluye SIEMPRE una plantilla para "encabezado" y una para "cierre" del documento.`
}

export async function onRequestPost(context: Context): Promise<Response> {
  const { request, env } = context

  if (!env.GEMINI_API_KEY) {
    return json({ error: 'GEMINI_API_KEY no está configurada.' }, 500)
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
    return json({ error: 'No se enviaron documentos.' }, 400)
  }
  if (!body.category) {
    return json({ error: 'Falta la categoría.' }, 400)
  }

  const proModel = env.GEMINI_PRO_MODEL || 'gemini-3.1-pro-preview'

  try {
    const prompt = buildPrompt(body.category)
    const parts: unknown[] = [{ text: prompt }]
    for (const att of body.attachments) {
      if (!att?.base64 || !att?.mimeType) continue
      parts.push({
        inline_data: { mime_type: att.mimeType, data: att.base64 },
      })
    }

    const raw = await callGemini(proModel, env.GEMINI_API_KEY, parts, 0.1)

    // Limpiar posible markdown wrapping
    const cleaned = raw
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()

    let templates: ExtractedTemplate[]
    try {
      templates = JSON.parse(cleaned)
    } catch {
      return json(
        {
          error:
            'Gemini no devolvió JSON válido. Intenta de nuevo o reduce la cantidad de modelos.',
          raw: cleaned.slice(0, 2000),
        },
        500,
      )
    }

    if (!Array.isArray(templates) || templates.length === 0) {
      return json({ error: 'No se extrajeron plantillas.' }, 500)
    }

    // Upsert en act_templates (por owner + category + act_key)
    for (const t of templates) {
      if (!t.act_key || !t.template_text) continue
      const upsertRes = await fetch(
        `${env.VITE_SUPABASE_URL}/rest/v1/act_templates`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${auth.token}`,
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            owner_id: auth.userId,
            category: body.category,
            act_key: t.act_key,
            act_label: t.act_label || t.act_key,
            template_text: t.template_text,
            placeholders: t.placeholders || [],
            updated_at: new Date().toISOString(),
          }),
        },
      )
      if (!upsertRes.ok) {
        const errText = await upsertRes.text().catch(() => '')
        throw new Error(
          `Error guardando plantilla "${t.act_key}": ${upsertRes.status} ${errText}`,
        )
      }
    }

    return json({
      templates: templates.map((t) => ({
        act_key: t.act_key,
        act_label: t.act_label,
        placeholders: t.placeholders,
      })),
      count: templates.length,
    })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
}
