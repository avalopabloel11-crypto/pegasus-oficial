'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  ESTADOS,
  ESTADOS_ACTIVOS,
  ESTADOS_CON_SALDO,
  ESTADO_LABEL,
  ORIGENES,
  ORIGEN_LABEL,
  TIPOS,
  TIPO_LABEL,
  type ActionResult,
  type Cliente,
  type Estado,
  type Pedido,
  type Seguimiento,
} from '@/lib/crm-types';
import {
  ordenTalle,
  type LineaPedido,
  type Prenda,
  type Variante,
} from '@/lib/inventario-types';
import {
  actualizarCliente,
  actualizarPedido,
  cambiarEstadoPedido,
  completarSeguimiento,
  crearCliente,
  crearPedido,
  crearSeguimiento,
  eliminarCliente,
  eliminarPedido,
  eliminarSeguimiento,
} from '@/app/admin/crm/actions';

// ---------- utilidades ----------

const peso = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '—'
    : new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
      }).format(n);

const fmtFecha = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
      })
    : '—';

/** Fecha de un timestamp (created_at) en la zona horaria del navegador. */
const fmtTs = (ts: string) =>
  new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

/** Arma el link de WhatsApp. Si el número no trae código de país, asume Argentina (549). */
function waLink(tel: string | null) {
  if (!tel) return null;
  let d = tel.replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return null;
  if (!d.startsWith('54')) d = `549${d}`;
  return `https://wa.me/${d}`;
}

type Tab = 'pedidos' | 'clientes' | 'seguimientos';
type Exec = (p: Promise<ActionResult>, okMsg: string) => Promise<boolean>;
type FieldEvent = ChangeEvent<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
>;

// ---------- formularios ----------

function ClienteForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Cliente;
  busy: boolean;
  onSubmit: (d: {
    nombre: string;
    telefono: string;
    email: string;
    origen: string;
    notas: string;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [d, setD] = useState({
    nombre: initial?.nombre ?? '',
    telefono: initial?.telefono ?? '',
    email: initial?.email ?? '',
    origen: initial?.origen ?? 'whatsapp',
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
      <div className="grid">
        <label className="field">
          Nombre
          <input value={d.nombre} onChange={set('nombre')} required />
        </label>
        <label className="field">
          Teléfono / WhatsApp
          <input
            value={d.telefono}
            onChange={set('telefono')}
            placeholder="3436 612634 (sin 0 ni 15)"
          />
        </label>
      </div>
      <div className="grid">
        <label className="field">
          Email
          <input type="email" value={d.email} onChange={set('email')} />
        </label>
        <label className="field">
          ¿Cómo llegó?
          <select value={d.origen} onChange={set('origen')}>
            {ORIGENES.map((o) => (
              <option key={o} value={o}>
                {ORIGEN_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Notas
        <textarea rows={2} value={d.notas} onChange={set('notas')} />
      </label>
      <div className="crm-form-actions">
        <button className="primary" disabled={busy}>
          {busy ? 'GUARDANDO...' : initial ? 'GUARDAR CAMBIOS' : '+ AGREGAR CLIENTE'}
        </button>
        <button type="button" className="crm-cancel" onClick={onCancel}>
          CANCELAR
        </button>
      </div>
    </form>
  );
}

type LineaForm = { variante_id: string; cantidad: string };

function PedidoForm({
  clientes,
  prendas,
  variantes,
  lineasPedidos,
  fixedClienteId,
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  clientes: Cliente[];
  prendas: Prenda[];
  variantes: Variante[];
  lineasPedidos: LineaPedido[];
  fixedClienteId?: string;
  initial?: Pedido;
  busy: boolean;
  onSubmit: (d: {
    cliente_id: string;
    titulo: string;
    descripcion: string;
    tipo: string;
    cantidad: string;
    presupuesto_monto: string;
    sena_monto: string;
    estado: string;
    fecha_entrega: string;
    lineas: {
      prenda_id: string;
      talle: string;
      color: string;
      cantidad: string;
    }[];
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  // Opciones del selector: cada combinación de modelo + color + talle que existe en el inventario.
  const nombrePrenda = new Map<string, string>(prendas.map((p) => [p.id, p.nombre]));
  const opciones = variantes
    .filter((v) => nombrePrenda.has(v.prenda_id))
    .sort(
      (a, b) =>
        (nombrePrenda.get(a.prenda_id) ?? '').localeCompare(
          nombrePrenda.get(b.prenda_id) ?? '',
          'es'
        ) ||
        a.color.localeCompare(b.color, 'es') ||
        ordenTalle(a.talle) - ordenTalle(b.talle)
    );

  // Las prendas ya descontadas (pedido entregado) no se pueden editar.
  const propias = initial
    ? lineasPedidos.filter((l) => l.pedido_id === initial.id)
    : [];
  const bloqueadas = propias.filter((l) => l.descontado);

  const [lineas, setLineas] = useState<LineaForm[]>(
    propias
      .filter((l) => !l.descontado)
      .flatMap((l) => {
        const v = variantes.find(
          (x) =>
            x.prenda_id === l.prenda_id &&
            x.talle === l.talle &&
            x.color === l.color
        );
        return v ? [{ variante_id: v.id, cantidad: String(l.cantidad) }] : [];
      })
  );

  const lineasParaEnviar = lineas.flatMap((l) => {
    const v = variantes.find((x) => x.id === l.variante_id);
    return v
      ? [
          {
            prenda_id: v.prenda_id,
            talle: v.talle,
            color: v.color,
            cantidad: l.cantidad,
          },
        ]
      : [];
  });

  const [d, setD] = useState({
    cliente_id: initial?.cliente_id ?? fixedClienteId ?? '',
    titulo: initial?.titulo ?? '',
    descripcion: initial?.descripcion ?? '',
    tipo: initial?.tipo ?? 'bordado',
    cantidad: String(initial?.cantidad ?? 1),
    presupuesto_monto:
      initial?.presupuesto_monto != null ? String(initial.presupuesto_monto) : '',
    sena_monto: initial?.sena_monto != null ? String(initial.sena_monto) : '',
    estado: initial?.estado ?? 'consulta',
    fecha_entrega: initial?.fecha_entrega ?? '',
  });

  const set = (k: keyof typeof d) => (e: FieldEvent) =>
    setD({ ...d, [k]: e.target.value });

  return (
    <form
      className="crm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({ ...d, lineas: lineasParaEnviar });
      }}
    >
      {!fixedClienteId && !initial && (
        <label className="field">
          Cliente
          <select value={d.cliente_id} onChange={set('cliente_id')} required>
            <option value="">Elegí un cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid">
        <label className="field">
          Trabajo
          <input
            value={d.titulo}
            onChange={set('titulo')}
            placeholder="Ej: Logo en 20 camperas"
            required
          />
        </label>
        <label className="field">
          Tipo
          <select value={d.tipo} onChange={set('tipo')}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        Detalle
        <textarea
          rows={2}
          value={d.descripcion}
          onChange={set('descripcion')}
          placeholder="Medidas, colores, prendas, aclaraciones…"
        />
      </label>

      <div className="grid">
        <label className="field">
          Cantidad
          <input
            type="number"
            min={1}
            value={d.cantidad}
            onChange={set('cantidad')}
          />
        </label>
        <label className="field">
          Estado
          <select value={d.estado} onChange={set('estado')}>
            {ESTADOS.map((s) => (
              <option key={s} value={s}>
                {ESTADO_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid">
        <label className="field">
          Presupuesto total ($)
          <input
            type="number"
            min={0}
            step="0.01"
            value={d.presupuesto_monto}
            onChange={set('presupuesto_monto')}
          />
        </label>
        <label className="field">
          Seña / pagado ($)
          <input
            type="number"
            min={0}
            step="0.01"
            value={d.sena_monto}
            onChange={set('sena_monto')}
          />
        </label>
      </div>

      <label className="field">
        Fecha de entrega
        <input
          type="date"
          value={d.fecha_entrega}
          onChange={set('fecha_entrega')}
        />
      </label>

      <div className="crm-lines">
        Prendas del inventario (opcional)
        {bloqueadas.length > 0 && (
          <p className="inv-hint">
            Ya descontadas del stock:{' '}
            {bloqueadas
              .map(
                (l) =>
                  `${nombrePrenda.get(l.prenda_id) ?? 'Prenda'} ${l.color} ${l.talle} ×${l.cantidad}`
              )
              .join(' · ')}
          </p>
        )}
        {lineas.map((l, i) => (
          <div className="pr-line" key={i}>
            <select
              value={l.variante_id}
              onChange={(e) =>
                setLineas(
                  lineas.map((x, j) =>
                    j === i ? { ...x, variante_id: e.target.value } : x
                  )
                )
              }
              required
            >
              <option value="">Elegí modelo, color y talle…</option>
              {opciones.map((v) => (
                <option key={v.id} value={v.id}>
                  {nombrePrenda.get(v.prenda_id)} · {v.color} · {v.talle} (hay{' '}
                  {v.cantidad})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              step={1}
              value={l.cantidad}
              aria-label="Cantidad"
              onChange={(e) =>
                setLineas(
                  lineas.map((x, j) =>
                    j === i ? { ...x, cantidad: e.target.value } : x
                  )
                )
              }
            />
            <button
              type="button"
              className="danger"
              aria-label="Quitar prenda"
              onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="crm-actions">
          <button
            type="button"
            onClick={() =>
              setLineas([...lineas, { variante_id: '', cantidad: '1' }])
            }
          >
            + AGREGAR PRENDA
          </button>
        </div>
        {opciones.length === 0 ? (
          <p className="inv-hint">
            Todavía no hay prendas en el inventario. Cargalas en INVENTARIO para poder
            asignarlas a un pedido.
          </p>
        ) : (
          <p className="inv-hint">
            Quedan apartadas cuando el pedido está aprobado, en producción o listo, y
            se descuentan del stock al pasarlo a Entregado.
          </p>
        )}
      </div>

      <div className="crm-form-actions">
        <button className="primary" disabled={busy}>
          {busy ? 'GUARDANDO...' : initial ? 'GUARDAR CAMBIOS' : '+ AGREGAR PEDIDO'}
        </button>
        <button type="button" className="crm-cancel" onClick={onCancel}>
          CANCELAR
        </button>
      </div>
    </form>
  );
}

function SeguimientoForm({
  clientes,
  pedidos,
  fixedClienteId,
  busy,
  onSubmit,
  onCancel,
}: {
  clientes: Cliente[];
  pedidos: Pedido[];
  fixedClienteId?: string;
  busy: boolean;
  onSubmit: (d: {
    cliente_id: string;
    pedido_id: string;
    nota: string;
    proximo_contacto: string;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [d, setD] = useState({
    cliente_id: fixedClienteId ?? '',
    pedido_id: '',
    nota: '',
    proximo_contacto: '',
  });

  const set = (k: keyof typeof d) => (e: FieldEvent) =>
    setD({ ...d, [k]: e.target.value });

  const pedidosDelCliente = pedidos.filter((p) => p.cliente_id === d.cliente_id);

  return (
    <form
      className="crm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(d);
      }}
    >
      {!fixedClienteId && (
        <label className="field">
          Cliente
          <select
            value={d.cliente_id}
            onChange={(e) => setD({ ...d, cliente_id: e.target.value, pedido_id: '' })}
            required
          >
            <option value="">Elegí un cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        Nota
        <textarea
          rows={2}
          value={d.nota}
          onChange={set('nota')}
          placeholder="Qué se habló o qué hay que hacer"
          required
        />
      </label>

      <div className="grid">
        <label className="field">
          Volver a contactar el
          <input
            type="date"
            value={d.proximo_contacto}
            onChange={set('proximo_contacto')}
          />
        </label>
        <label className="field">
          Pedido relacionado
          <select value={d.pedido_id} onChange={set('pedido_id')}>
            <option value="">Ninguno</option>
            {pedidosDelCliente.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="crm-form-actions">
        <button className="primary" disabled={busy}>
          {busy ? 'GUARDANDO...' : '+ GUARDAR NOTA'}
        </button>
        <button type="button" className="crm-cancel" onClick={onCancel}>
          CANCELAR
        </button>
      </div>
    </form>
  );
}

// ---------- panel principal ----------

export default function CrmPanel({
  clientes,
  pedidos,
  seguimientos,
  prendas,
  variantes,
  lineas,
  loadError,
}: {
  clientes: Cliente[];
  pedidos: Pedido[];
  seguimientos: Seguimiento[];
  prendas: Prenda[];
  variantes: Variante[];
  lineas: LineaPedido[];
  loadError: string | null;
}) {
  const [tab, setTab] = useState<Tab>('pedidos');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState('');

  // pedidos
  const [filtro, setFiltro] = useState<'activos' | 'todos' | Estado>('activos');
  const [nuevoPedido, setNuevoPedido] = useState(false);
  const [editPedido, setEditPedido] = useState<string | null>(null);

  // clientes
  const [q, setQ] = useState('');
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [editCliente, setEditCliente] = useState<string | null>(null);
  const [pedidoDeCliente, setPedidoDeCliente] = useState<string | null>(null);
  const [notaDeCliente, setNotaDeCliente] = useState<string | null>(null);

  // seguimientos
  const [nuevoSeg, setNuevoSeg] = useState(false);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-CA'));
  }, []);

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

  const clienteById = useMemo(
    () => new Map<string, Cliente>(clientes.map((c) => [c.id, c])),
    [clientes]
  );

  const nombrePrenda = useMemo(
    () => new Map<string, string>(prendas.map((p) => [p.id, p.nombre])),
    [prendas]
  );

  const stats = useMemo(() => {
    const activos = pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado));
    const porCobrar = pedidos
      .filter((p) => ESTADOS_CON_SALDO.includes(p.estado))
      .reduce(
        (sum, p) =>
          sum + Math.max(0, (p.presupuesto_monto ?? 0) - (p.sena_monto ?? 0)),
        0
      );
    const pendientes = today
      ? seguimientos.filter((s) => s.proximo_contacto && s.proximo_contacto <= today)
          .length
      : 0;
    const limite = today ? addDays(today, 7) : '';
    const entregas = today
      ? activos.filter(
          (p) =>
            p.fecha_entrega && p.fecha_entrega >= today && p.fecha_entrega <= limite
        ).length
      : 0;
    return { activos: activos.length, porCobrar, pendientes, entregas };
  }, [pedidos, seguimientos, today]);

  // ---------- render de un pedido ----------

  const renderPedido = (p: Pedido, mostrarCliente: boolean) => {
    if (editPedido === p.id) {
      return (
        <div className="crm-item" key={p.id}>
          <PedidoForm
            clientes={clientes}
            prendas={prendas}
            variantes={variantes}
            lineasPedidos={lineas}
            initial={p}
            busy={busy}
            onCancel={() => setEditPedido(null)}
            onSubmit={async (d) => {
              const ok = await exec(actualizarPedido(p.id, d), 'Pedido actualizado.');
              if (ok) setEditPedido(null);
              return ok;
            }}
          />
        </div>
      );
    }

    const cli = clienteById.get(p.cliente_id);
    const misLineas = lineas.filter((l) => l.pedido_id === p.id);
    const saldo = Math.max(0, (p.presupuesto_monto ?? 0) - (p.sena_monto ?? 0));
    const atrasado =
      !!p.fecha_entrega &&
      !!today &&
      p.fecha_entrega < today &&
      ESTADOS_ACTIVOS.includes(p.estado);

    return (
      <div className="crm-item" key={p.id}>
        <div className="crm-item-head">
          <div>
            <strong>{p.titulo}</strong>
            <div className="crm-sub">
              {mostrarCliente && cli && (
                <>
                  <button
                    className="crm-link"
                    onClick={() => {
                      setTab('clientes');
                      setAbierto(cli.id);
                    }}
                  >
                    {cli.nombre}
                  </button>
                  {' · '}
                </>
              )}
              {TIPO_LABEL[(p.tipo as keyof typeof TIPO_LABEL) ?? 'otro'] ?? p.tipo}
              {' · '}
              {p.cantidad ?? 1} u.
              {p.fecha_entrega && (
                <>
                  {' · entrega '}
                  <span className={atrasado ? 'crm-late' : ''}>
                    {fmtFecha(p.fecha_entrega)}
                    {atrasado ? ' (atrasado)' : ''}
                  </span>
                </>
              )}
            </div>
          </div>

          <select
            className="crm-estado"
            value={p.estado}
            disabled={busy}
            onChange={(e) => {
              const nuevo = e.target.value as Estado;
              const porDescontar = misLineas
                .filter((l) => !l.descontado)
                .reduce((s, l) => s + l.cantidad, 0);
              const yaDescontadas = misLineas
                .filter((l) => l.descontado)
                .reduce((s, l) => s + l.cantidad, 0);

              if (
                nuevo === 'entregado' &&
                porDescontar > 0 &&
                !confirm(
                  `Al marcar como entregado se descuentan ${porDescontar} prenda(s) del inventario. ¿Continuar?`
                )
              )
                return;

              if (
                p.estado === 'entregado' &&
                nuevo !== 'entregado' &&
                yaDescontadas > 0 &&
                !confirm(
                  `Se devuelven ${yaDescontadas} prenda(s) al inventario. ¿Continuar?`
                )
              )
                return;

              exec(
                cambiarEstadoPedido(p.id, nuevo),
                porDescontar > 0 && nuevo === 'entregado'
                  ? `Entregado. Se descontaron ${porDescontar} prenda(s) del inventario.`
                  : `Estado: ${ESTADO_LABEL[nuevo]}`
              );
            }}
          >
            {ESTADOS.map((s) => (
              <option key={s} value={s}>
                {ESTADO_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {p.descripcion && <div className="crm-sub">{p.descripcion}</div>}

        {misLineas.length > 0 && (
          <div className="crm-sub">
            Prendas:{' '}
            {misLineas
              .map(
                (l) =>
                  `${nombrePrenda.get(l.prenda_id) ?? 'Prenda'} ${l.color} ${l.talle} ×${l.cantidad}${
                    l.descontado ? ' ✓' : ''
                  }`
              )
              .join(' · ')}
          </div>
        )}

        <div className="crm-money">
          <span>
            Presupuesto: <b>{peso(p.presupuesto_monto)}</b>
          </span>
          <span>
            Seña: <b>{peso(p.sena_monto ?? 0)}</b>
          </span>
          {p.presupuesto_monto != null && (
            <span>
              Saldo: <b>{peso(saldo)}</b>
            </span>
          )}
        </div>

        <div className="crm-actions">
          <button onClick={() => setEditPedido(p.id)}>EDITAR</button>
          <button
            className="danger"
            onClick={async () => {
              if (confirm(`¿Eliminar el pedido "${p.titulo}"?`))
                await exec(eliminarPedido(p.id), 'Pedido eliminado.');
            }}
          >
            ELIMINAR
          </button>
        </div>
      </div>
    );
  };

  // ---------- pestaña pedidos ----------

  const pedidosFiltrados = pedidos.filter((p) =>
    filtro === 'todos'
      ? true
      : filtro === 'activos'
      ? ESTADOS_ACTIVOS.includes(p.estado)
      : p.estado === filtro
  );

  const tabPedidos = (
    <section className="admin-card">
      <div className="crm-toolbar">
        <h2 style={{ margin: 0, flex: 1 }}>Pedidos</h2>
        <button
          className="crm-add"
          onClick={() => {
            if (!clientes.length) {
              setMsg('Primero agregá un cliente.');
              setTab('clientes');
              setNuevoCliente(true);
              return;
            }
            setNuevoPedido(!nuevoPedido);
          }}
        >
          + NUEVO PEDIDO
        </button>
      </div>

      {nuevoPedido && (
        <PedidoForm
          clientes={clientes}
          prendas={prendas}
          variantes={variantes}
          lineasPedidos={lineas}
          busy={busy}
          onCancel={() => setNuevoPedido(false)}
          onSubmit={async (d) => {
            const ok = await exec(crearPedido(d), 'Pedido agregado.');
            if (ok) setNuevoPedido(false);
            return ok;
          }}
        />
      )}

      <div className="crm-chips">
        {(['activos', 'todos', ...ESTADOS] as const).map((f) => {
          const count =
            f === 'todos'
              ? pedidos.length
              : f === 'activos'
              ? pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado)).length
              : pedidos.filter((p) => p.estado === f).length;
          return (
            <button
              key={f}
              className={filtro === f ? 'on' : ''}
              onClick={() => setFiltro(f)}
            >
              {f === 'activos' ? 'ACTIVOS' : f === 'todos' ? 'TODOS' : ESTADO_LABEL[f].toUpperCase()}{' '}
              ({count})
            </button>
          );
        })}
      </div>

      {pedidosFiltrados.length === 0 && (
        <p className="crm-empty">No hay pedidos en esta vista.</p>
      )}
      {pedidosFiltrados.map((p) => renderPedido(p, true))}
    </section>
  );

  // ---------- pestaña clientes ----------

  const qn = q.trim().toLowerCase();
  const clientesFiltrados = clientes.filter(
    (c) =>
      !qn ||
      c.nombre.toLowerCase().includes(qn) ||
      (c.telefono ?? '').toLowerCase().includes(qn) ||
      (c.email ?? '').toLowerCase().includes(qn)
  );

  const renderCliente = (c: Cliente) => {
    const susPedidos = pedidos.filter((p) => p.cliente_id === c.id);
    const susNotas = seguimientos.filter((s) => s.cliente_id === c.id);
    const wa = waLink(c.telefono);
    const abiertoAhora = abierto === c.id;
    const activos = susPedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado)).length;

    if (editCliente === c.id) {
      return (
        <div className="crm-item" key={c.id}>
          <ClienteForm
            initial={c}
            busy={busy}
            onCancel={() => setEditCliente(null)}
            onSubmit={async (d) => {
              const ok = await exec(actualizarCliente(c.id, d), 'Cliente actualizado.');
              if (ok) setEditCliente(null);
              return ok;
            }}
          />
        </div>
      );
    }

    return (
      <div className="crm-item" key={c.id}>
        <div className="crm-item-head">
          <div>
            <strong>{c.nombre}</strong>
            <div className="crm-sub">
              {c.telefono && (
                <>
                  {wa ? (
                    <a href={wa} target="_blank" rel="noreferrer">
                      {c.telefono}
                    </a>
                  ) : (
                    c.telefono
                  )}
                  {' · '}
                </>
              )}
              {c.email && <>{c.email} · </>}
              {ORIGEN_LABEL[(c.origen as keyof typeof ORIGEN_LABEL) ?? 'otro'] ?? c.origen}
              {' · '}
              {activos} pedido{activos === 1 ? '' : 's'} activo{activos === 1 ? '' : 's'}
            </div>
          </div>
          <button
            className="crm-mini"
            onClick={() => setAbierto(abiertoAhora ? null : c.id)}
          >
            {abiertoAhora ? 'CERRAR' : 'VER FICHA'}
          </button>
        </div>

        {abiertoAhora && (
          <div className="crm-detail">
            {c.notas && (
              <>
                <h3>Notas</h3>
                <div className="crm-sub">{c.notas}</div>
              </>
            )}

            <h3>Pedidos ({susPedidos.length})</h3>
            {susPedidos.length === 0 && <p className="crm-empty">Todavía no tiene pedidos.</p>}
            {susPedidos.map((p) => renderPedido(p, false))}

            {pedidoDeCliente === c.id ? (
              <PedidoForm
                clientes={clientes}
                prendas={prendas}
                variantes={variantes}
                lineasPedidos={lineas}
                fixedClienteId={c.id}
                busy={busy}
                onCancel={() => setPedidoDeCliente(null)}
                onSubmit={async (d) => {
                  const ok = await exec(crearPedido(d), 'Pedido agregado.');
                  if (ok) setPedidoDeCliente(null);
                  return ok;
                }}
              />
            ) : (
              <div className="crm-actions">
                <button onClick={() => setPedidoDeCliente(c.id)}>+ PEDIDO</button>
              </div>
            )}

            <h3>Seguimiento ({susNotas.length})</h3>
            {susNotas.length === 0 && <p className="crm-empty">Sin notas todavía.</p>}
            {susNotas.map((s) => (
              <div className="crm-note" key={s.id}>
                {s.nota}
                <small>
                  {fmtTs(s.created_at)}
                  {s.proximo_contacto && <> · volver a contactar {fmtFecha(s.proximo_contacto)}</>}
                  {s.pedido_id && pedidos.find((p) => p.id === s.pedido_id) && (
                    <> · {pedidos.find((p) => p.id === s.pedido_id)!.titulo}</>
                  )}
                </small>
                <div className="crm-actions" style={{ marginTop: 6 }}>
                  {s.proximo_contacto && (
                    <button onClick={() => exec(completarSeguimiento(s.id), 'Recordatorio hecho.')}>
                      HECHO
                    </button>
                  )}
                  <button
                    className="danger"
                    onClick={async () => {
                      if (confirm('¿Eliminar esta nota?'))
                        await exec(eliminarSeguimiento(s.id), 'Nota eliminada.');
                    }}
                  >
                    ELIMINAR
                  </button>
                </div>
              </div>
            ))}

            {notaDeCliente === c.id ? (
              <SeguimientoForm
                clientes={clientes}
                pedidos={pedidos}
                fixedClienteId={c.id}
                busy={busy}
                onCancel={() => setNotaDeCliente(null)}
                onSubmit={async (d) => {
                  const ok = await exec(crearSeguimiento(d), 'Nota guardada.');
                  if (ok) setNotaDeCliente(null);
                  return ok;
                }}
              />
            ) : (
              <div className="crm-actions">
                <button onClick={() => setNotaDeCliente(c.id)}>+ NOTA / RECORDATORIO</button>
              </div>
            )}

            <div className="crm-actions" style={{ marginTop: 16 }}>
              {wa && (
                <a className="crm-mini" href={wa} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  ABRIR WHATSAPP
                </a>
              )}
              <button onClick={() => setEditCliente(c.id)}>EDITAR CLIENTE</button>
              <button
                className="danger"
                onClick={async () => {
                  if (
                    confirm(
                      `¿Eliminar a ${c.nombre}? Se borran también sus pedidos y notas.`
                    )
                  )
                    await exec(eliminarCliente(c.id), 'Cliente eliminado.');
                }}
              >
                ELIMINAR CLIENTE
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const tabClientes = (
    <section className="admin-card">
      <div className="crm-toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email…"
        />
        <button className="crm-add" onClick={() => setNuevoCliente(!nuevoCliente)}>
          + NUEVO CLIENTE
        </button>
      </div>

      {nuevoCliente && (
        <ClienteForm
          busy={busy}
          onCancel={() => setNuevoCliente(false)}
          onSubmit={async (d) => {
            const ok = await exec(crearCliente(d), 'Cliente agregado.');
            if (ok) setNuevoCliente(false);
            return ok;
          }}
        />
      )}

      {clientesFiltrados.length === 0 && (
        <p className="crm-empty">
          {clientes.length === 0
            ? 'Todavía no cargaste clientes.'
            : 'Ningún cliente coincide con la búsqueda.'}
        </p>
      )}
      {clientesFiltrados.map(renderCliente)}
    </section>
  );

  // ---------- pestaña seguimientos ----------

  const pendientes = seguimientos
    .filter((s) => s.proximo_contacto)
    .sort((a, b) => (a.proximo_contacto! < b.proximo_contacto! ? -1 : 1));

  const tabSeguimientos = (
    <section className="admin-card">
      <div className="crm-toolbar">
        <h2 style={{ margin: 0, flex: 1 }}>Para contactar</h2>
        <button
          className="crm-add"
          onClick={() => {
            if (!clientes.length) {
              setMsg('Primero agregá un cliente.');
              setTab('clientes');
              setNuevoCliente(true);
              return;
            }
            setNuevoSeg(!nuevoSeg);
          }}
        >
          + RECORDATORIO
        </button>
      </div>

      {nuevoSeg && (
        <SeguimientoForm
          clientes={clientes}
          pedidos={pedidos}
          busy={busy}
          onCancel={() => setNuevoSeg(false)}
          onSubmit={async (d) => {
            const ok = await exec(crearSeguimiento(d), 'Recordatorio guardado.');
            if (ok) setNuevoSeg(false);
            return ok;
          }}
        />
      )}

      {pendientes.length === 0 && (
        <p className="crm-empty">
          No hay contactos pendientes. Agregá un recordatorio con fecha desde acá o
          desde la ficha de un cliente.
        </p>
      )}

      {pendientes.map((s) => {
        const cli = clienteById.get(s.cliente_id);
        const vencido = !!today && !!s.proximo_contacto && s.proximo_contacto <= today;
        const wa = waLink(cli?.telefono ?? null);
        return (
          <div className="crm-item" key={s.id}>
            <div className="crm-item-head">
              <div>
                <strong>{cli?.nombre ?? 'Cliente eliminado'}</strong>
                <div className="crm-sub">
                  <span className={vencido ? 'crm-late' : ''}>
                    {s.proximo_contacto === today ? 'Hoy' : fmtFecha(s.proximo_contacto)}
                    {vencido && s.proximo_contacto !== today ? ' (vencido)' : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="crm-sub">{s.nota}</div>
            <div className="crm-actions">
              <button onClick={() => exec(completarSeguimiento(s.id), 'Recordatorio hecho.')}>
                HECHO
              </button>
              {wa && (
                <a className="crm-mini" href={wa} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  WHATSAPP
                </a>
              )}
              {cli && (
                <button
                  onClick={() => {
                    setTab('clientes');
                    setAbierto(cli.id);
                  }}
                >
                  VER FICHA
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );

  // ---------- layout ----------

  return (
    <main className="admin crm">
      <header>
        <div>
          <span className="kicker">PEGASUS / ADMIN</span>
          <h1>CRM</h1>
        </div>
      </header>

      <nav className="crm-nav">
        <a className="filter" href="/admin">
          DISEÑOS
        </a>
        <a className="filter active" href="/admin/crm">
          CRM
        </a>
        <a className="filter" href="/admin/inventario">
          INVENTARIO
        </a>
      </nav>

      {loadError && (
        <div className="crm-error">
          <strong>No se pudieron cargar los datos.</strong>
          <br />
          {loadError}
          <br />
          Si dice que no encuentra las tablas, ejecutá el archivo{' '}
          <code>crm_inventario.sql</code> en el SQL Editor de Supabase.
        </div>
      )}

      <div className="crm-stats">
        <div className="crm-stat">
          <span className="muted">Pedidos activos</span>
          <b>{stats.activos}</b>
        </div>
        <div className="crm-stat">
          <span className="muted">Saldo por cobrar</span>
          <b>{peso(stats.porCobrar)}</b>
        </div>
        <div className={`crm-stat ${stats.pendientes ? 'warn' : ''}`}>
          <span className="muted">Contactos para hoy</span>
          <b>{stats.pendientes}</b>
        </div>
        <div className="crm-stat">
          <span className="muted">Entregas en 7 días</span>
          <b>{stats.entregas}</b>
        </div>
      </div>

      <div className="crm-tabs">
        {(
          [
            ['pedidos', 'PEDIDOS'],
            ['clientes', 'CLIENTES'],
            ['seguimientos', 'SEGUIMIENTO'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {msg && <p className="muted">{msg}</p>}

      {tab === 'pedidos' && tabPedidos}
      {tab === 'clientes' && tabClientes}
      {tab === 'seguimientos' && tabSeguimientos}
    </main>
  );
}
