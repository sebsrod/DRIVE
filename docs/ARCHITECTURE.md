# Office Drive — Documentación Técnica Completa

## 1. Descripción general

**Office Drive** es una aplicación web de gestión documental diseñada para despachos de abogados en Venezuela. Permite a los abogados organizar los expedientes de sus clientes, generar documentos legales con inteligencia artificial (Gemini de Google), crear propuestas de servicios profesionales con formato imprimible, y gestionar un sistema de modelos y plantillas para preservar su estilo de redacción.

### Para quién

Abogados venezolanos que trabajan en despachos jurídicos. Soporta tanto ejercicio privado (clientes individuales del abogado) como ejercicio en equipo (clientes compartidos con todo el despacho).

### Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS 3 |
| Routing | React Router v6 |
| Estado | React Context (AuthContext) |
| Backend / BaaS | Supabase (Auth, Database PostgreSQL, Storage) |
| API Serverless | Cloudflare Pages Functions (4 endpoints) |
| IA | Google Gemini API (gemini-3.1-pro-preview + gemini-2.5-flash) |
| Exportación Word | librería `docx` + `file-saver` |
| Hosting | Cloudflare Pages |

---

## 2. Arquitectura

```
+-------------------+       HTTPS/JSON       +---------------------------+
|                   | ======================> |  Cloudflare Pages         |
|   Navegador       |                         |  (Static + Functions)     |
|   (React SPA)     |                         |                           |
|                   | <====================== |  /api/generate-document   |
|                   |                         |  /api/analyze-style       |
|                   |                         |  /api/extract-templates   |
|                   |                         |  /api/chat                |
+--------+----------+                         +----------+----------------+
         |                                               |
         |  Supabase Client SDK                          |  fetch() con
         |  (Auth, DB, Storage)                          |  GEMINI_API_KEY
         v                                               v
+--------+----------+                         +----------+----------------+
|                   |                         |                           |
|   Supabase        |                         |   Google Gemini API       |
|   - Auth (JWT)    |                         |   - Pro (redacción)       |
|   - PostgreSQL    |                         |   - Flash (OCR imágenes)  |
|   - Storage       |                         |                           |
|     (2 buckets)   |                         +---------------------------+
|                   |
+-------------------+
```

**Flujo típico:**
1. El navegador se comunica directamente con Supabase para autenticación, CRUD de datos y almacenamiento de archivos.
2. Para operaciones con IA, el navegador envía requests a las Cloudflare Functions, que validan el JWT del usuario contra Supabase y luego llaman a la API de Gemini.
3. Las Cloudflare Functions nunca exponen la GEMINI_API_KEY al cliente.

---

## 3. Modelo de datos

### 3.1 `profiles`

Datos públicos del usuario/abogado. Se crea automáticamente al registrarse vía trigger.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK, FK → auth.users) | ID del usuario |
| `email` | text | Email del usuario |
| `full_name` | text | Nombre completo del abogado |
| `phone` | text | Teléfono |
| `ipsa_number` | text | Número de I.P.S.A. |
| `writing_style` | text | Guía de estilo legacy (sin categorizar) |
| `writing_styles` | jsonb | Guías de estilo por categoría |
| `role` | text | `'member'` o `'admin'` |
| `created_at` | timestamptz | Fecha de creación |

**RLS:** Todos los autenticados pueden leer; cada usuario solo puede modificar su propio perfil.

### 3.2 `clients`

Clientes del despacho (personas naturales o jurídicas).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | Nombre o razón social |
| `cedula_rif` | text | Cédula de identidad o RIF |
| `phone` | text | Teléfono |
| `address` | text | Dirección |
| `scope` | text | `'private'` o `'team'` |
| `owner_id` | uuid (FK → auth.users) | Creador del cliente |
| `client_type` | text | `'natural'` o `'juridica'` |
| `capital_social` | text | Capital social (ej: "USD 50.000") |
| `registry_office` | text | Nombre del Registro Mercantil |
| `registry_date` | date | Fecha de registro |
| `registry_number` | text | Número de registro |
| `registry_volume` | text | Tomo |
| `board_duration` | text | Duración del período de la JD |
| `total_shares` | numeric | Cantidad total de acciones |
| `shareholders` | jsonb | Array de `{name, cedula, percentage}` |
| `legal_representatives` | jsonb | Array de `{name, cedula, position}` |
| `created_at` | timestamptz | |

**RLS:** Los clientes `private` solo son visibles para su owner; los `team` son visibles para todos los autenticados.

### 3.3 `client_folders`

Subcarpetas dentro del expediente de un cliente.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | |
| `client_id` | uuid (FK → clients, CASCADE) | |
| `name` | text | Nombre de la carpeta |
| `created_at` | timestamptz | |

### 3.4 `documents`

Metadatos de archivos almacenados en Supabase Storage.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | Nombre original del archivo |
| `storage_path` | text | Ruta en el bucket de Storage |
| `size` | bigint | Tamaño en bytes |
| `mime_type` | text | Tipo MIME |
| `client_id` | uuid (FK → clients, CASCADE) | |
| `subfolder_id` | uuid (FK → client_folders, CASCADE) | Null = raíz del cliente |
| `scope` | text | `'private'` o `'team'` |
| `owner_id` | uuid (FK → auth.users, CASCADE) | |
| `is_fundamental` | boolean | Si es documento fundamental del cliente |
| `created_at` | timestamptz | |

### 3.5 `proposals`

Propuestas de servicios profesionales.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | |
| `client_id` | uuid (FK → clients, CASCADE) | |
| `owner_id` | uuid (FK → auth.users, CASCADE) | |
| `service_type` | text | Tipo de servicio (ej: `acta_asamblea`) |
| `sub_service` | text | Sub-servicio legacy (un solo key) |
| `sub_services` | jsonb | Array de `{key, label, description}` (multi-selección) |
| `description` | text | Descripción del servicio |
| `hours` | numeric(10,2) | Horas de honorarios principales |
| `hourly_rate` | numeric(14,2) | Costo por hora |
| `total` | numeric(16,2) | Subtotal honorarios (hours × rate) |
| `currency` | text | Moneda (default: `'USD'`) |
| `notes` | text | Notas adicionales |
| `expenses` | jsonb | Array de `{label, amount}` |
| `honorarios_items` | jsonb | Servicios complementarios `{key, label, description, hours, rate, total}` |
| `created_at` | timestamptz | |

### 3.6 `model_documents`

PDFs de ejemplo subidos por el usuario para análisis de estilo.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | |
| `owner_id` | uuid (FK → auth.users, CASCADE) | |
| `name` | text | Nombre del archivo |
| `storage_path` | text | Ruta en Storage |
| `size` | bigint | |
| `mime_type` | text | |
| `category` | text | `documento_constitutivo`, `acta_asamblea`, `poder`, `contrato` |
| `created_at` | timestamptz | |

### 3.7 `act_templates`

Plantillas textuales extraídas de los modelos del usuario.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | |
| `owner_id` | uuid (FK → auth.users, CASCADE) | |
| `category` | text | Categoría del documento |
| `act_key` | text | Slug en snake_case (ej: `aumento_capital`) |
| `act_label` | text | Nombre legible (ej: "Aumento de Capital Social") |
| `template_text` | text | Texto literal con placeholders `{{...}}` |
| `placeholders` | text[] | Lista de todos los placeholders usados |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Restricción UNIQUE:** `(owner_id, category, act_key)` — permite upsert.

### Storage (Supabase)

| Bucket | Propósito | Acceso |
|---|---|---|
| `personal-documents` | Documentos de clientes privados + modelos | Cada usuario solo accede a su carpeta (`{userId}/...`) |
| `shared-documents` | Documentos de clientes de equipo | Todo autenticado puede ver/subir; solo owner/admin puede borrar |

---

## 4. Autenticación

### Flujo de registro

1. El usuario rellena nombre, email y contraseña en `/signup`.
2. Se llama a `supabase.auth.signUp()` con `options.data.full_name`.
3. Supabase crea el usuario en `auth.users` y envía email de confirmación.
4. El trigger `on_auth_user_created` inserta automáticamente una fila en `profiles` con el `id`, `email` y `full_name`.
5. El usuario es redirigido a `/login`.

### Flujo de login

1. Se llama a `supabase.auth.signInWithPassword()`.
2. `AuthContext` actualiza `user` y `session` vía `onAuthStateChange`.
3. `ProtectedRoute` permite el acceso a las rutas protegidas.

### JWT y sesión

- La sesión se persiste en `localStorage` (`persistSession: true`).
- El token se refresca automáticamente (`autoRefreshToken: true`).
- Para las Cloudflare Functions, el `access_token` se envía como `Authorization: Bearer <token>`.
- Las Functions validan el token llamando a `GET /auth/v1/user` de Supabase.

---

## 5. Rutas

| Ruta | Componente | Auth | Descripción |
|---|---|---|---|
| `/login` | Login | No | Inicio de sesión |
| `/signup` | Signup | No | Registro |
| `/` | Redirect | Sí | Redirige a `/ejercicio/privado` |
| `/ejercicio/:scope` | ClientsList | Sí | Lista de clientes (`privado` o `equipo`) |
| `/ejercicio/:scope/clientes/:clientId` | ClientView | Sí | Detalle del cliente |
| `/ejercicio/:scope/clientes/:clientId/carpetas/:folderId` | SubfolderView | Sí | Subcarpeta |
| `/ejercicio/:scope/clientes/:clientId/propuestas/:proposalId` | ProposalView | Sí | Propuesta imprimible |
| `/modelos` | Models | Sí | Gestión de modelos y plantillas |
| `/perfil` | Profile | Sí | Perfil del abogado |
| `/manual` | Manual | Sí | Guía de uso |

---

## 6. Módulos del frontend

### Páginas

| Página | Archivo | Propósito |
|---|---|---|
| Login | `src/pages/Login.tsx` | Formulario de inicio de sesión |
| Signup | `src/pages/Signup.tsx` | Registro con nombre, email y contraseña |
| ClientsList | `src/pages/ClientsList.tsx` | Lista de clientes, crear y eliminar |
| ClientView | `src/pages/ClientView.tsx` | Vista completa del cliente: datos de empresa, fundamentales, proyectos, propuestas, carpetas, archivos |
| SubfolderView | `src/pages/SubfolderView.tsx` | Contenido de subcarpeta con breadcrumb |
| ProposalView | `src/pages/ProposalView.tsx` | Vista imprimible de una propuesta |
| Profile | `src/pages/Profile.tsx` | Editar nombre, teléfono, IPSA |
| Models | `src/pages/Models.tsx` | Gestión de modelos por categoría: subir, analizar estilo, extraer plantillas |
| Manual | `src/pages/Manual.tsx` | Guía de uso |

### Componentes principales

| Componente | Propósito |
|---|---|
| Layout | Sidebar con navegación, topbar móvil, WelcomeModal |
| Modal | Modal genérico reutilizable con scroll interno |
| ClientFormModal | Crear/editar clientes (natural o jurídica) |
| GenerateDocumentModal | Generar documentos con IA: campos dinámicos, plantillas, chat, preview, export Word |
| ProposalFormModal | Crear propuestas con sub-servicios, honorarios, gastos |
| DocumentPreviewModal | Vista formateada del documento (Arial 12pt, 26pt interlineado, 1in márgenes) |
| DocumentList | Lista de documentos con descargar/eliminar |
| ChatPanel | Chat conversacional con Gemini |
| WelcomeModal | Bienvenida al primer login con opción "No mostrar más" |
| UploadButton | Botón de subir archivos |

---

## 7. Gestión de clientes

### Crear cliente

Desde ClientsList → "+ Agregar cliente" → `ClientFormModal`:
- **Tipo:** persona natural o jurídica (radio toggle)
- **Datos comunes:** nombre (obligatorio), cédula/RIF, teléfono, dirección
- **Datos jurídica:** registro mercantil (oficina, fecha, número, tomo), capital social, cantidad total de acciones, accionistas `{nombre, cédula, %}`, representantes `{cargo, nombre, cédula}`, duración de la JD
- **Cálculos automáticos:** valor nominal por acción = capital / total_shares; nº de acciones por accionista = (% / 100) × total_shares

### Editar cliente

Desde ClientView → "✏️ Editar" → mismo `ClientFormModal` con `initialClient` pre-poblado. Llama a `updateClient()`.

### Eliminar cliente

`deleteClient()` borra archivos de Storage (el cascade de BD no borra Storage) y luego elimina la fila (cascade elimina documents, folders, proposals).

---

## 8. Sistema de documentos

### Buckets

- **`personal-documents`:** clientes `private`. Ruta: `{userId}/{clientId}/{segment}/{timestamp}-{filename}`
- **`shared-documents`:** clientes `team`. Ruta: `{clientId}/{segment}/{timestamp}-{filename}`

### Segmentos de ruta

- `_root`: archivos en la raíz del cliente
- `_fundamental`: documentos fundamentales
- `_models/{category}/`: modelos de estilo
- `{subfolderId}`: archivos dentro de una subcarpeta

### Operaciones

- **Subir:** `uploadDocument()` → sube a Storage + inserta en `documents`
- **Descargar:** `getDocumentDownloadUrl()` → URL firmada de 5 minutos
- **Eliminar:** `deleteDocument()` → borra de Storage + elimina fila
- **Fundamentales:** `is_fundamental = true`, sección propia en ClientView

---

## 9. Propuestas de servicios

### Catálogo de servicios (`services.ts`)

| Servicio | Sub-servicios (excluyentes) | Complementarios (aditivos) |
|---|---|---|
| Acta de Asamblea | 8 actos (Aumento Capital, Nombramiento JD, etc.) | — |
| Constitución de Compañía | — | Registro de Libros (350), RIF (100), Inscripciones (400) |
| Registro de Marca | — | — |
| Asesoría Legal | — | — |
| Otros Servicios | — | — |

### Formulario

1. Tipo de servicio → descripción sugerida editable
2. Sub-servicios (checkboxes multi-selección si aplica)
3. **Honorarios:** horas, costo/hora, moneda → subtotal automático
4. **Servicios complementarios:** horas y gasto por cada uno, comparten tarifa
5. **Gastos predeterminados:** Aranceles (250), Timbre (20), Publicación (20), Copias (20), Habilitación (—)
6. **Total general:** honorarios + gastos en vivo

### Vista imprimible (`ProposalView`)

Encabezado del despacho → fecha → destinatario → descripción → actos contemplados → tabla de honorarios → gastos → total general → cierre formal → firma del abogado.

---

## 10. Generación de documentos con IA

### Tipos soportados

| Tipo | Campos principales |
|---|---|
| Poder | Tipo (general/especial), apoderado, facultades |
| Contrato de Arrendamiento | Rol del cliente, contraparte, inmueble, duración, canon |
| Contrato Laboral | Rol, trabajador, cargo, salario, tipo de contrato |
| Acta de Asamblea | Convocatoria, fecha/hora/lugar, presidente, quórum, 16 actos con campos dinámicos |
| Documento Constitutivo | Denominación, objeto, domicilio, capital, accionistas, administración, comisario |

### 16 actos de asamblea con campos específicos

1. **Aprobación de balances** → selector de años (últimos 8)
2. **Distribución de dividendos** → monto, ejercicio, fecha de pago
3. **Aumento de capital** → capital anterior/nuevo, modalidad (5 opciones incl. anulación y emisión), valor nominal, preferencia, campos extras para nuevas acciones
4. **Disminución de capital** → capital anterior/nuevo, causa
5. **Nombramiento de JD** → lista dinámica de miembros (cargo, nombre, cédula), duración
6. **Ratificación de JD** → usa datos almacenados del cliente
7. **Nombramiento de Comisario** → nombre, cédula, colegio, carnet
8. **Reforma de estatutos** → lista dinámica de cláusulas (número + texto nuevo)
9. **Venta de acciones** → vendedor (dropdown), comprador completo, nº acciones, precio, preferencia
10. **Cambio de domicilio** → nueva dirección
11. **Modificación de objeto** → nuevo objeto social
12. **Prórroga** → nueva duración
13. **Disolución y liquidación** → liquidador + 6 facultades en checklist
14. **Fusión** → absorbente, absorbida, fecha
15. **Transformación** → nuevo tipo societario
16. **Autorización venta de activos** (sin campos específicos)

### Flujo completo

1. Usuario abre modal → selecciona tipo → rellena campos dinámicos
2. Opcionalmente guarda proyecto en `localStorage` ("💾 Guardar proyecto")
3. Al generar:
   - Carga perfil del abogado
   - Determina categoría de estilo (`styleCategoryForDocumentType`)
   - Carga plantillas de `act_templates` de esa categoría
   - **Filtra plantillas relevantes** según actos seleccionados (`filterRelevantTemplates`) para reducir tamaño del prompt
   - POST a `/api/generate-document` con cliente + params + plantillas filtradas
4. Backend construye prompt con `buildPrompt()`:
   - **Modo plantilla** (si hay plantillas): instrucciones de ensamblar literalmente, reemplazar `{{placeholders}}`, conectar con discurso lógico ("Seguidamente...", "Continúa la Asamblea...")
   - **Modo libre** (sin plantillas): redacción libre en estilo jurídico venezolano
5. Gemini responde con el documento (retry automático en 503: 2s, 5s, 10s)
6. Resultado editable en textarea + acciones:
   - **📄 Descargar Word** (`.docx` con Arial 12pt, 26pt, 1in, oficio)
   - **Ver con formato** (preview fullscreen)
   - **Copiar** al portapapeles
   - **Descargar .txt**
   - **Guardar como archivo** del cliente

### Chat interactivo

`ChatPanel` embebido debajo del resultado. El contexto del chat incluye el proyecto guardado (tipo, params, instrucciones) + datos del cliente. Gemini puede preguntar sobre datos faltantes o sugerir correcciones.

---

## 11. Sistema de modelos y plantillas

### Categorías

| Clave | Etiqueta | Se usa al generar |
|---|---|---|
| `documento_constitutivo` | Documentos Constitutivos | Documento Constitutivo |
| `acta_asamblea` | Actas de Asamblea | Acta de Asamblea |
| `poder` | Poderes | Poder |
| `contrato` | Contratos | Contrato de Arrendamiento, Laboral |

### Flujo

1. **Subir PDFs:** hasta 25 por categoría. Se guardan en Storage bajo `{userId}/_models/{category}/` y se registran en `model_documents`.
2. **Analizar estilo (✨ Estilo):** envía PDFs a `/api/analyze-style`. Gemini extrae una guía de estilo textual. Se guarda en `profiles.writing_styles[category]`.
3. **Extraer plantillas (📋 Plantillas):** envía PDFs a `/api/extract-templates`. Gemini extrae plantillas textuales literales con placeholders `{{...}}`. Se guardan en `act_templates` con upsert.
4. **Editar plantillas:** las plantillas se muestran en la UI con opción de editar inline. Los cambios se guardan con `updateActTemplateText()`.
5. **Uso al generar:** al generar un documento, se cargan las plantillas de la categoría correspondiente, se filtran por relevancia y se pasan en el prompt en modo plantilla.

### Filtrado de plantillas (`filterRelevantTemplates`)

Solo aplica a `acta_asamblea`. Reduce el tamaño del prompt enviando solo:
- Plantillas estructurales (encabezado, convocatoria, quórum, cierre, firma, autorización)
- Plantillas que coinciden con los actos seleccionados por el usuario (mapeo heurístico por palabras clave con tolerancia de tildes y sinónimos)
- Si el filtro deja menos de 2 plantillas, se envían todas como respaldo

---

## 12. Funciones del backend (Cloudflare Pages Functions)

### `/api/generate-document` (POST)

| Campo | Descripción |
|---|---|
| Recibe | `documentType`, `params`, `client`, `author`, `officeAddress`, `attachments`, `writingStyle`, `templates` |
| Hace | Valida JWT → OCR de imágenes con Flash → construye prompt → llama a Gemini Pro con retry |
| Devuelve | `{text: string}` |

Dos modos: **plantilla** (ensambla literalmente, reemplaza `{{...}}`, conecta con discurso lógico) o **libre** (redacción estilo jurídico venezolano).

### `/api/analyze-style` (POST)

| Campo | Descripción |
|---|---|
| Recibe | `attachments`, `category` |
| Hace | Valida JWT → prompt de análisis adaptado a la categoría → guarda en `profiles.writing_styles[category]` |
| Devuelve | `{style: string, category: string}` |

### `/api/extract-templates` (POST)

| Campo | Descripción |
|---|---|
| Recibe | `attachments`, `category` |
| Hace | Valida JWT → prompt de extracción literal con placeholders → parsea JSON → upsert en `act_templates` |
| Devuelve | `{templates: [...], count: number}` |

### `/api/chat` (POST)

| Campo | Descripción |
|---|---|
| Recibe | `messages` (historial), `systemContext` |
| Hace | Valida JWT → envía conversación a Gemini Pro con `systemInstruction` → retry en 503 |
| Devuelve | `{reply: string}` |

### Retry común a las 4 funciones

Hasta 4 intentos con backoff (2s, 5s, 10s) para statuses: 429, 500, 502, 503, 504, 524. Errores no-transitorios (400, 401, 404) fallan inmediatamente.

---

## 13. Impresión y PDF

### CSS de impresión (`index.css`)

- **Tamaño de página:** `@page { size: 8.5in 13in }` (oficio venezolano)
- **Márgenes:** `@page { margin: 0 }` + `.print-sheet { padding: 1in }` = 1 pulgada visual
- **Ocultamiento:** sidebar, topbar móvil y `.no-print` → `display: none`
- **Aplanamiento:** todos los contenedores flex → `display: block`, `height: auto`, `overflow: visible`

### Formato de documentos

| Propiedad | Valor |
|---|---|
| Fuente | Arial, Helvetica, sans-serif |
| Tamaño | 12pt |
| Interlineado | 26pt |
| Alineación | Justificado (párrafos), centrado (encabezados) |
| Márgenes | 1 pulgada en los 4 lados |
| Página | 8.5 × 13 pulgadas |

### Export Word (`docxExport.ts`)

Genera `.docx` en el navegador con la librería `docx`:
- Mismas especificaciones que la vista en pantalla
- Header con datos del despacho y línea separadora
- Parseo de `**negrita**` markdown → Word bold runs
- Detección heurística de encabezados (CLÁUSULA, PUNTO, ARTÍCULO)
- Se descarga vía `file-saver` como `<Tipo> - <Cliente>.docx`

---

## 14. Variables de entorno

### Frontend (`.env.local` — Vite build-time)

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anónima de Supabase |

### Backend (Cloudflare Pages → Settings → Variables and Secrets)

| Variable | Tipo | Obligatoria | Descripción |
|---|---|---|---|
| `GEMINI_API_KEY` | Secret | Sí | Clave de API de Google AI Studio |
| `VITE_SUPABASE_URL` | Plaintext | Sí | Reutilizada por las Functions para validar JWT |
| `VITE_SUPABASE_ANON_KEY` | Plaintext | Sí | Reutilizada por las Functions |
| `GEMINI_PRO_MODEL` | Plaintext | No | Override del modelo Pro (default: `gemini-3.1-pro-preview`) |
| `GEMINI_FLASH_MODEL` | Plaintext | No | Override del modelo Flash (default: `gemini-2.5-flash`) |

---

## 15. Migraciones SQL

| # | Archivo | Descripción |
|---|---|---|
| 001 | `001_init.sql` | Tablas base (`profiles`, `folders`, `documents`), RLS, trigger `handle_new_user` |
| 002 | `002_storage.sql` | Buckets `personal-documents` y `shared-documents` con políticas |
| 003 | `003_clients.sql` | Reemplaza el modelo original: `clients`, `client_folders`, `documents` con scope |
| 004 | `004_profiles_proposals.sql` | `phone`/`ipsa_number` en profiles + tabla `proposals` |
| 005 | `005_proposal_expenses.sql` | `proposals.expenses` jsonb |
| 006 | `006_proposal_honorarios_items.sql` | `proposals.honorarios_items` jsonb |
| 007 | `007_proposal_sub_services.sql` | `proposals.sub_services` jsonb |
| 008 | `008_fundamental_docs.sql` | `documents.is_fundamental` boolean |
| 009 | `009_client_type.sql` | `client_type`, capital, registro, `shareholders`/`legal_representatives` jsonb |
| 010 | `010_model_documents.sql` | Tabla `model_documents` + `profiles.writing_style` |
| 011 | `011_board_duration.sql` | `clients.board_duration` |
| 012 | `012_style_categories.sql` | `model_documents.category` + `profiles.writing_styles` jsonb |
| 013 | `013_act_templates.sql` | Tabla `act_templates` con UNIQUE `(owner_id, category, act_key)` |
| 014 | `014_total_shares.sql` | `clients.total_shares` numeric |

---

## 16. Manual de uso (resumen)

### Primer acceso

1. Registrarse → confirmar email → iniciar sesión
2. Completar **Perfil** (nombre, teléfono, IPSA)

### Organizar clientes

1. Ir a **Ejercicio privado** o **Ejercicio en equipo**
2. **+ Agregar cliente** (natural o jurídica con todos los datos corporativos)
3. Dentro del cliente: crear carpetas, subir archivos, subir documentos fundamentales

### Generar propuesta de servicios

1. Dentro del cliente → **+ Generar propuesta**
2. Seleccionar servicio, actos, horas, tarifa, gastos
3. Generar → abrir vista imprimible → Imprimir / Guardar PDF

### Configurar modelos

1. Ir a **Modelos** → subir PDFs por categoría (hasta 25 por cat.)
2. Pulsar **📋 Plantillas** → la IA extrae plantillas con `{{placeholders}}`
3. Revisar/editar plantillas si es necesario

### Generar documento con IA

1. Dentro del cliente → **✨ Generar documento**
2. Seleccionar tipo → llenar campos dinámicos → opcionalmente guardar proyecto
3. **Generar** → la IA ensambla el documento usando las plantillas
4. **📄 Descargar Word** o **Ver con formato** o **Copiar**
5. Usar el **chat** para consultar datos faltantes o pedir correcciones

---

*Documentación generada a partir del código fuente de Office Drive.*



