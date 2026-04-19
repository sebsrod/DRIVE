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
    total_shares?: number | null
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
  templates?: Array<{
    act_key: string
    act_label: string
    template_text: string
    placeholders: string[]
  }>
}

interface Context {
  request: Request
  env: Env
}

const DEFAULT_PRO_MODEL = 'gemini-2.5-pro'
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
          `Persona autorizada para presentar el documento ante el Registro Mercantil: ${s('notaryPresenter')}${
            s('notaryPresenterCedula')
              ? `, C.I. ${s('notaryPresenterCedula')}`
              : ''
          }`,
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
      // Helper para parsear arreglos que pueden venir como JSON string
      const parseArray = <T>(raw: unknown): T[] => {
        if (Array.isArray(raw)) return raw as T[]
        if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? (parsed as T[]) : []
          } catch {
            return []
          }
        }
        return []
      }

      const selectedActs = parseArray<string>(p.selectedActs)
      const jdMembers = parseArray<{
        name: string
        cedula: string
        position: string
      }>(p.jdMembers).filter((m) => m?.name?.trim())
      const reformaClauses = parseArray<{
        numero: string
        textoNuevo: string
      }>(p.reformaClauses).filter(
        (c) => c?.numero?.trim() || c?.textoNuevo?.trim(),
      )
      const disolucionFacultades = parseArray<string>(p.disolucionFacultades)
      const attendingIdxs = parseArray<number>(p.attendingIdxs)
      const balanceYears = parseArray<number>(p.balanceYears)

      // Formatea "Nombre|Cédula" → "Nombre (C.I. Cédula)"
      const parsePerson = (raw: string) => {
        if (!raw) return ''
        const [name, cedula] = raw.split('|')
        return cedula ? `${name} (C.I. ${cedula})` : name
      }

      const lines: string[] = ['Tipo de documento: ACTA DE ASAMBLEA']

      // ---------- Datos generales de la asamblea ----------
      lines.push(`Tipo de asamblea: ${s('meetingType') || 'ordinaria'}`)
      if (s('meetingDate')) lines.push(`Fecha: ${s('meetingDate')}`)
      if (s('meetingTime')) lines.push(`Hora: ${s('meetingTime')}`)
      if (s('meetingPlace')) {
        lines.push(`Lugar: ${s('meetingPlace')}`)
      } else {
        lines.push('Lugar: (usa el domicilio de la empresa indicado en DATOS DE LA EMPRESA)')
      }
      const convocation = s('convocationType')
      if (convocation === 'universal') {
        lines.push('Convocatoria: ASAMBLEA UNIVERSAL, sin previa convocatoria, con la totalidad de los accionistas presentes.')
      } else if (convocation === 'prensa') {
        lines.push('Convocatoria: realizada mediante publicación en prensa conforme a los estatutos.')
      } else if (convocation === 'carta') {
        lines.push('Convocatoria: realizada mediante carta dirigida a cada accionista.')
      }

      // ---------- Presidencia y secretaría ----------
      if (s('assemblyPresident')) {
        lines.push(
          `Presidente de la asamblea: ${parsePerson(s('assemblyPresident'))}`,
        )
      }
      if (s('assemblySecretary')) {
        lines.push(
          `Secretario de la asamblea: ${parsePerson(s('assemblySecretary'))}`,
        )
      }

      // ---------- Quórum ----------
      if (attendingIdxs.length > 0) {
        lines.push('')
        lines.push(
          `Accionistas presentes: ${attendingIdxs.length} accionistas según los índices ${JSON.stringify(attendingIdxs)} de la lista en DATOS DE LA EMPRESA. Verifica sus porcentajes y calcula el quórum total en el encabezado del acta.`,
        )
      }

      // ---------- Votación y lectura ----------
      const votingType = s('votingType')
      if (votingType === 'unanime') {
        lines.push('Votación: UNÁNIME.')
      } else if (votingType === 'mayoria') {
        lines.push(
          `Votación: POR MAYORÍA${s('votingPercentage') ? ` (${s('votingPercentage')}% a favor)` : ''}.`,
        )
      } else if (votingType === 'disidencia') {
        lines.push(
          `Votación: CON DISIDENCIA${s('votingPercentage') ? ` (${s('votingPercentage')}% a favor)` : ''}.`,
        )
      }
      if (s('actaReading') === 'true') {
        lines.push(
          'Incluir al final del acta constancia expresa de que se dio lectura al acta y fue aprobada por los presentes.',
        )
      }

      // ---------- Actos a tratar ----------
      if (selectedActs.length) {
        lines.push('')
        lines.push(`Actos a tratar: ${selectedActs.join('; ')}`)
      }

      // ---------- Nombramiento de Junta Directiva ----------
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

      // ---------- Ratificación de JD ----------
      if (selectedActs.includes('Ratificación de Junta Directiva')) {
        lines.push('')
        lines.push(
          'Para la RATIFICACIÓN de la Junta Directiva, utiliza las mismas personas, con los mismos cargos y por la misma duración indicados en la sección DATOS DE LA EMPRESA. No inventes miembros nuevos.',
        )
      }

      // ---------- Comisario ----------
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

      // ---------- Aprobación de balances ----------
      if (
        balanceYears.length > 0 ||
        selectedActs.includes('Aprobación de balances y estados financieros')
      ) {
        lines.push('')
        if (balanceYears.length > 0) {
          lines.push(
            `Aprobación de balances y estados financieros — ejercicio(s) económico(s) a aprobar: ${balanceYears
              .sort()
              .join(', ')}`,
          )
        } else {
          lines.push(
            'Aprobación de balances y estados financieros — el usuario no especificó los años; redacta el punto pidiendo que el usuario complete los ejercicios.',
          )
        }
      }

      // ---------- Aumento de capital ----------
      if (s('aumentoNewCapital') || s('aumentoPrevCapital')) {
        lines.push('')
        lines.push('Aumento de capital social:')
        if (s('aumentoPrevCapital'))
          lines.push(`  - Capital anterior: ${s('aumentoPrevCapital')}`)
        if (s('aumentoNewCapital'))
          lines.push(`  - Capital nuevo: ${s('aumentoNewCapital')}`)
        if (s('aumentoModalidad'))
          lines.push(`  - Modalidad: ${s('aumentoModalidad')}`)
        if (s('aumentoValorNominal'))
          lines.push(`  - Valor nominal por acción: ${s('aumentoValorNominal')}`)
        if (s('aumentoRenunciaPreferencia'))
          lines.push(
            `  - Derecho de preferencia: ${s('aumentoRenunciaPreferencia')}`,
          )
      }

      // ---------- Disminución de capital ----------
      if (s('disminucionNewCapital') || s('disminucionPrevCapital')) {
        lines.push('')
        lines.push('Disminución de capital social:')
        if (s('disminucionPrevCapital'))
          lines.push(`  - Capital anterior: ${s('disminucionPrevCapital')}`)
        if (s('disminucionNewCapital'))
          lines.push(`  - Capital nuevo: ${s('disminucionNewCapital')}`)
        if (s('disminucionCausa'))
          lines.push(`  - Causa: ${s('disminucionCausa')}`)
      }

      // ---------- Dividendos ----------
      if (s('dividendosMonto')) {
        lines.push('')
        lines.push('Distribución de dividendos:')
        lines.push(`  - Monto total: ${s('dividendosMonto')}`)
        if (s('dividendosEjercicio'))
          lines.push(`  - Ejercicio económico: ${s('dividendosEjercicio')}`)
        if (s('dividendosFecha'))
          lines.push(`  - Fecha de pago: ${s('dividendosFecha')}`)
      }

      // ---------- Venta / cesión de acciones ----------
      if (s('ventaCompradorNombre') || s('ventaVendedor')) {
        lines.push('')
        lines.push('Venta / cesión de acciones:')
        if (s('ventaVendedor'))
          lines.push(`  - Vendedor: ${parsePerson(s('ventaVendedor'))}`)
        if (s('ventaCompradorNombre'))
          lines.push(`  - Comprador: ${s('ventaCompradorNombre')}`)
        if (s('ventaCompradorCedula'))
          lines.push(`    Cédula del comprador: ${s('ventaCompradorCedula')}`)
        if (s('ventaCompradorEstadoCivil'))
          lines.push(`    Estado civil: ${s('ventaCompradorEstadoCivil')}`)
        if (s('ventaCompradorDomicilio'))
          lines.push(`    Domicilio: ${s('ventaCompradorDomicilio')}`)
        if (s('ventaNumeroAcciones'))
          lines.push(`  - N° de acciones: ${s('ventaNumeroAcciones')}`)
        if (s('ventaPrecio'))
          lines.push(`  - Precio: ${s('ventaPrecio')}`)
        if (s('ventaRenunciaPreferencia'))
          lines.push(
            `  - Derecho de preferencia de los demás accionistas: ${s('ventaRenunciaPreferencia')}`,
          )
      }

      // ---------- Reforma parcial de estatutos ----------
      if (reformaClauses.length) {
        lines.push('')
        lines.push('Reforma parcial de estatutos (cláusulas a reformar):')
        for (const c of reformaClauses) {
          lines.push(`  - Cláusula ${c.numero || '(sin numerar)'}:`)
          if (c.textoNuevo)
            lines.push(
              `    Redacta la nueva cláusula en estilo estatutario a partir de esta descripción: ${c.textoNuevo}`,
            )
        }
      }

      // ---------- Cambio de domicilio ----------
      if (s('cambioDomicilioNuevo')) {
        lines.push('')
        lines.push(
          `Cambio de domicilio social — nueva dirección: ${s('cambioDomicilioNuevo')}`,
        )
      }

      // ---------- Cambio de objeto social ----------
      if (s('cambioObjetoNuevo')) {
        lines.push('')
        lines.push(
          `Modificación del objeto social — nuevo objeto (redáctalo en estilo estatutario): ${s('cambioObjetoNuevo')}`,
        )
      }

      // ---------- Prórroga de duración ----------
      if (s('prorrogaNueva')) {
        lines.push('')
        lines.push(
          `Prórroga de duración de la compañía: ${s('prorrogaNueva')}`,
        )
      }

      // ---------- Disolución y liquidación ----------
      if (s('disolucionLiquidadorNombre')) {
        lines.push('')
        lines.push('Disolución y liquidación:')
        lines.push(`  - Liquidador: ${s('disolucionLiquidadorNombre')}`)
        if (s('disolucionLiquidadorCedula'))
          lines.push(`    Cédula: ${s('disolucionLiquidadorCedula')}`)
        if (disolucionFacultades.length)
          lines.push(
            `  - Facultades del liquidador: ${disolucionFacultades.join('; ')}`,
          )
      }

      // ---------- Fusión ----------
      if (s('fusionAbsorbente') || s('fusionAbsorbida')) {
        lines.push('')
        lines.push('Fusión:')
        if (s('fusionAbsorbente'))
          lines.push(`  - Sociedad absorbente: ${s('fusionAbsorbente')}`)
        if (s('fusionAbsorbida'))
          lines.push(`  - Sociedad absorbida: ${s('fusionAbsorbida')}`)
        if (s('fusionFechaEfectiva'))
          lines.push(`  - Fecha efectiva: ${s('fusionFechaEfectiva')}`)
      }

      // ---------- Transformación societaria ----------
      if (s('transformacionTipoNuevo')) {
        lines.push('')
        lines.push(
          `Transformación societaria: ${s('transformacionTipoNuevo')}`,
        )
      }

      // ---------- Orden del día / decisiones / asistentes libres ----------
      lines.push('')
      if (s('agenda')) lines.push(`Orden del día: ${s('agenda')}`)
      if (s('resolutions'))
        lines.push(`Decisiones adoptadas (resumen libre): ${s('resolutions')}`)
      if (s('attendees'))
        lines.push(`Notas adicionales sobre asistentes: ${s('attendees')}`)

      // ---------- Persona que participa ----------
      if (s('notaryPresenter')) {
        lines.push('')
        lines.push(
          `Persona que participa el acta (firma al inicio y se autoriza al final para presentar ante el Registro Mercantil): ${s('notaryPresenter')}${
            s('notaryPresenterCedula')
              ? `, C.I. ${s('notaryPresenterCedula')}`
              : ''
          }`,
        )
      }

      lines.push('')
      lines.push(
        'Redacta un Acta de Asamblea de Accionistas/Socios según el Código de Comercio venezolano. Estructura sugerida: (1) encabezado con fecha completa en letras, hora, lugar e identificación de la sociedad incluyendo datos de registro; (2) indicación del tipo de convocatoria y, si aplica, el texto de la misma; (3) verificación de quórum con la lista de accionistas presentes y el porcentaje total representado; (4) designación de presidente y secretario de la asamblea; (5) desarrollo de la asamblea con discusión de cada punto del orden del día y las decisiones adoptadas (usa los datos estructurados exactos de cada acto); (6) modalidad de votación; (7) lectura y aprobación del acta si corresponde; (8) cierre y firma de los asistentes; (9) cláusula final de autorización al presentante para la inscripción ante el Registro Mercantil. Usa estilo formal notarial venezolano.',
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
      client.total_shares != null
        ? `Cantidad total de acciones: ${client.total_shares}`
        : null,
      client.board_duration
        ? `Duración de la Junta Directiva: ${client.board_duration}`
        : null,
    ].filter(Boolean)

    const shareholders = client.shareholders ?? []
    const reps = client.legal_representatives ?? []
    const totalSh = Number(client.total_shares ?? 0)

    const shareholdersLines = shareholders.length
      ? [
          'Accionistas:',
          ...shareholders.map((s) => {
            const sharesCount =
              totalSh > 0
                ? Math.round((Number(s.percentage) / 100) * totalSh)
                : null
            return `  - ${s.name}${s.cedula ? ` (C.I./RIF ${s.cedula})` : ''} — ${s.percentage}%${
              sharesCount != null ? ` (${sharesCount} acciones)` : ''
            }`
          }),
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
      ].join('\n')
    : ''

  // Plantillas literales extraídas de los modelos del usuario.
  // Si existen, el modo de trabajo cambia: en vez de "genera libremente",
  // Gemini debe ENSAMBLAR las plantillas y solo rellenar los placeholders.
  const hasTemplates = (body.templates?.length ?? 0) > 0
  const templatesSection = hasTemplates
    ? [
        '',
        '=== PLANTILLAS LITERALES DEL USUARIO ===',
        'A continuación tienes plantillas textuales extraídas de documentos reales del abogado. DEBES usar estas plantillas como la base del documento. NO reescribas, NO parafrasees — copia la redacción tal como aparece y SOLO reemplaza los placeholders ({{...}}) con los datos reales proporcionados en las secciones de datos del cliente y parámetros del documento.',
        '',
        ...(body.templates ?? []).map(
          (t) =>
            `--- ${t.act_label} (${t.act_key}) ---\n${t.template_text}\n--- fin ${t.act_key} ---`,
        ),
        '',
        '=== FIN DE LAS PLANTILLAS ===',
      ].join('\n')
    : ''

  const mainInstruction = hasTemplates
    ? [
        'Eres un abogado venezolano experto en redacción de documentos legales.',
        'MODO PLANTILLA: El usuario tiene plantillas textuales literales extraídas de sus propios documentos. Tu tarea principal es ENSAMBLAR el documento usando esas plantillas tal como están escritas, sustituyendo SOLO los placeholders ({{...}}) por los datos reales del caso. Conserva absolutamente toda la redacción, fórmulas, vocabulario, estructura y puntuación de las plantillas.',
        'Si alguna sección del documento NO tiene plantilla disponible, redáctala tú siguiendo el estilo de las plantillas existentes.',
        'No uses markdown ni comentarios fuera del documento. Tu respuesta debe ser ÚNICAMENTE el texto del documento final.',
      ].join('\n')
    : [
        'Eres un abogado venezolano experto en redacción de documentos legales.',
        'Debes redactar un documento completo, formal, listo para imprimir, con estructura tradicional venezolana (encabezado, identificación de las partes, exposición, cláusulas numeradas, cierre, fecha y firma).',
        'Usa lenguaje jurídico formal en español de Venezuela. No uses markdown ni comentarios fuera del documento. Tu respuesta debe ser ÚNICAMENTE el texto del documento.',
      ].join('\n')

  return [
    mainInstruction,
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
    templatesSection,
    ocrSection,
    '',
    hasTemplates
      ? 'PRIORIDAD: Usa las PLANTILLAS LITERALES como esqueleto del documento, sustituyendo los placeholders con los DATOS DEL CLIENTE. Si faltan datos para un placeholder, déjalo como {{placeholder}} para que el usuario lo complete. Los datos estructurados del cliente son la fuente autoritativa.'
      : 'PRIORIDAD DE DATOS: Los datos estructurados del cliente (sección DATOS DEL CLIENTE y DATOS DE LA EMPRESA) son la fuente primaria y autoritativa. Úsalos textualmente. Solo recurre a los documentos anexos (PDFs y texto OCR) para completar información que NO esté en los datos estructurados.',
    extra,
  ].join('\n')
}

export async function onRequestPost(context: Context): Promise<Response> {
  const { request, env } = context

  if (!env.GEMINI_API_KEY) {
    const keys = Object.keys(env).filter((k) => !k.startsWith('__')).join(', ')
    return json(
      {
        error: `GEMINI_API_KEY no está configurada (o su valor está vacío). Variables disponibles en runtime: [${keys || 'ninguna'}]. Verifica el valor en Cloudflare → Settings → Variables and Secrets.`,
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
