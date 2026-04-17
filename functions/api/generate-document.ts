// Cloudflare Pages Function: /api/generate-document
//
// Recibe los datos del cliente, del abogado, el tipo de documento a
// generar y un arreglo de adjuntos en base64 (PDFs o imágenes).
// Para cada imagen llama a Gemini Flash para hacer OCR, luego arma
// un prompt y llama a Gemini Pro para redactar el documento final.
//
// La GEMINI_API_KEY se lee de las variables de entorno de Cloudflare
// Pages (Settings → Variables and Secrets) y nunca llega al navegador.
// La autenticación del usuario se valida contra Supabase antes de
// invocar a Gemini para evitar que cualquiera use la quota.

interface Env {
  GEMINI_API_KEY: string
  // Reutilizamos las mismas vars que ya usa el frontend
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
  // Opcional: permite override del nombre del modelo sin redeploy
  GEMINI_PRO_MODEL?: string
  GEMINI_FLASH_MODEL?: string
}

interface Attachment {
  filename: string
  mimeType: string
  base64: string
}

interface Shareholder {
  name: string
  cedula: string
  percentage: number
}

interface LegalRepresentative {
  name: string
  cedula: string
}

interface RequestBody {
  documentType:
    | 'poder'
    | 'arrendamiento'
    | 'laboral'
    | 'acta_asamblea'
    | string
  params: Record<string, unknown>
  client: {
    name: string
    cedula_rif: string | null
    phone: string | null
    address: string | null
    client_type?: 'natural' | 'juridica'
    capital_social?: string | null
    registry_office?: string | null
    registry_date?: string | null
    registry_number?: string | null
    registry_volume?: string | null
    shareholders?: Shareholder[]
    legal_representatives?: LegalRepresentative[]
  }
  author: {
    full_name: string | null
    ipsa_number: string | null
    phone: string | null
    email: string | null
  }
  officeAddress: string
  attachments: Attachment[]
}

interface Context {
  request: Request
  env: Env
}

const DEFAULT_PRO_MODEL = 'gemini-3.1-pro'
const DEFAULT_FLASH_MODEL = 'gemini-2.5-flash'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function verifyAuth(request: Request, env: Env): Promise<boolean> {
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

async function callGemini(
  model: string,
  apiKey: string,
  parts: unknown[],
  temperature = 0.2,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature,
        maxOutputTokens: 8192,
      },
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
  if (!text) {
    throw new Error('Gemini devolvió una respuesta vacía')
  }
  return text
}

async function ocrImage(
  apiKey: string,
  flashModel: string,
  att: Attachment,
): Promise<string> {
  return callGemini(
    flashModel,
    apiKey,
    [
      {
        text:
          'Extrae todo el texto visible en esta imagen en español, ' +
          'preservando la estructura (párrafos, tablas, listas). ' +
          'No añadas comentarios ni explicaciones; devuelve solo el ' +
          'texto transcrito tal como aparece.',
      },
      { inline_data: { mime_type: att.mimeType, data: att.base64 } },
    ],
    0.0,
  )
}

function typeInstructions(type: string, p: Record<string, unknown>): string {
  const s = (k: string) => (p[k] ? String(p[k]) : '')

  switch (type) {
    case 'poder':
      return [
        'Tipo de documento: PODER',
        `Alcance: ${s('powerType') || 'general'}`,
        `Apoderado: ${s('granteeName')}`,
        `Cédula del apoderado: ${s('granteeCedula')}`,
        `Facultades: ${s('powers') || 'Facultades generales de administración y disposición conforme al Código Civil venezolano.'}`,
        '',
        'Redacta un Poder en formato notarial venezolano, con la comparecencia del poderdante, la designación del apoderado, la enumeración de facultades y el cierre formal. Usa lenguaje jurídico formal.',
      ].join('\n')

    case 'arrendamiento':
      return [
        'Tipo de documento: CONTRATO DE ARRENDAMIENTO',
        `Rol del cliente: ${s('clientRole') || 'arrendador'}`,
        `Contraparte: ${s('counterpartyName')}`,
        `Cédula/RIF de la contraparte: ${s('counterpartyCedula')}`,
        `Descripción del inmueble: ${s('propertyDescription')}`,
        `Duración: ${s('duration')}`,
        `Canon mensual: ${s('monthlyRent')} ${s('currency') || 'USD'}`,
        `Condiciones adicionales: ${s('conditions') || '(ninguna)'}`,
        '',
        'Redacta un Contrato de Arrendamiento conforme a la Ley de Regulación del Arrendamiento Inmobiliario para el Uso Comercial de Venezuela (si aplica) o a la normativa civil según el caso. Incluye identificación de las partes, objeto, canon, duración, obligaciones del arrendador y del arrendatario, cláusulas de resolución, domicilio procesal y firma. Usa cláusulas numeradas.',
      ].join('\n')

    case 'laboral':
      return [
        'Tipo de documento: CONTRATO DE TRABAJO',
        `Rol del cliente: ${s('clientRole') || 'patrono'}`,
        `Trabajador: ${s('workerName')}`,
        `Cédula del trabajador: ${s('workerCedula')}`,
        `Cargo: ${s('position')}`,
        `Salario: ${s('salary')} ${s('currency') || 'USD'}`,
        `Tipo de contrato: ${s('contractType') || 'tiempo indeterminado'}`,
        `Fecha de inicio: ${s('startDate')}`,
        `Jornada: ${s('workingHours') || 'la legalmente establecida'}`,
        '',
        'Redacta un Contrato de Trabajo conforme a la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT) de Venezuela. Incluye identificación de las partes, cargo y funciones, salario, jornada, duración, beneficios legales, obligaciones, causales de terminación y firma. Usa cláusulas numeradas.',
      ].join('\n')

    case 'acta_asamblea':
      return [
        'Tipo de documento: ACTA DE ASAMBLEA',
        `Tipo de asamblea: ${s('meetingType') || 'ordinaria'}`,
        `Fecha de la asamblea: ${s('meetingDate')}`,
        `Orden del día: ${s('agenda')}`,
        `Decisiones adoptadas: ${s('resolutions')}`,
        `Representación / asistentes: ${s('attendees') || '(extraer de los documentos fundamentales)'}`,
        '',
        'Redacta un Acta de Asamblea de Accionistas/Socios según el Código de Comercio venezolano. Incluye encabezado con identificación de la sociedad, convocatoria, quórum, desarrollo de la asamblea con discusión del orden del día, decisiones adoptadas, cierre y firma de los asistentes. Usa un estilo formal notarial.',
      ].join('\n')

    default:
      return `Tipo de documento: ${type}\n(Sin parámetros específicos)`
  }
}

function buildPrompt(body: RequestBody, ocrTexts: Record<string, string>): string {
  const { client, author, officeAddress, params, documentType } = body

  const isJuridica = client.client_type === 'juridica'
  const clientLines = [
    `Tipo: ${isJuridica ? 'Persona jurídica (sociedad mercantil)' : 'Persona natural'}`,
    `${isJuridica ? 'Razón social' : 'Nombre'}: ${client.name}`,
    client.cedula_rif
      ? `${isJuridica ? 'RIF' : 'Cédula'}: ${client.cedula_rif}`
      : null,
    client.address ? `Domicilio: ${client.address}` : null,
    client.phone ? `Teléfono: ${client.phone}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Si el cliente es persona jurídica, añadir sección con los datos
  // estructurados de la empresa para que la IA los use textualmente.
  let companySection = ''
  if (isJuridica) {
    const regLines = [
      client.registry_office
        ? `Registro Mercantil: ${client.registry_office}`
        : null,
      client.registry_date ? `Fecha de registro: ${client.registry_date}` : null,
      client.registry_number || client.registry_volume
        ? `Número / Tomo: ${client.registry_number ?? ''}${
            client.registry_volume ? ` / Tomo ${client.registry_volume}` : ''
          }`
        : null,
      client.capital_social ? `Capital social: ${client.capital_social}` : null,
    ].filter(Boolean)

    const shareholders = client.shareholders ?? []
    const reps = client.legal_representatives ?? []

    const shareholdersLines = shareholders.length
      ? [
          'Accionistas:',
          ...shareholders.map(
            (s) =>
              `  - ${s.name}${s.cedula ? ` (C.I./RIF ${s.cedula})` : ''} — ${s.percentage}%`,
          ),
        ]
      : []

    const repsLines = reps.length
      ? [
          'Representantes legales:',
          ...reps.map(
            (r) => `  - ${r.name}${r.cedula ? ` (C.I. ${r.cedula})` : ''}`,
          ),
        ]
      : []

    const blocks = [regLines.join('\n'), shareholdersLines.join('\n'), repsLines.join('\n')]
      .filter((b) => b.trim().length > 0)

    if (blocks.length > 0) {
      companySection = ['', '=== DATOS DE LA EMPRESA ===', ...blocks].join('\n')
    }
  }

  const authorLines = [
    author.full_name ? `Abogado: ${author.full_name}` : null,
    author.ipsa_number ? `I.P.S.A.: ${author.ipsa_number}` : null,
    `Despacho: ${officeAddress}`,
    author.phone ? `Teléfono: ${author.phone}` : null,
    author.email ? `Email: ${author.email}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const ocrSection = Object.keys(ocrTexts).length
    ? [
        '',
        '=== TEXTO EXTRAÍDO DE LAS IMÁGENES ANEXAS ===',
        ...Object.entries(ocrTexts).map(
          ([name, text]) => `--- ${name} ---\n${text}`,
        ),
        '=== FIN DEL TEXTO DE LAS IMÁGENES ===',
      ].join('\n')
    : ''

  const extra =
    typeof params.additionalInstructions === 'string' && params.additionalInstructions.trim()
      ? `\n\nInstrucciones adicionales del usuario:\n${String(params.additionalInstructions).trim()}`
      : ''

  return [
    'Eres un abogado venezolano experto en redacción de documentos legales.',
    'Debes redactar un documento completo, formal, listo para imprimir, con estructura tradicional venezolana (encabezado, identificación de las partes, exposición, cláusulas numeradas, cierre, fecha y firma).',
    'Usa lenguaje jurídico formal en español de Venezuela. No uses markdown ni comentarios fuera del documento. Tu respuesta debe ser ÚNICAMENTE el texto del documento.',
    '',
    typeInstructions(documentType, params),
    '',
    '=== DATOS DEL CLIENTE ===',
    clientLines,
    companySection,
    '',
    '=== DATOS DEL ABOGADO ===',
    authorLines,
    ocrSection,
    '',
    'Toma en cuenta los documentos anexos (PDFs del cliente como el documento constitutivo y el texto OCR de las imágenes anexas) para obtener los nombres, cédulas, números de registro, domicilios y cualquier otro dato exacto que debas incluir.',
    extra,
  ].join('\n')
}

export async function onRequestPost(context: Context): Promise<Response> {
  const { request, env } = context

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          'GEMINI_API_KEY no está configurada en las variables de entorno de Cloudflare Pages.',
      },
      500,
    )
  }
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    return json(
      {
        error:
          'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no están configuradas.',
      },
      500,
    )
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

  const proModel = env.GEMINI_PRO_MODEL || DEFAULT_PRO_MODEL
  const flashModel = env.GEMINI_FLASH_MODEL || DEFAULT_FLASH_MODEL

  try {
    // 1. OCR de imágenes con Flash, PDFs se pasan inline a Pro
    const ocrTexts: Record<string, string> = {}
    const pdfParts: unknown[] = []

    for (const att of body.attachments ?? []) {
      if (!att?.base64 || !att?.mimeType) continue
      if (att.mimeType.startsWith('image/')) {
        try {
          const text = await ocrImage(env.GEMINI_API_KEY, flashModel, att)
          ocrTexts[att.filename] = text
        } catch (err) {
          ocrTexts[att.filename] = `(No se pudo extraer el texto: ${(err as Error).message})`
        }
      } else if (att.mimeType === 'application/pdf') {
        pdfParts.push({
          inline_data: { mime_type: att.mimeType, data: att.base64 },
        })
      }
    }

    // 2. Armar prompt para Pro
    const prompt = buildPrompt(body, ocrTexts)
    const parts: unknown[] = [{ text: prompt }, ...pdfParts]

    // 3. Llamar a Pro
    const generated = await callGemini(proModel, env.GEMINI_API_KEY, parts, 0.2)

    return json({ text: generated })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
}
