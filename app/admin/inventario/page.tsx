import { requireAdmin } from '@/lib/admin-auth';
import { createAdminSupabase } from '@/lib/supabase-server';
import { ESTADOS_RESERVA, type Estado } from '@/lib/crm-types';
import type {
  LineaPedido,
  Movimiento,
  Prenda,
  Variante,
} from '@/lib/inventario-types';
import InventarioPanel from '@/components/InventarioPanel';
import '../crm/crm.css';
import './inventario.css';

export const dynamic = 'force-dynamic';

export default async function InventarioPage() {
  await requireAdmin();

  let prendas: Prenda[] = [];
  let variantes: Variante[] = [];
  let movimientos: Movimiento[] = [];
  let reservas: LineaPedido[] = [];
  let pedidoLabels: Record<string, string> = {};
  let error: string | null = null;
  let aviso: string | null = null;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    error = 'Falta la variable SUPABASE_SERVICE_ROLE_KEY en Vercel.';
  } else {
    try {
      const db = createAdminSupabase();

      const [p, v, m, l, pe, c] = await Promise.all([
        db.from('prendas').select('*').order('nombre'),
        db.from('prendas_stock').select('*'),
        db
          .from('prendas_movimientos')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300),
        db.from('pedidos_prendas').select('*').eq('descontado', false),
        db.from('pedidos').select('id,titulo,cliente_id,estado'),
        db.from('clientes').select('id,nombre'),
      ]);

      const firstError = p.error || v.error;
      if (firstError) error = firstError.message;

      prendas = (p.data ?? []) as Prenda[];
      variantes = (v.data ?? []) as Variante[];

      // Historial y reservas dependen de prendas_movimientos.sql: si falta, el resto sigue andando.
      if (m.error || l.error) {
        aviso =
          'Falta ejecutar prendas_movimientos.sql en el SQL Editor de Supabase para activar el historial y las reservas por pedido.';
      } else {
        movimientos = (m.data ?? []) as Movimiento[];

        const pedidos = (pe.data ?? []) as {
          id: string;
          titulo: string;
          cliente_id: string;
          estado: Estado;
        }[];
        const estadoDe = new Map<string, Estado>(
          pedidos.map((x) => [x.id, x.estado])
        );

        // Reservado = prendas de pedidos aprobados / en producción / listos que todavía no salieron.
        reservas = ((l.data ?? []) as LineaPedido[]).filter((x) => {
          const est = estadoDe.get(x.pedido_id);
          return !!est && ESTADOS_RESERVA.includes(est);
        });

        const nombres = new Map<string, string>(
          ((c.data ?? []) as { id: string; nombre: string }[]).map((x) => [
            x.id,
            x.nombre,
          ])
        );
        pedidoLabels = Object.fromEntries(
          pedidos.map((x) => [
            x.id,
            `${nombres.get(x.cliente_id) ?? 'Cliente'} — ${x.titulo}`,
          ])
        );
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error inesperado.';
    }
  }

  return (
    <InventarioPanel
      prendas={prendas}
      variantes={variantes}
      movimientos={movimientos}
      reservas={reservas}
      pedidoLabels={pedidoLabels}
      loadError={error}
      aviso={aviso}
    />
  );
}
