'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { createAdminSupabase } from '@/lib/supabase-server';
import {
  ESTADOS,
  ORIGENES,
  TIPOS,
  type ActionResult,
  type Estado,
} from '@/lib/crm-types';

// ---------- helpers (no exportados) ----------

const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

const txt = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fecha = (v: unknown): string | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null;

const oneOf = <T extends readonly string[]>(
  list: T,
  v: unknown,
  fallback: T[number]
): T[number] => (list.includes(String(v)) ? (String(v) as T[number]) : fallback);

type Db = ReturnType<typeof createAdminSupabase>;

/** Verifica admin, ejecuta la consulta con la service role y refresca la página. */
async function run(
  fn: (db: Db) => PromiseLike<{ error: { message: string } | null }>
): Promise<ActionResult> {
  await requireAdmin();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail('Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.');
  }

  try {
    const { error } = await fn(createAdminSupabase());
    if (error) return fail(error.message);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error inesperado.');
  }

  revalidatePath('/admin/crm');
  revalidatePath('/admin/inventario');
  return { ok: true };
}

/** Igual que run, pero para acciones de varios pasos (pedido + prendas + estado). */
async function runMulti(
  fn: (db: Db) => Promise<ActionResult>
): Promise<ActionResult> {
  await requireAdmin();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail('Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.');
  }

  try {
    const r = await fn(createAdminSupabase());
    if (r.ok) {
      revalidatePath('/admin/crm');
      revalidatePath('/admin/inventario');
    }
    return r;
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error inesperado.');
  }
}

/**
 * Cambia el estado de un pedido. Al pasar a "entregado" la base descuenta las prendas
 * del inventario; al salir de "entregado" las devuelve (ver prendas_movimientos.sql).
 */
async function cambiarEstado(
  db: Db,
  id: string,
  estado: string
): Promise<{ message: string } | null> {
  const r = await db.rpc('cambiar_estado_pedido', { p_id: id, p_estado: estado });
  if (!r.error) return null;

  if (r.error.code === 'PGRST202') {
    // Todavía no se ejecutó prendas_movimientos.sql: el estado cambia sin tocar el inventario.
    const u = await db.from('pedidos').update({ estado }).eq('id', id);
    return u.error ? { message: u.error.message } : null;
  }

  return { message: r.error.message };
}

// ---------- clientes ----------

type ClienteInput = {
  nombre: string;
  telefono?: string;
  email?: string;
  origen?: string;
  notas?: string;
};

const clienteRow = (d: ClienteInput) => ({
  nombre: txt(d.nombre),
  telefono: txt(d.telefono),
  email: txt(d.email),
  origen: oneOf(ORIGENES, d.origen, 'whatsapp'),
  notas: txt(d.notas),
});

export async function crearCliente(d: ClienteInput): Promise<ActionResult> {
  const row = clienteRow(d);
  if (!row.nombre) return fail('Falta el nombre del cliente.');
  return run((db) => db.from('clientes').insert(row));
}

export async function actualizarCliente(
  id: string,
  d: ClienteInput
): Promise<ActionResult> {
  const row = clienteRow(d);
  if (!row.nombre) return fail('Falta el nombre del cliente.');
  return run((db) => db.from('clientes').update(row).eq('id', id));
}

export async function eliminarCliente(id: string): Promise<ActionResult> {
  // Borra también sus pedidos y seguimientos (on delete cascade).
  return run((db) => db.from('clientes').delete().eq('id', id));
}

// ---------- pedidos ----------

type LineaInput = {
  prenda_id: string;
  talle: string;
  color: string;
  cantidad: number | string;
};

type PedidoInput = {
  cliente_id: string;
  titulo: string;
  descripcion?: string;
  tipo?: string;
  cantidad?: number | string;
  presupuesto_monto?: number | string;
  sena_monto?: number | string;
  estado?: string;
  fecha_entrega?: string;
  /** Prendas del inventario que lleva el pedido. */
  lineas?: LineaInput[];
};

const lineasRows = (pedido_id: string, ls: LineaInput[] | undefined) =>
  (ls ?? [])
    .map((l) => ({
      pedido_id,
      prenda_id: String(l.prenda_id ?? ''),
      talle: String(l.talle ?? '').trim().toUpperCase(),
      color: String(l.color ?? '').trim(),
      cantidad: Math.max(1, Math.round(num(l.cantidad) ?? 1)),
    }))
    .filter((l) => l.prenda_id && l.talle && l.color);

const pedidoRow = (d: PedidoInput) => ({
  cliente_id: d.cliente_id,
  titulo: txt(d.titulo),
  descripcion: txt(d.descripcion),
  tipo: oneOf(TIPOS, d.tipo, 'bordado'),
  cantidad: Math.max(1, Math.round(num(d.cantidad) ?? 1)),
  presupuesto_monto: num(d.presupuesto_monto),
  sena_monto: num(d.sena_monto) ?? 0,
  estado: oneOf(ESTADOS, d.estado, 'consulta'),
  fecha_entrega: fecha(d.fecha_entrega),
});

export async function crearPedido(d: PedidoInput): Promise<ActionResult> {
  const row = pedidoRow(d);
  if (!row.cliente_id) return fail('Elegí un cliente.');
  if (!row.titulo) return fail('Falta el título del pedido.');

  // Un pedido nuevo "entregado" se crea primero en "listo" y después se entrega,
  // para que el descuento de stock pase por el mismo camino de siempre.
  const entregar = row.estado === 'entregado';

  return runMulti(async (db) => {
    const ins = await db
      .from('pedidos')
      .insert({ ...row, estado: entregar ? 'listo' : row.estado })
      .select('id')
      .single();
    if (ins.error) return fail(ins.error.message);

    const id = String(ins.data?.id);
    const ls = lineasRows(id, d.lineas);

    if (ls.length) {
      const r = await db.from('pedidos_prendas').insert(ls);
      if (r.error) {
        return fail(
          `El pedido se creó, pero no se pudieron guardar las prendas: ${r.error.message}`
        );
      }
    }

    if (entregar) {
      const e = await cambiarEstado(db, id, 'entregado');
      if (e) {
        return fail(
          `El pedido se creó en "Listo", pero no se pudo entregar: ${e.message}`
        );
      }
    }

    return OK;
  });
}

export async function actualizarPedido(
  id: string,
  d: PedidoInput
): Promise<ActionResult> {
  const row = pedidoRow(d);
  if (!row.titulo) return fail('Falta el título del pedido.');

  // El estado se cambia aparte porque puede mover el inventario.
  const { estado, ...resto } = row;

  return runMulti(async (db) => {
    const up = await db.from('pedidos').update(resto).eq('id', id);
    if (up.error) return fail(up.error.message);

    // Reemplaza solo las prendas todavía no descontadas; las ya entregadas quedan como están.
    if (d.lineas !== undefined) {
      const del = await db
        .from('pedidos_prendas')
        .delete()
        .eq('pedido_id', id)
        .eq('descontado', false);
      // Si todavía no existe la tabla (falta prendas_movimientos.sql) y no hay prendas que guardar, se ignora.
      const sinTabla = del.error?.code === 'PGRST205' && !d.lineas.length;
      if (del.error && !sinTabla) return fail(del.error.message);

      const ls = lineasRows(id, d.lineas);
      if (ls.length) {
        const ins = await db.from('pedidos_prendas').insert(ls);
        if (ins.error) return fail(ins.error.message);
      }
    }

    const e = await cambiarEstado(db, id, estado);
    if (e) {
      return fail(`Se guardaron los cambios, pero el estado no se pudo cambiar: ${e.message}`);
    }

    return OK;
  });
}

export async function cambiarEstadoPedido(
  id: string,
  estado: Estado
): Promise<ActionResult> {
  if (!ESTADOS.includes(estado)) return fail('Estado inválido.');

  return runMulti(async (db) => {
    const e = await cambiarEstado(db, id, estado);
    return e ? fail(e.message) : OK;
  });
}

export async function eliminarPedido(id: string): Promise<ActionResult> {
  return run((db) => db.from('pedidos').delete().eq('id', id));
}

// ---------- seguimientos ----------

type SeguimientoInput = {
  cliente_id: string;
  pedido_id?: string;
  nota: string;
  proximo_contacto?: string;
};

export async function crearSeguimiento(
  d: SeguimientoInput
): Promise<ActionResult> {
  const nota = txt(d.nota);
  if (!d.cliente_id) return fail('Falta el cliente.');
  if (!nota) return fail('Escribí una nota.');

  return run((db) =>
    db.from('seguimientos').insert({
      cliente_id: d.cliente_id,
      pedido_id: txt(d.pedido_id),
      nota,
      proximo_contacto: fecha(d.proximo_contacto),
    })
  );
}

/** Marca un recordatorio como hecho (quita la fecha de próximo contacto, la nota queda en el historial). */
export async function completarSeguimiento(id: string): Promise<ActionResult> {
  return run((db) =>
    db.from('seguimientos').update({ proximo_contacto: null }).eq('id', id)
  );
}

export async function eliminarSeguimiento(id: string): Promise<ActionResult> {
  return run((db) => db.from('seguimientos').delete().eq('id', id));
}
