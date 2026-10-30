'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import type { ActionResult } from '@/lib/crm-types';
import {
  TALLES,
  ordenTalle,
  type LineaPedido,
  type Movimiento,
  type Prenda,
  type Variante,
} from '@/lib/inventario-types';
import {
  actualizarPrenda,
  agregarStock,
  cambiarStock,
  crearPrenda,
  eliminarPrenda,
  eliminarVariante,
  fijarStock,
} from '@/app/admin/inventario/actions';

// ---------- utilidades ----------

const peso = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);

const fmtFechaHora = (ts: string) =>
  new Date(ts).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

type Exec = (p: Promise<ActionResult>, okMsg: string) => Promise<boolean>;
type FieldEvent = ChangeEvent<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
>;

/** Se evalúa sobre lo disponible (en mano − reservado para pedidos). */
const estadoCelda = (
  disponible: number,
  minimo: number
): 'ok' | 'bajo' | 'cero' =>
  disponible <= 0 ? 'cero' : minimo > 0 && disponible <= minimo ? 'bajo' : 'ok';

const claveVar = (prenda_id: string, talle: string, color: string) =>
  `${prenda_id}|${talle}|${color}`;

// ---------- formularios ----------

function ModeloForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Prenda;
  busy: boolean;
  onSubmit: (d: {
    nombre: string;
    proveedor: string;
    costo_unitario: string;
    stock_minimo: string;
    notas: string;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [d, setD] = useState({
    nombre: initial?.nombre ?? '',
    proveedor: initial?.proveedor ?? '',
    costo_unitario:
      initial?.costo_unitario != null ? String(initial.costo_unitario) : '',
    stock_minimo: String(initial?.stock_minimo ?? 2),
    notas: initial?.notas ?? '',
  });

  const set = (k: keyof typeof d) => (e: FieldEvent) =>
    setD({ ...d, [k]: e.target.value });

  return (
    <form
      className="crm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(d);
      }}
    >
      <label className="field">
        Modelo de prenda
        <input
          value={d.nombre}
          onChange={set('nombre')}
          placeholder="Ej: Remera de algodón, Chomba piqué, Buzo friza"
          required
        />
      </label>

      <div className="grid">
        <label className="field">
          Proveedor
          <input value={d.proveedor} onChange={set('proveedor')} />
        </label>
        <label className="field">
          Costo por prenda ($)
          <input
            type="number"
            min={0}
            step="0.01"
            value={d.costo_unitario}
            onChange={set('costo_unitario')}
          />
        </label>
      </div>

      <label className="field">
        Avisarme cuando quedan esta cantidad o menos (por talle y color)
        <input
          type="number"
          min={0}
          step={1}
          value={d.stock_minimo}
          onChange={set('stock_minimo')}
        />
      </label>

      <label className="field">
        Notas
        <textarea rows={2} value={d.notas} onChange={set('notas')} />
      </label>

      <div className="crm-form-actions">
        <button className="primary" disabled={busy}>
          {busy ? 'GUARDANDO...' : initial ? 'GUARDAR CAMBIOS' : '+ CREAR MODELO'}
        </button>
        <button type="button" className="crm-cancel" onClick={onCancel}>
          CANCELAR
        </button>
      </div>
    </form>
  );
}

function AgregarStockForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (d: {
    color: string;
    talle: string;
    cantidad: string;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [d, setD] = useState({ color: '', talle: '', cantidad: '1' });

  const set = (k: keyof typeof d) => (e: FieldEvent) =>
    setD({ ...d, [k]: e.target.value });

  return (
    <form
      className="crm-form"
      style={{ marginTop: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSubmit(d);
        // Queda abierto para cargar varios seguidos.
        if (ok) setD({ ...d, color: '', cantidad: '1' });
      }}
    >
      <div className="pr-add">
        <label className="field">
          Color
          <input
            list="colores-lista"
            value={d.color}
            onChange={set('color')}
            placeholder="Ej: Negro"
            required
          />
        </label>
        <label className="field">
          Talle
          <input
            list="talles-lista"
            value={d.talle}
            onChange={set('talle')}
            placeholder="Ej: M"
            required
          />
        </label>
        <label className="field">
          Cantidad
          <input
            type="number"
            min={0}
            step={1}
            value={d.cantidad}
            onChange={set('cantidad')}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? '...' : 'AGREGAR'}
        </button>
      </div>
      <p className="inv-hint">
        Si ese talle y color ya existen en el modelo, la cantidad se suma a lo que
        hay. Con cantidad 0 solo se crea la combinación (sirve para poder asignarla a
        un pedido antes de tener stock).
      </p>
      <div className="crm-form-actions">
        <button type="button" className="crm-cancel" onClick={onCancel}>
          CERRAR
        </button>
      </div>
    </form>
  );
}

// ---------- celda de la grilla ----------

function Celda({
  v,
  reservado,
  minimo,
  busy,
  exec,
}: {
  v: Variante;
  reservado: number;
  minimo: number;
  busy: boolean;
  exec: Exec;
}) {
  const est = estadoCelda(v.cantidad - reservado, minimo);
  const falta = reservado > v.cantidad;

  return (
    <span className="pr-cellwrap">
      <span
        className={`pr-cell ${
          est === 'cero' ? 'zero' : est === 'bajo' ? 'low' : ''
        }`}
      >
        <button
          disabled={busy || v.cantidad <= 0}
          aria-label="Restar una unidad"
          onClick={() => exec(cambiarStock(v.id, -1), '')}
        >
          −
        </button>

        <input
          key={v.cantidad}
          type="number"
          min={0}
          step={1}
          defaultValue={v.cantidad}
          disabled={busy}
          aria-label={`Cantidad ${v.color} talle ${v.talle}`}
          onBlur={(e) => {
            const crudo = e.currentTarget.value;
            const n = Math.round(Number(crudo));
            if (crudo !== '' && Number.isFinite(n) && n >= 0 && n !== v.cantidad) {
              exec(fijarStock(v.id, n), '');
            } else {
              e.currentTarget.value = String(v.cantidad);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />

        <button
          disabled={busy}
          aria-label="Sumar una unidad"
          onClick={() => exec(cambiarStock(v.id, 1), '')}
        >
          +
        </button>

        {v.cantidad === 0 && reservado === 0 && (
          <button
            className="pr-x"
            disabled={busy}
            aria-label="Quitar esta combinación"
            title="Quitar esta combinación de talle y color"
            onClick={() => {
              if (confirm(`¿Quitar ${v.color} talle ${v.talle} de este modelo?`)) {
                exec(eliminarVariante(v.id), 'Combinación quitada.');
              }
            }}
          >
            ✕
          </button>
        )}
      </span>

      {reservado > 0 && (
        <small
          className={`pr-res ${falta ? 'falta' : ''}`}
          title="Prendas apartadas para pedidos aprobados o en producción"
        >
          {falta
            ? `res. ${reservado} · faltan ${reservado - v.cantidad}`
            : `res. ${reservado}`}
        </small>
      )}
    </span>
  );
}

// ---------- panel principal ----------

export default function InventarioPanel({
  prendas,
  variantes,
  movimientos,
  reservas,
  pedidoLabels,
  loadError,
  aviso,
}: {
  prendas: Prenda[];
  variantes: Variante[];
  movimientos: Movimiento[];
  reservas: LineaPedido[];
  pedidoLabels: Record<string, string>;
  loadError: string | null;
  aviso: string | null;
}) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'reponer'>('todos');
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [agregando, setAgregando] = useState<string | null>(null);

  const [verHist, setVerHist] = useState(false);
  const [histPrenda, setHistPrenda] = useState('');

  const exec: Exec = async (p, okMsg) => {
    setBusy(true);
    try {
      const r = await p;
      setMsg(r.ok ? okMsg : r.error);
      return r.ok;
    } catch {
      setMsg('No se pudo completar la acción. Probá de nuevo.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const porPrenda = useMemo(() => {
    const m = new Map<string, Variante[]>();
    for (const v of variantes) {
      const lista = m.get(v.prenda_id);
      if (lista) lista.push(v);
      else m.set(v.prenda_id, [v]);
    }
    return m;
  }, [variantes]);

  // Cantidad reservada por modelo + talle + color.
  const reservado = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reservas) {
      const k = claveVar(r.prenda_id, r.talle, r.color);
      m.set(k, (m.get(k) ?? 0) + r.cantidad);
    }
    return m;
  }, [reservas]);

  const todosColores = useMemo(
    () => Array.from(new Set(variantes.map((v) => v.color))).sort(),
    [variantes]
  );

  const stats = useMemo(() => {
    let enMano = 0;
    let reponer = 0;
    let valor = 0;
    for (const p of prendas) {
      for (const v of porPrenda.get(p.id) ?? []) {
        const res = reservado.get(claveVar(p.id, v.talle, v.color)) ?? 0;
        enMano += v.cantidad;
        valor += v.cantidad * (p.costo_unitario ?? 0);
        if (estadoCelda(v.cantidad - res, p.stock_minimo) !== 'ok') reponer += 1;
      }
    }
    const reservadas = reservas.reduce((s, r) => s + r.cantidad, 0);
    return { enMano, reservadas, reponer, valor };
  }, [prendas, porPrenda, reservado, reservas]);

  const qn = q.trim().toLowerCase();

  const necesitaReponer = (p: Prenda) =>
    (porPrenda.get(p.id) ?? []).some(
      (v) =>
        estadoCelda(
          v.cantidad - (reservado.get(claveVar(p.id, v.talle, v.color)) ?? 0),
          p.stock_minimo
        ) !== 'ok'
    );

  const visibles = prendas.filter((p) => {
    const okFiltro = filtro === 'todos' ? true : necesitaReponer(p);
    const okBusqueda =
      !qn ||
      p.nombre.toLowerCase().includes(qn) ||
      (porPrenda.get(p.id) ?? []).some((v) => v.color.toLowerCase().includes(qn));
    return okFiltro && okBusqueda;
  });

  const renderPrenda = (p: Prenda) => {
    if (editando === p.id) {
      return (
        <div className="crm-item" key={p.id}>
          <ModeloForm
            initial={p}
            busy={busy}
            onCancel={() => setEditando(null)}
            onSubmit={async (d) => {
              const ok = await exec(actualizarPrenda(p.id, d), 'Modelo actualizado.');
              if (ok) setEditando(null);
              return ok;
            }}
          />
        </div>
      );
    }

    const vars = porPrenda.get(p.id) ?? [];
    const colores = Array.from(new Set(vars.map((v) => v.color))).sort((a, b) =>
      a.localeCompare(b, 'es')
    );
    const talles = Array.from(new Set(vars.map((v) => v.talle))).sort(
      (a, b) => ordenTalle(a) - ordenTalle(b) || a.localeCompare(b, 'es')
    );
    const celdas = new Map<string, Variante>(
      vars.map((v) => [`${v.color}|${v.talle}`, v])
    );
    const total = vars.reduce((s, v) => s + v.cantidad, 0);
    const faltan = vars.filter(
      (v) =>
        estadoCelda(
          v.cantidad - (reservado.get(claveVar(p.id, v.talle, v.color)) ?? 0),
          p.stock_minimo
        ) !== 'ok'
    ).length;

    // Pedidos que piden una combinación que ni siquiera está cargada.
    const sinCargar = reservas.filter(
      (r) => r.prenda_id === p.id && !celdas.has(`${r.color}|${r.talle}`)
    );

    return (
      <div className="crm-item" key={p.id}>
        <div className="crm-item-head">
          <div>
            <strong>{p.nombre}</strong>{' '}
            {faltan > 0 && (
              <span className="crm-badge bajo">{faltan} para reponer</span>
            )}
            <div className="crm-sub">
              {p.proveedor && <>{p.proveedor} · </>}
              {p.costo_unitario != null && <>costo {peso(p.costo_unitario)} · </>}
              avisa con {p.stock_minimo} o menos
            </div>
            {p.notas && <div className="crm-sub">{p.notas}</div>}
          </div>

          <div className="pr-head-total">
            {total}
            <small>en mano</small>
          </div>
        </div>

        {vars.length === 0 ? (
          <p className="crm-empty">
            Todavía no cargaste talles ni colores. Usá "+ AGREGAR STOCK".
          </p>
        ) : (
          <div className="pr-scroll">
            <table className="pr-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingLeft: 12 }}>COLOR</th>
                  {talles.map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                  <th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {colores.map((c) => {
                  const totalColor = vars
                    .filter((v) => v.color === c)
                    .reduce((s, v) => s + v.cantidad, 0);
                  return (
                    <tr key={c}>
                      <th>{c}</th>
                      {talles.map((t) => {
                        const v = celdas.get(`${c}|${t}`);
                        return (
                          <td key={t}>
                            {v ? (
                              <Celda
                                v={v}
                                reservado={reservado.get(claveVar(p.id, t, c)) ?? 0}
                                minimo={p.stock_minimo}
                                busy={busy}
                                exec={exec}
                              />
                            ) : (
                              <span className="pr-empty-cell">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="pr-total">{totalColor}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th style={{ textAlign: 'left', paddingLeft: 12 }}>Total</th>
                  {talles.map((t) => (
                    <td key={t}>
                      {vars
                        .filter((v) => v.talle === t)
                        .reduce((s, v) => s + v.cantidad, 0)}
                    </td>
                  ))}
                  <td className="pr-total">{total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {sinCargar.length > 0 && (
          <p className="inv-hint" style={{ color: '#e99' }}>
            Pedidos que piden prendas que no están cargadas:{' '}
            {sinCargar
              .map((r) => `${r.color} talle ${r.talle} ×${r.cantidad}`)
              .join(' · ')}
          </p>
        )}

        {agregando === p.id && (
          <AgregarStockForm
            busy={busy}
            onCancel={() => setAgregando(null)}
            onSubmit={(d) =>
              exec(
                agregarStock({ prenda_id: p.id, ...d }),
                `Agregado: ${d.color} talle ${d.talle}.`
              )
            }
          />
        )}

        <div className="crm-actions">
          <button onClick={() => setAgregando(agregando === p.id ? null : p.id)}>
            {agregando === p.id ? 'CERRAR' : '+ AGREGAR STOCK'}
          </button>
          <button onClick={() => setEditando(p.id)}>EDITAR MODELO</button>
          <button
            className="danger"
            onClick={async () => {
              if (
                confirm(
                  `¿Eliminar "${p.nombre}"? Se borran también todos sus talles y colores.`
                )
              )
                await exec(eliminarPrenda(p.id), 'Modelo eliminado.');
            }}
          >
            ELIMINAR
          </button>
        </div>
      </div>
    );
  };

  const movsVisibles = movimientos
    .filter((m) => !histPrenda || m.prenda_id === histPrenda)
    .slice(0, 100);

  return (
    <main className="admin crm">
      <header>
        <div>
          <span className="kicker">PEGASUS / ADMIN</span>
          <h1>Inventario de prendas</h1>
        </div>
      </header>

      <nav className="crm-nav">
        <a className="filter" href="/admin">
          DISEÑOS
        </a>
        <a className="filter" href="/admin/crm">
          CRM
        </a>
        <a className="filter active" href="/admin/inventario">
          INVENTARIO
        </a>
      </nav>

      {/* Sugerencias para los campos de color y talle */}
      <datalist id="colores-lista">
        {todosColores.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="talles-lista">
        {TALLES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {loadError && (
        <div className="crm-error">
          <strong>No se pudieron cargar los datos.</strong>
          <br />
          {loadError}
          <br />
          Si dice que no encuentra las tablas, ejecutá el archivo{' '}
          <code>prendas.sql</code> en el SQL Editor de Supabase.
        </div>
      )}

      {aviso && !loadError && <div className="crm-error">{aviso}</div>}

      <div className="crm-stats">
        <div className="crm-stat">
          <span className="muted">Prendas en mano</span>
          <b>{stats.enMano}</b>
        </div>
        <div className="crm-stat">
          <span className="muted">Reservadas p/ pedidos</span>
          <b>{stats.reservadas}</b>
        </div>
        <div className={`crm-stat ${stats.reponer ? 'warn' : ''}`}>
          <span className="muted">Para reponer</span>
          <b>{stats.reponer}</b>
        </div>
        <div className="crm-stat">
          <span className="muted">Valor en stock</span>
          <b>{peso(stats.valor)}</b>
        </div>
      </div>

      {msg && <p className="muted">{msg}</p>}

      <section className="admin-card">
        <div className="crm-toolbar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar modelo o color…"
          />
          <button className="crm-add" onClick={() => setNuevo(!nuevo)}>
            + NUEVO MODELO
          </button>
        </div>

        {nuevo && (
          <ModeloForm
            busy={busy}
            onCancel={() => setNuevo(false)}
            onSubmit={async (d) => {
              const ok = await exec(
                crearPrenda(d),
                'Modelo creado. Ahora agregale talles y colores con "+ AGREGAR STOCK".'
              );
              if (ok) setNuevo(false);
              return ok;
            }}
          />
        )}

        <div className="crm-chips">
          <button
            className={filtro === 'todos' ? 'on' : ''}
            onClick={() => setFiltro('todos')}
          >
            TODOS ({prendas.length})
          </button>
          <button
            className={filtro === 'reponer' ? 'on' : ''}
            onClick={() => setFiltro('reponer')}
          >
            PARA REPONER ({prendas.filter(necesitaReponer).length})
          </button>
        </div>

        {visibles.length === 0 && (
          <p className="crm-empty">
            {prendas.length === 0
              ? 'Todavía no cargaste prendas. Empezá con "+ NUEVO MODELO", por ejemplo "Remera de algodón", y después agregale talles y colores.'
              : 'No hay modelos en esta vista.'}
          </p>
        )}
        {visibles.map(renderPrenda)}

        <p className="inv-hint">
          "res." es lo apartado para pedidos aprobados, en producción o listos. Al
          marcar un pedido como Entregado, esas prendas se descuentan solas.
        </p>
      </section>

      <section className="admin-card">
        <div className="crm-toolbar">
          <h2 style={{ margin: 0, flex: 1 }}>Historial de movimientos</h2>
          <button className="crm-add" onClick={() => setVerHist(!verHist)}>
            {verHist ? 'OCULTAR' : 'VER HISTORIAL'}
          </button>
        </div>

        {verHist && (
          <>
            <div className="crm-toolbar">
              <select
                className="crm-estado"
                style={{ flex: 1 }}
                value={histPrenda}
                onChange={(e) => setHistPrenda(e.target.value)}
              >
                <option value="">Todos los modelos</option>
                {prendas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            {movsVisibles.length === 0 ? (
              <p className="crm-empty">
                Todavía no hay movimientos. Se registran solos cada vez que sumás,
                restás o entregás un pedido.
              </p>
            ) : (
              <div className="pr-scroll">
                <table className="pr-table pr-hist">
                  <thead>
                    <tr>
                      <th>FECHA</th>
                      <th>MODELO</th>
                      <th>COLOR · TALLE</th>
                      <th>MOV.</th>
                      <th>STOCK</th>
                      <th>MOTIVO / PEDIDO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movsVisibles.map((m) => (
                      <tr key={m.id}>
                        <td>{fmtFechaHora(m.created_at)}</td>
                        <td>{m.prenda_nombre ?? '(modelo eliminado)'}</td>
                        <td>
                          {m.color} · {m.talle}
                        </td>
                        <td className={m.cantidad > 0 ? 'pr-plus' : 'pr-minus'}>
                          {m.cantidad > 0 ? '+' : '−'}
                          {Math.abs(m.cantidad)}
                        </td>
                        <td>{m.stock_resultante}</td>
                        <td>
                          {[
                            m.motivo,
                            m.pedido_id ? pedidoLabels[m.pedido_id] : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
