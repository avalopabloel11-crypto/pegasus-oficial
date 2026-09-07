import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import AdminPanel from '@/components/AdminPanel';

export default async function Admin() {
  const s = await createServerSupabase();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) redirect('/login');

  if (
    user.email?.toLowerCase() !==
    (process.env.ADMIN_EMAIL || '').toLowerCase()
  ) {
    redirect('/login');
  }

  const [{ data: designs }, { data: content }] = await Promise.all([
    s.from('designs').select('*').order('created_at', { ascending: false }),
    s.from('site_content').select('*').order('key'),
  ]);

  return (
    <AdminPanel
      designs={designs ?? []}
      content={content ?? []}
    />
  );
}