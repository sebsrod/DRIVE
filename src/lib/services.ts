// Catálogo de servicios para las Propuestas de Servicios.
// Cada servicio define una descripción base que se carga en el formulario;
// el usuario puede editarla antes de generar la propuesta.
//
// Hay dos tipos de "sub-servicios":
//   - subServices (excluyentes): el usuario elige UNO. Ej: Acta de Asamblea
//     puede ser de Aumento de Capital, Nombramiento de Junta, etc.
//   - additiveSubServices (complementarios): el usuario marca varios y
//     cada uno aporta sus propias horas, costo por hora y gasto sugerido.
//     Ej: al constituir una compañía se puede sumar Registro de Libros,
//     R.I.F. y Inscripciones ante organismos.

export interface SubService {
  key: string
  label: string
  description: string
}

export interface AdditiveSubService {
  key: string
  label: string
  description: string
  suggestedExpense: number | null
}

export interface ServiceDef {
  key: string
  label: string
  description: string
  subServices: SubService[] | null
  additiveSubServices?: AdditiveSubService[]
}

export const SERVICES: ServiceDef[] = [
  {
    key: 'acta_asamblea',
    label: 'Acta de Asamblea',
    description:
      'Redacción y tramitación de Acta de Asamblea de Accionistas o Socios para la formalización de las decisiones adoptadas por la sociedad. Comprende la revisión de los estatutos vigentes, la elaboración del documento, su inscripción ante el Registro Mercantil correspondiente y la entrega del acta debidamente registrada al cliente.',
    subServices: [
      {
        key: 'aumento_capital',
        label: 'Aumento de Capital',
        description:
          'Redacción y registro de Acta de Asamblea de Accionistas para el aumento del capital social de la compañía. Incluye el análisis de la situación patrimonial actual, la revisión del cumplimiento de los requisitos legales, la elaboración del acta con la nueva composición accionaria, su inscripción ante el Registro Mercantil correspondiente y la publicación que en derecho corresponda.',
      },
      {
        key: 'nombramiento_junta_directiva',
        label: 'Nombramiento de Junta Directiva',
        description:
          'Redacción y registro de Acta de Asamblea para la designación, ratificación o sustitución de los miembros de la Junta Directiva de la compañía. Comprende la elaboración del documento con los nombramientos acordados por los socios o accionistas, su inscripción ante el Registro Mercantil y la entrega del acta debidamente registrada.',
      },
      {
        key: 'venta_acciones',
        label: 'Venta de Acciones',
        description:
          'Asesoría, redacción y tramitación del Acta de Asamblea para formalizar la venta o cesión de acciones entre accionistas o a terceros. Incluye la verificación de las cláusulas estatutarias relativas al derecho de preferencia, la elaboración del documento de cesión, el acta de asamblea correspondiente y su inscripción ante el Registro Mercantil.',
      },
      {
        key: 'extension_duracion',
        label: 'Extensión de Duración',
        description:
          'Redacción y registro de Acta de Asamblea para prorrogar el plazo de duración de la compañía antes de su vencimiento. Comprende la revisión de los estatutos vigentes, la elaboración del acta con la nueva fecha de duración aprobada por los socios y su inscripción ante el Registro Mercantil correspondiente.',
      },
      {
        key: 'reforma_estatutos',
        label: 'Reforma de Estatutos',
        description:
          'Redacción y registro de Acta de Asamblea para la modificación parcial o total de los estatutos sociales de la compañía. Incluye el estudio del texto vigente, la propuesta y redacción de las cláusulas a reformar, la elaboración del acta de asamblea y su inscripción ante el Registro Mercantil correspondiente.',
      },
      {
        key: 'otros_actos',
        label: 'Otros Actos',
        description: '',
      },
    ],
  },
  {
    key: 'constitucion_compania',
    label: 'Constitución de Compañía',
    description:
      'Constitución de sociedad mercantil ante el Registro Mercantil. Comprende la asesoría sobre el tipo societario más conveniente (Compañía Anónima, Sociedad de Responsabilidad Limitada u otra figura), la reserva de denominación, la redacción del documento constitutivo y los estatutos sociales y la inscripción definitiva ante el Registro Mercantil correspondiente.',
    subServices: null,
    additiveSubServices: [
      {
        key: 'registro_libros',
        label: 'Registro de Libros',
        description:
          'Adquisición y habilitación de los libros legales obligatorios de la compañía: Libro Diario, Libro Mayor, Libro de Inventario y Balances, Libro de Accionistas y Libro de Actas de Asambleas, los cuales serán sellados ante el Registro Mercantil correspondiente para ser usados conforme a la legislación mercantil vigente.',
        suggestedExpense: 350,
      },
      {
        key: 'rif',
        label: 'Registro de Información Fiscal (R.I.F.)',
        description:
          'Tramitación e inscripción de la compañía en el Registro Único de Información Fiscal (R.I.F.) ante el Servicio Nacional Integrado de Administración Aduanera y Tributaria (SENIAT). Comprende la preparación y consignación de los recaudos exigidos y la entrega del certificado de R.I.F. de la sociedad.',
        suggestedExpense: 100,
      },
      {
        key: 'inscripciones_organismos',
        label: 'Inscripciones ante Entes y Organismos Recaudadores',
        description:
          'Inscripción de la compañía ante los entes y organismos recaudadores requeridos para su funcionamiento, entre ellos el Instituto Venezolano de los Seguros Sociales (I.V.S.S.), el Régimen Prestacional de Empleo, el Banco Nacional de Vivienda y Hábitat (BANAVIH), el Instituto Nacional de Capacitación y Educación Socialista (INCES) y el Registro Nacional de Empresas y Establecimientos. Incluye la elaboración de los formatos correspondientes, su consignación ante cada organismo y el seguimiento del trámite.',
        suggestedExpense: 400,
      },
    ],
  },
  {
    key: 'registro_marca',
    label: 'Registro de Marca',
    description:
      'Registro de signo distintivo (marca, lema o denominación comercial) ante el Servicio Autónomo de la Propiedad Intelectual (S.A.P.I.). Incluye la búsqueda fonética y figurativa de antecedentes, la clasificación niceana del signo, la elaboración y presentación de la solicitud, así como el seguimiento del expediente hasta la concesión del registro y la entrega del certificado correspondiente.',
    subServices: null,
  },
  {
    key: 'asesoria_legal',
    label: 'Asesoría Legal',
    description:
      'Asesoría jurídica integral en materia mercantil, civil, laboral o administrativa. Comprende el estudio del caso planteado, el análisis de la documentación aportada, la emisión de opiniones jurídicas, la elaboración de recomendaciones legales y el acompañamiento al cliente en la toma de decisiones.',
    subServices: null,
  },
  {
    key: 'otros_servicios',
    label: 'Otros Servicios',
    description: '',
    subServices: null,
  },
]

export function findService(key: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.key === key)
}

export function findSubService(
  serviceKey: string,
  subKey: string,
): SubService | undefined {
  return findService(serviceKey)?.subServices?.find((s) => s.key === subKey)
}

export function serviceLabel(serviceKey: string, subKey?: string | null): string {
  const service = findService(serviceKey)
  if (!service) return serviceKey
  if (subKey) {
    const sub = service.subServices?.find((s) => s.key === subKey)
    if (sub) return `${service.label} — ${sub.label}`
  }
  return service.label
}

// Devuelve el título legible de una propuesta, manejando tanto el
// nuevo formato multi-selección (sub_services) como el legacy de un
// solo sub_service.
export interface ProposalLabelLike {
  service_type: string
  sub_service: string | null
  sub_services?: { key: string; label: string }[] | null
}

export function proposalServiceLabel(p: ProposalLabelLike): string {
  const svc = findService(p.service_type)
  if (!svc) return p.service_type
  const list = p.sub_services ?? []
  if (list.length === 1) {
    return `${svc.label} — ${list[0].label}`
  }
  if (list.length > 1) {
    return svc.label
  }
  // legacy
  if (p.sub_service) {
    const sub = svc.subServices?.find((s) => s.key === p.sub_service)
    if (sub) return `${svc.label} — ${sub.label}`
  }
  return svc.label
}
