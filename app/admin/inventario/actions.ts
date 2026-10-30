'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { createAdminSupabase } from '@/lib/supabase-server';
import type { ActionResult } from '@/lib/crm-types';

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

const entero = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

/** "NEGRO", "negro " y "Negro" quedan todos como "Negro" para no duplicar colores. */
const normColor = (v: unknown): string | null => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null;
};

const normTalle = (v: unknown): string | null => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return s || null;
};

type Db = ReturnType<typeof createAdminSupabase>;

/** Verifica admin, ejecuta con la service role y refresca la página. */
async function guard(
  fn: (db: Db) => Promise<ActionResult>
): Promise<ActionResult> {
  await requireAdmin();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail('Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.');
  }

  try {
    const r = await fn(createAdminSupabase());
    if (r.ok) revalidatePath('/admin/inventario');
    return r;
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Error inesperado.');
  }
}

// ---------- modelos de prenda ----------

type PrendaInput = {
  nombre: string;
  proveedor?: string;
  costo_unitario?: number | string;
  stock_minimo?: number | string;
  notas?: string;
};

const prendaRow = (d: PrendaInput) => ({
  nombre: txt(d.nombre),
  proveedor: txt(d.proveedor),
  costo_unitario: num(d.costo_unitario),
  stock_minimo: Math.max(0, entero(d.stock_minimo) ?? 2),
  notas: txt(d.notas),
});

export async function crearPrenda(d: PrendaInput): Promise<ActionResult> {
  const row = prendaRow(d);
  if (!row.nombre) return fail('Falta el nombre del modelo.');

  return guard(async (db) => {
    const r = await db.from('prendas').insert(row);
    return r.error ? fail(r.error.message) : OK;
  });
}

export async function actualizarPrenda(
  id: string,
  d: PrendaInput
): Promise<ActionResult> {
  const row = prendaRow(d);
  if (!row.nombre) return fail('Falta el nombre del modelo.');

  return guard(async (db) => {
    const r = await db.from('prendas').update(row).eq('id', id);
    return r.error ? fail(r.error.message) : OK;
  });
}

export async function eliminarPrenda(id: string): Promise<ActionResult> {
  // Borra también todos sus talles y colores (on delete cascade).
  return guard(async (db) => {
    const r = await db.from('prendas').delete().eq('id', id);
    return r.error ? fail(r.error.message) : OK;
  });
}

// ---------- stock por talle y color ----------

/** Suma unidades a una combinación; si no existe todavía, la crea. */
export async function agregarStock(d: {
  prenda_id: string;
  color: string;
  talle: string;
  cantidad: number | string;
}): Promise<ActionResult> {
  const color = normColor(d.color);
  const talle = normTalle(d.talle);
  const cantidad = entero(d.cantidad) ?? 0;

  if (!d.prenda_id) return fail('Falta el modelo.');
  if (!color) return fail('Falta el color.');
  if (!talle) return fail('Falta el talle.');
  if (cantidad < 0) return fail('La cantidad no puede ser negativa.');

  return guard(async (db) => {
    const ya = await db
      .from('prendas_stock')
      .select('id,cantidad')
      .eq('prenda_id', d.prenda_id)
      .eq('talle', talle)
      .eq('color', color)
      .maybeSingle();
    if (ya.error) return fail(ya.error.message);

    if (ya.data) {
      const r = await db
        .from('prendas_stock')
        .update({
          cantidad: Number(ya.data.cantidad) + cantidad,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ya.data.id);
      return r.error ? fail(r.error.message) : OK;
    }

    const r = await db
      .from('prendas_stock')
      .insert({ prenda_id: d.prenda_id, talle, color, cantidad });
    return r.error ? fail(r.error.message) : OK;
  });
}

/** Suma o resta unidades (botones + y −). Nunca baja de 0. */
export async function cambiarStock(
  id: string,
  delta: number
): Promise<ActionResult> {
  const cambio = Math.round(Number(delta));
  if (!id || !Number.isFinite(cambio) || cambio === 0) return fail('Cambio inválido.');

  return guard(async (db) => {
    const cur = await db
      .from('prendas_stock')
      .select('cantidad')
      .eq('id', id)
      .single();
    if (cur.error) return fail(cur.error.message);

    const nuevo = Math.max(0, Number(cur.data?.cantidad ?? 0) + cambio);
    const r = await db
      .from('prendas_stock')
      .update({ cantidad: nuevo, updated_at: new Date().toISOString() })
      .eq('id', id);
    return r.error ? fail(r.error.message) : OK;
  });
}

/** Fija la cantidad exacta (para cuando contás y corregís). */
export async function fijarStock(
  id: string,
  cantidad: number | string
): Promise<ActionResult> {
  const n = entero(cantidad);
  if (!id) return fail('Falta la combinación.');
  if (n === null || n < 0) return fail('Ingresá una cantidad de 0 o más.');

  return guard(async (db) => {
    const r = await db
      .from('prendas_stock')
      .update({ cantidad: n, updated_at: new Date().toISOString() })
      .eq('id', id);
    return r.error ? fail(r.error.message) : OK;
  });
}

/** Quita una combinación de talle y color de un modelo. */
export async function eliminarVariante(id: string): Promise<ActionResult> {
  return guard(async (db) => {
    const r = await db.from('prendas_stock').delete().eq('id', id);
    return r.error ? fail(r.error.message) : OK;
  });
}
