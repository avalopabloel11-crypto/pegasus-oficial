import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Verifica que quien hace la petición sea el administrador (ADMIN_EMAIL).
 * Si no lo es, lo manda a /login. Usar al inicio de cada página y acción de admin.
 */
export async function requireAdmin() {
  const s = await createServerSupabase();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (
    !user ||
    user.email?.toLowerCase() !== (process.env.ADMIN_EMAIL || '').toLowerCase()
  ) {
    redirect('/login');
  }

  return user;
}
