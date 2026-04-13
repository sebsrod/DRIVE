// Catálogo de servicios para las Propuestas de Servicios.
// Cada servicio define una descripción base que se carga en el formulario;
// el usuario puede editarla antes de generar la propuesta.

export interface SubService {
  key: string
  label: string
  description: string
}

export interface ServiceDef {
  key: string
  label: string
  description: string
  subServices: SubService[] | null
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
      'Constitución de sociedad mercantil ante el Registro Mercantil. Comprende la asesoría sobre el tipo societario más conveniente (Compañía Anónima, Sociedad de Responsabilidad Limitada u otra figura), la reserva de denominación, la redacción del documento constitutivo y los estatutos sociales, la tramitación del Registro Único de Información Fiscal (R.I.F.) y la inscripción definitiva ante el Registro Mercantil correspondiente.',
    subServices: null,
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
