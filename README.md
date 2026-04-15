# Office Drive

Web app para gestión de documentos de oficina. Cada colaborador tiene un usuario para guardar sus documentos personales y acceder a carpetas compartidas del equipo.

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Base de datos, Auth y Storage**: [Supabase](https://supabase.com)
- **IA (generación de documentos)**: Google Gemini vía Cloudflare Pages Functions
- **Deploy**: [Cloudflare Pages](https://pages.cloudflare.com)
- **Repo**: GitHub

## Variables de entorno

La app usa dos grupos de variables. Todas se configuran en **Cloudflare
Pages → Settings → Variables and Secrets**. Ninguna clave se escribe
nunca en el repo ni en el bundle del frontend.

### Frontend (build-time, Vite)

Se exponen al bundle porque se necesitan en el navegador. No son
secretas (las protege Supabase RLS):

| Variable                  | Valor                                              |
|---------------------------|----------------------------------------------------|
| `VITE_SUPABASE_URL`       | URL del proyecto de Supabase (Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY`  | `anon public key` del proyecto de Supabase         |

### Backend (runtime, Cloudflare Pages Function)

Se usan desde `functions/api/generate-document.ts`, jamás llegan al
frontend. La función las lee por `context.env.*`:

| Variable             | Valor                                                                   |
|----------------------|-------------------------------------------------------------------------|
| `GEMINI_API_KEY`     | Token de Google AI Studio. **Marcar como Secret**.                      |
| `GEMINI_PRO_MODEL`   | (opcional) override del modelo Pro. Default: `gemini-3.1-pro`.          |
| `GEMINI_FLASH_MODEL` | (opcional) override del modelo Flash para OCR. Default: `gemini-2.5-flash`. |

> La función también lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
> para validar el JWT del usuario antes de llamar a Gemini, así que
> esas dos ya están cubiertas con la configuración del frontend.

### Cómo obtener el token de Gemini

1. Entra a [Google AI Studio](https://aistudio.google.com/).
2. Selecciona el proyecto de Google Cloud donde quieras facturar.
3. En el menú lateral elige **Get API key** → **Create API key**.
4. Copia el token y guárdalo como **Secret** en Cloudflare (más abajo).

### Cómo añadirlas en Cloudflare Pages

1. Entra a tu proyecto en Cloudflare Dashboard → **Workers & Pages** →
   tu proyecto → **Settings → Variables and Secrets**.
2. Pulsa **Add** y añade cada variable:
   - `GEMINI_API_KEY` → Type: **Secret** (para que quede cifrada y no
     sea legible después de crearla)
   - `GEMINI_PRO_MODEL` → Type: **Plaintext** (opcional)
   - `GEMINI_FLASH_MODEL` → Type: **Plaintext** (opcional)
3. Asegúrate de que estén en el scope de **Production**. Si también
   quieres probar en deploys de preview, márcalas para **Preview**.
4. Pulsa **Save**.
5. Lanza un nuevo deploy (Retry deployment o push nuevo). Las env vars
   se aplican solo a builds nuevos.

### En desarrollo local

Para probar la función `functions/api/generate-document.ts` en local,
instala wrangler y crea un archivo `.dev.vars` (está en `.gitignore`):

```bash
npm install -g wrangler

cat > .dev.vars <<EOF
GEMINI_API_KEY=tu-token-de-google-ai-studio
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
EOF

wrangler pages dev -- npm run dev
```

`wrangler pages dev` sirve tu app Vite y además expone la Pages
Function en `/api/generate-document`, pasándole las variables de
`.dev.vars` por `context.env`. Nunca hace falta poner el token de
Gemini en el código, en un `.env.local`, ni en el bundle del
navegador.

## Funcionalidades

- Registro e inicio de sesión con email/contraseña (Supabase Auth)
- **Mis documentos**: documentos privados, solo visibles para su dueño
- **Carpetas compartidas**: carpetas visibles a toda la oficina con documentos que todos pueden ver/descargar
- Subir, descargar y eliminar documentos
- Crear y eliminar carpetas compartidas
- Control de acceso vía Row Level Security (RLS) de Supabase

## Estructura

```
.
├── src/
│   ├── components/      # Layout, ProtectedRoute, DocumentList, UploadButton
│   ├── contexts/        # AuthContext
│   ├── lib/             # supabase client, helpers de documentos
│   └── pages/           # Login, Signup, MyDocuments, SharedFolders, FolderView
├── supabase/migrations/ # SQL para crear tablas, RLS y buckets
├── public/_redirects    # Fallback SPA para Cloudflare Pages
└── wrangler.toml        # Config de Cloudflare Pages
```

## Configuración

### 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, ejecuta en orden:
   - `supabase/migrations/001_init.sql` (tablas y RLS)
   - `supabase/migrations/002_storage.sql` (buckets y políticas)
3. En **Authentication → Providers**, habilita "Email" (opcionalmente, desactiva "Confirm email" para entornos de prueba).
4. En **Project Settings → API**, copia:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`

### 2. Variables de entorno locales

```bash
cp .env.example .env.local
# Edita .env.local con tus credenciales de Supabase
```

### 3. Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Deploy en Cloudflare Pages

### Opción A — Dashboard (recomendado)

1. Sube el repo a GitHub.
2. En Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**, selecciona el repo.
3. Configuración de build:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. En **Environment variables** añade:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Cada push a la rama configurada actualizará automáticamente el sitio.

### Opción B — Wrangler CLI

```bash
npm install -g wrangler
npm run build
wrangler pages deploy dist --project-name office-drive
```

## Asignar rol admin

Para permitir que un usuario elimine cualquier carpeta/documento compartido:

```sql
update public.profiles set role = 'admin' where email = 'jefe@oficina.com';
```

## Seguridad

- Las claves del `anon key` son públicas por diseño; la seguridad se aplica mediante RLS en Postgres y políticas en Storage.
- Los documentos personales se guardan en un bucket privado dentro de una carpeta cuyo nombre es el `user.id`, y las políticas de Storage solo permiten acceso a archivos de esa subcarpeta.
- Los documentos compartidos están en un bucket aparte accesible por cualquier usuario autenticado.
