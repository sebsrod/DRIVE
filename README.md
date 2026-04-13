# Office Drive

Web app para gestión de documentos de oficina. Cada colaborador tiene un usuario para guardar sus documentos personales y acceder a carpetas compartidas del equipo.

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Base de datos, Auth y Storage**: [Supabase](https://supabase.com)
- **Deploy**: [Cloudflare Pages](https://pages.cloudflare.com)
- **Repo**: GitHub

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
