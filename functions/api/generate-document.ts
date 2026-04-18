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
  position?: string
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
    board_duration?: string | null
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
  writingStyle?: string | null
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

    case 'documento_constitutivo': {
      // Parsear accionistas y representantes que llegan como JSON string
      let cShareholders: Array<{
        name: string; cedula: string; civilStatus: string;
        domicile: string; percentage: string
      }> = []
      if (typeof p.cShareholders === 'string') {
        try { cShareholders = JSON.parse(p.cShareholders as string) } catch { /* */ }
      } else if (Array.isArray(p.cShareholders)) {
        cShareholders = p.cShareholders as typeof cShareholders
      }
      cShareholders = cShareholders.filter((sh) => sh?.name?.trim())

      let cReps: Array<{ name: string; cedula: string; position: string }> = []
      if (typeof p.cReps === 'string') {
        try { cReps = JSON.parse(p.cReps as string) } catch { /* */ }
      } else if (Array.isArray(p.cReps)) {
        cReps = p.cReps as typeof cReps
      }
      cReps = cReps.filter((r) => r?.name?.trim())

      const cLines: string[] = [
        'Tipo de documento: DOCUMENTO CONSTITUTIVO DE COMPAÑÍA',
        `Denominación social: ${s('companyName')}`,
        `Objeto social (descripción breve del usuario, la IA debe ampliar con detalle jurídico): ${s('businessPurpose')}`,
        `Domicilio: ${s('companyDomicile')}`,
        `Registro Mercantil de inscripción: ${s('targetRegistry')}`,
        `Capital suscrito: ${s('capitalSuscrito')}`,
        `Capital pagado: ${s('capitalPagado')}`,
        `Duración: ${s('companyDuration') || '30 años'}`,
        `Tipo de representación: ${s('representationType') || 'separada'}`,
      ]

      if (cShareholders.length) {
        cLines.push('')
        cLines.push('Accionistas fundadores:')
        for (const sh of cShareholders) {
          cLines.push(
            `  - ${sh.name}, C.I. ${sh.cedula}, ${sh.civilStatus || 'N/D'}, domiciliado en ${sh.domicile || 'N/D'} — ${sh.percentage}%`,
          )
        }
      }

      if (cReps.length) {
        cLines.push('')
        cLines.push('Administración de la sociedad:')
        for (const r of cReps) {
          cLines.push(`  - ${r.position || 'Representante'}: ${r.name} (C.I. ${r.cedula})`)
        }
      }

      if (s('comisarioName')) {
        cLines.push('')
        cLines.push('Comisario:')
        cLines.push(`  - Nombre: ${s('comisarioName')}`)
        if (s('comisarioCedula')) cLines.push(`  - Cédula: ${s('comisarioCedula')}`)
        if (s('comisarioColegio')) cLines.push(`  - Colegio: ${s('comisarioColegio')}`)
        if (s('comisarioCarnet')) cLines.push(`  - N° de carnet: ${s('comisarioCarnet')}`)
      }

      if (s('notaryPresenter')) {
        cLines.push('')
        cLines.push(
          `Persona autorizada para presentar el documento ante el Registro Mercantil: ${s('notaryPresenter')}`,
        )
      }

      cLines.push('')
      cLines.push(
        'Redacta un Documento Constitutivo y Estatutos Sociales completo conforme al Código de Comercio venezolano. ' +
        'Incluye: encabezado, denominación, domicilio, objeto social (ampliado a partir de la descripción breve del usuario), ' +
        'duración, capital social (suscrito y pagado), accionistas con sus datos completos, ' +
        'cláusulas de administración y representación, ' +
        'funciones de la Junta Directiva, atribuciones de cada cargo, ' +
        'facultades según el tipo de representación indicado, ' +
        'Comisario, cláusulas sobre Asambleas, ejercicio económico, ' +
        'distribución de utilidades, disolución y liquidación, y disposiciones transitorias (primera Junta Directiva y Comisario). ' +
        'Incluye al final la cláusula que autoriza al presentante para la inscripción ante el Registro Mercantil. ' +
        'Usa cláusulas numeradas en español formal jurídico venezolano.',
      )

      return cLines.join('\n')
    }

    case 'acta_asamblea': {
      // selectedActs puede llegar como arreglo (cuando el frontend lo pasa
      // así) o como string JSON (patrón actual en GenerateDocumentModal)
      let selectedActs: string[] = []
      if (typeof p.selectedActs === 'string') {
        try {
          selectedActs = JSON.parse(p.selectedActs as string)
        } catch {
          selectedActs = []
        }
      } else if (Array.isArray(p.selectedActs)) {
        selectedActs = p.selectedActs as string[]
      }

      // Miembros de JD ingresados para un nombramiento (dinámica)
      let jdMembers: Array<{ name: string; cedula: string; position: string }> = []
      if (typeof p.jdMembers === 'string') {
        try {
          jdMembers = JSON.parse(p.jdMembers as string)
        } catch {
          jdMembers = []
        }
      } else if (Array.isArray(p.jdMembers)) {
        jdMembers = p.jdMembers as Array<{ name: string; cedula: string; position: string }>
      }
      jdMembers = jdMembers.filter((m) => m?.name?.trim())

      const lines: string[] = [
        'Tipo de documento: ACTA DE ASAMBLEA',
        `Tipo de asamblea: ${s('meetingType') || 'ordinaria'}`,
        `Fecha de la asamblea: ${s('meetingDate')}`,
      ]

      if (selectedActs.length) {
        lines.push(`Actos a tratar: ${selectedActs.join('; ')}`)
      }

      // Nueva Junta Directiva (nombramiento)
      if (jdMembers.length) {
        lines.push('')
        lines.push('Nuevos miembros de la Junta Directiva a nombrar:')
        for (const m of jdMembers) {
          const parts = [
            m.position ? `${m.position}: ` : '',
            m.name,
            m.cedula ? ` (C.I. ${m.cedula})` : '',
          ].join('')
          lines.push(`  - ${parts}`)
        }
        if (s('newBoardDuration')) {
          lines.push(`Duración del nuevo período: ${s('newBoardDuration')}`)
        }
      }

      // Ratificación: reutiliza los datos de la empresa
      if (selectedActs.includes('Ratificación de Junta Directiva')) {
        lines.push('')
        lines.push(
          'Para la RATIFICACIÓN de la Junta Directiva, utiliza las mismas personas, con los mismos cargos y por la misma duración indicados en la sección DATOS DE LA EMPRESA. No inventes miembros nuevos.',
        )
      }

      // Comisario
      if (s('comisarioName')) {
        lines.push('')
        lines.push('Datos del Comisario a designar:')
        lines.push(`  - Nombre: ${s('comisarioName')}`)
        if (s('comisarioCedula')) lines.push(`  - Cédula: ${s('comisarioCedula')}`)
        if (s('comisarioColegio'))
          lines.push(`  - Colegio en el que está inscrito: ${s('comisarioColegio')}`)
        if (s('comisarioCarnet'))
          lines.push(`  - N° de carnet: ${s('comisarioCarnet')}`)
      }

      lines.push('')
      lines.push(`Orden del día: ${s('agenda')}`)
      lines.push(`Decisiones adoptadas: ${s('resolutions')}`)
      lines.push(
        `Representación / asistentes: ${s('attendees') || '(extraer de los datos de la empresa o documentos fundamentales)'}`,
      )
      lines.push('')
      if (s('notaryPresenter')) {
        lines.push('')
        lines.push(
          `Persona que participa el acta (firma al inicio y se autoriza al final para presentar ante el Registro Mercantil): ${s('notaryPresenter')}`,
        )
      }

      lines.push(
        'Redacta un Acta de Asamblea de Accionistas/Socios según el Código de Comercio venezolano. Incluye encabezado con identificación de la sociedad, convocatoria, quórum, desarrollo de la asamblea con discusión del orden del día, decisiones adoptadas, cierre y firma de los asistentes. Al final incluye la cláusula de autorización al presentante para la inscripción ante el Registro Mercantil. Usa un estilo formal notarial.',
      )
      return lines.filter((l) => l.length > 0).join('\n')
    }

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
      client.board_duration
        ? `Duración de la Junta Directiva: ${client.board_duration}`
        : null,
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
          'Junta Directiva / Representantes legales:',
          ...reps.map(
            (r) =>
              `  - ${r.position ? `${r.position}: ` : ''}${r.name}${
                r.cedula ? ` (C.I. ${r.cedula})` : ''
              }`,
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

  // Guía de estilo del usuario (persistida en BD)
  const styleSection = body.writingStyle?.trim()
    ? [
        '',
        '=== GUÍA DE ESTILO DEL ABOGADO ===',
        body.writingStyle.trim(),
        '=== FIN DE LA GUÍA DE ESTILO ===',
        'IMPORTANTE: Adapta el documento al estilo descrito arriba, respetando las fórmulas, estructura y convenciones del abogado autor.',
      ].join('\n')
    : ''

  return [
    'Eres un abogado venezolano experto en redacción de documentos legales.',
    'Debes redactar un documento completo, formal, listo para imprimir, con estructura tradicional venezolana (encabezado, identificación de las partes, exposición, cláusulas numeradas, cierre, fecha y firma).',
    'Usa lenguaje jurídico formal en español de Venezuela. No uses markdown ni comentarios fuera del documento. Tu respuesta debe ser ÚNICAMENTE el texto del documento.',
    '',
    typeInstructions(documentType, params),
    '',
    '=== DATOS DEL CLIENTE (FUENTE PRIMARIA) ===',
    clientLines,
    companySection,
    '',
    '=== DATOS DEL ABOGADO ===',
    authorLines,
    styleSection,
    ocrSection,
    '',
    'PRIORIDAD DE DATOS: Los datos estructurados del cliente (sección DATOS DEL CLIENTE y DATOS DE LA EMPRESA) son la fuente primaria y autoritativa. Úsalos textualmente. Solo recurre a los documentos anexos (PDFs y texto OCR) para completar información que NO esté en los datos estructurados.',
    extra,
  ].join('\n')
}

export async function onRequestPost(context: Context): Promise<Response> {
  const { request, env } = context

  if (!env.GEMINI_API_KEY) {
    const keys = Object.keys(env).filter((k) => !k.startsWith('__')).join(', ')
    return json(
      {
        error: `GEMINI_API_KEY no está configurada. Variables disponibles: [${keys || 'ninguna'}]. Verifica el nombre exacto en Cloudflare → Settings → Variables and Secrets.`,
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
