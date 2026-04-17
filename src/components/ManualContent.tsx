// Contenido del manual de uso. Se usa en dos lugares:
//   - WelcomeModal: pop-up de bienvenida al iniciar sesión
//   - pages/Manual: tab "Manual" del sidebar

export default function ManualContent() {
  return (
    <div className="space-y-6 text-sm leading-relaxed text-slate-700">
      <section>
        <p>
          <strong>Office Drive</strong> es una herramienta para organizar los
          expedientes y documentos de tus clientes y para generar{' '}
          <strong>Propuestas de Servicios Profesionales</strong> con plantillas
          predefinidas.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-base font-bold text-slate-900">
          Secciones principales
        </h3>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Ejercicio privado:</strong> tus clientes individuales. Solo tú
            puedes verlos y editar sus archivos.
          </li>
          <li>
            <strong>Ejercicio en equipo:</strong> clientes compartidos con todo el
            despacho. Cualquier colaborador del equipo puede verlos.
          </li>
          <li>
            <strong>Perfil:</strong> tus datos como abogado (nombre completo,
            teléfono, número de I.P.S.A.). Aparecen en el encabezado de cada
            propuesta.
          </li>
          <li>
            <strong>Manual:</strong> esta guía, siempre accesible desde el menú
            lateral.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-base font-bold text-slate-900">
          Cómo agregar un cliente
        </h3>
        <ol className="ml-5 list-decimal space-y-1">
          <li>
            Entra a <em>Ejercicio privado</em> o <em>Ejercicio en equipo</em>.
          </li>
          <li>
            Pulsa el botón <strong>+ Agregar cliente</strong>.
          </li>
          <li>
            Llena los datos del cliente (solo el nombre es obligatorio; cédula
            o RIF, teléfono y dirección son opcionales).
          </li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 text-base font-bold text-slate-900">
          Cómo organizar los archivos de un cliente
        </h3>
        <ol className="ml-5 list-decimal space-y-1">
          <li>Pulsa sobre la tarjeta del cliente para entrar a su expediente.</li>
          <li>
            Usa <strong>+ Nueva carpeta</strong> para crear subcarpetas (por
            ejemplo: Documentos personales, Estatutos, Correspondencia).
          </li>
          <li>
            Usa <strong>Subir archivo</strong> para subir documentos directamente
            a la raíz del cliente o dentro de una subcarpeta.
          </li>
          <li>
            Para descargar un archivo, pulsa <strong>Descargar</strong>; el
            propietario del archivo puede eliminarlo con el botón rojo.
          </li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 text-base font-bold text-slate-900">
          Cómo generar una Propuesta de Servicios
        </h3>
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            Entra al cliente y pulsa el botón verde{' '}
            <strong>+ Generar propuesta</strong>.
          </li>
          <li>
            Selecciona el <strong>Tipo de servicio</strong>:
            <ul className="ml-5 mt-1 list-disc text-xs">
              <li>
                <em>Acta de Asamblea</em>: marca uno o varios actos (Aumento de
                Capital, Nombramiento de Junta Directiva, Venta de Acciones,
                Extensión de Duración, Reforma de Estatutos, Otros Actos). Todos
                los marcados se incluirán en la propuesta con su descripción.
              </li>
              <li>
                <em>Constitución de Compañía</em>: además de los honorarios
                principales, puedes marcar servicios complementarios como
                Registro de Libros, R.I.F. e Inscripciones ante organismos. Cada
                uno tiene sus propias horas y un gasto sugerido.
              </li>
              <li>
                <em>Registro de Marca, Asesoría Legal, Otros Servicios</em>:
                tienen una descripción genérica que puedes personalizar.
              </li>
            </ul>
          </li>
          <li>
            Revisa o personaliza la <strong>descripción del servicio</strong> en
            el textarea grande.
          </li>
          <li>
            En <strong>Honorarios Profesionales</strong> escribe las horas, el
            costo por hora y la moneda. El costo por hora se reutiliza para
            todos los servicios complementarios que marques.
          </li>
          <li>
            En <strong>Gastos</strong>, marca los gastos a incluir (Aranceles de
            registro, Timbre fiscal, Publicación mercantil, Copias certificadas,
            Habilitación). Los montos sugeridos son editables.
          </li>
          <li>
            Verifica el <strong>Total general</strong> que se calcula
            automáticamente y pulsa <strong>Generar propuesta</strong>.
          </li>
          <li>
            La propuesta queda guardada dentro del cliente. Pulsa sobre ella
            para abrir la versión imprimible.
          </li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 text-base font-bold text-slate-900">
          Modelos de estilo
        </h3>
        <p>
          En la sección <strong>Modelos</strong> del menú lateral puedes subir
          documentos que hayas redactado anteriormente (poderes, contratos,
          actas). Al pulsar <strong>Analizar modelos</strong>, la IA extrae tu
          estilo de redacción y lo guarda para reutilizarlo en todos los
          documentos futuros. No necesitas repetir el análisis a menos que
          cambies tus modelos.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-base font-bold text-slate-900">
          Imprimir o guardar como PDF
        </h3>
        <p>
          Dentro de la propuesta, pulsa{' '}
          <strong>Imprimir / Guardar PDF</strong>. Se abre el diálogo de impresión
          de tu navegador con la hoja lista, sin barras laterales. Puedes
          mandarla a una impresora física o elegir <em>Guardar como PDF</em>
          como destino.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-base font-bold text-slate-900">
          Antes de imprimir tu primera propuesta
        </h3>
        <p>
          Ve a <strong>Perfil</strong> y completa tu nombre completo, teléfono y
          número de I.P.S.A. Esos datos forman el encabezado y el pie de firma
          de cada propuesta. La dirección del despacho ya está configurada y es
          común a todos los usuarios.
        </p>
      </section>
    </div>
  )
}
