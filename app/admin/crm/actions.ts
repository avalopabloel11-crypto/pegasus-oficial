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
  return { ok: true };
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
};

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
  return run((db) => db.from('pedidos').insert(row));
}

export async function actualizarPedido(
  id: string,
  d: PedidoInput
): Promise<ActionResult> {
  const row = pedidoRow(d);
  if (!row.titulo) return fail('Falta el título del pedido.');
  return run((db) => db.from('pedidos').update(row).eq('id', id));
}

export async function cambiarEstadoPedido(
  id: string,
  estado: Estado
): Promise<ActionResult> {
  if (!ESTADOS.includes(estado)) return fail('Estado inválido.');
  return run((db) => db.from('pedidos').update({ estado }).eq('id', id));
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
