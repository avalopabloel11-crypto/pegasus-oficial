# Pegasus — Vercel + Supabase

Versión de producción del catálogo de Pegasus, basada en Next.js + Supabase + Vercel.

## Seguridad incluida

- Supabase Auth con email/contraseña y cookies SSR.
- `/admin` protegido por sesión.
- RLS en tablas públicas.
- La cuenta admin se restringe por `ADMIN_EMAIL` y por políticas RLS.
- `SUPABASE_SERVICE_ROLE_KEY` es exclusivamente servidor y nunca se usa en componentes cliente.
- Rate limiting DB-backed para el endpoint de login: 5 intentos/minuto por IP.
- Imágenes en Supabase Storage; el bucket es público sólo para lectura.
- El frontend sólo usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, que son credenciales diseñadas para el cliente; los secretos permanecen en Vercel.

## 1. Crear Supabase

1. Crear un proyecto Supabase.
2. Crear un usuario administrador en Authentication > Users usando el email que quieras.
3. Abrir SQL Editor y ejecutar `supabase/schema.sql` después de reemplazar `admin@yourdomain.com` por tu email real.
4. Copiar URL, Publishable Key y Secret/Service Role Key desde el panel de conexión.

## 2. Variables de entorno en Vercel

Configurar en Production, Preview y Development según corresponda:

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAIL=tu-email
WHATSAPP_NUMBER=5493436122634

Nunca commitear `.env.local` ni claves secretas.

## 3. Ejecutar localmente

npm install
cp .env.example .env.local
npm run dev

Abrir http://localhost:3000

## 4. Deploy

Subir este proyecto a un repositorio Git y conectarlo con Vercel. Vercel puede sincronizar variables del proyecto con la integración Supabase. También se puede usar el starter oficial de Next.js + Supabase.

## Staging

Usar un proyecto Supabase separado para Preview/Staging. En Vercel, configurar Preview env vars apuntando al proyecto de staging. El `/admin` sigue protegido por Supabase Auth.

Para un staging más cerrado todavía, agregar protección de deployment de Vercel/SSO al proyecto Preview.

## Próximo paso

El catálogo ya tiene el modelo necesario para:
- editar textos desde admin,
- agregar/eliminar diseños,
- categorías,
- medidas,
- precios,
- diseño personalizado,
- WhatsApp.

Luego se puede agregar edición de diseños existentes, ocultar/activar diseños y gestión de categorías desde el mismo panel.
