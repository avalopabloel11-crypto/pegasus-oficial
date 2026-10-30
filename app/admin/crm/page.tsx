import { requireAdmin } from '@/lib/admin-auth';
import { createAdminSupabase } from '@/lib/supabase-server';
import CrmPanel from '@/components/CrmPanel';
import type { Cliente, Pedido, Seguimiento } from '@/lib/crm-types';
import type { LineaPedido, Prenda, Variante } from '@/lib/inventario-types';
import './crm.css';
import '../inventario/inventario.css';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  await requireAdmin();

  let clientes: Cliente[] = [];
  let pedidos: Pedido[] = [];
  let seguimientos: Seguimiento[] = [];
  let prendas: Prenda[] = [];
  let variantes: Variante[] = [];
  let lineas: LineaPedido[] = [];
  let error: string | null = null;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    error = 'Falta la variable SUPABASE_SERVICE_ROLE_KEY en Vercel.';
  } else {
    try {
      const db = createAdminSupabase();

      const [c, p, s, pr, va, li] = await Promise.all([
        db.from('clientes').select('*').order('nombre'),
        db.from('pedidos').select('*').order('created_at', { ascending: false }),
        db
          .from('seguimientos')
          .select('*')
          .order('created_at', { ascending: false }),
        db.from('prendas').select('*').order('nombre'),
        db.from('prendas_stock').select('*'),
        db.from('pedidos_prendas').select('*'),
      ]);

      const firstError = c.error || p.error || s.error;
      if (firstError) error = firstError.message;

      clientes = (c.data ?? []) as Cliente[];
      pedidos = (p.data ?? []) as Pedido[];
      seguimientos = (s.data ?? []) as Seguimiento[];

      // El inventario es opcional: si todavía no existen esas tablas, el CRM funciona igual.
      prendas = (pr.data ?? []) as Prenda[];
      variantes = (va.data ?? []) as Variante[];
      lineas = (li.data ?? []) as LineaPedido[];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error inesperado.';
    }
  }

  return (
    <CrmPanel
      clientes={clientes}
      pedidos={pedidos}
      seguimientos={seguimientos}
      prendas={prendas}
      variantes={variantes}
      lineas={lineas}
      loadError={error}
    />
  );
}
