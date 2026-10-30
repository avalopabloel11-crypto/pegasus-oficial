import { requireAdmin } from '@/lib/admin-auth';
import { createAdminSupabase } from '@/lib/supabase-server';
import CrmPanel from '@/components/CrmPanel';
import type { Cliente, Pedido, Seguimiento } from '@/lib/crm-types';
import './crm.css';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  await requireAdmin();

  let clientes: Cliente[] = [];
  let pedidos: Pedido[] = [];
  let seguimientos: Seguimiento[] = [];
  let error: string | null = null;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    error = 'Falta la variable SUPABASE_SERVICE_ROLE_KEY en Vercel.';
  } else {
    try {
      const db = createAdminSupabase();

      const [c, p, s] = await Promise.all([
        db.from('clientes').select('*').order('nombre'),
        db.from('pedidos').select('*').order('created_at', { ascending: false }),
        db
          .from('seguimientos')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      const firstError = c.error || p.error || s.error;
      if (firstError) error = firstError.message;

      clientes = (c.data ?? []) as Cliente[];
      pedidos = (p.data ?? []) as Pedido[];
      seguimientos = (s.data ?? []) as Seguimiento[];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error inesperado.';
    }
  }

  return (
    <CrmPanel
      clientes={clientes}
      pedidos={pedidos}
      seguimientos={seguimientos}
      loadError={error}
    />
  );
}
