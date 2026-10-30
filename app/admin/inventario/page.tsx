import { requireAdmin } from '@/lib/admin-auth';
import { createAdminSupabase } from '@/lib/supabase-server';
import type { Prenda, Variante } from '@/lib/inventario-types';
import InventarioPanel from '@/components/InventarioPanel';
import '../crm/crm.css';
import './inventario.css';

export const dynamic = 'force-dynamic';

export default async function InventarioPage() {
  await requireAdmin();

  let prendas: Prenda[] = [];
  let variantes: Variante[] = [];
  let error: string | null = null;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    error = 'Falta la variable SUPABASE_SERVICE_ROLE_KEY en Vercel.';
  } else {
    try {
      const db = createAdminSupabase();

      const [p, v] = await Promise.all([
        db.from('prendas').select('*').order('nombre'),
        db.from('prendas_stock').select('*'),
      ]);

      const firstError = p.error || v.error;
      if (firstError) error = firstError.message;

      prendas = (p.data ?? []) as Prenda[];
      variantes = (v.data ?? []) as Variante[];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error inesperado.';
    }
  }

  return (
    <InventarioPanel prendas={prendas} variantes={variantes} loadError={error} />
  );
}
