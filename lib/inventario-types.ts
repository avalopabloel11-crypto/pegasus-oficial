/** Talles sugeridos. Se pueden escribir otros a mano. Siempre en mayúsculas. */
export const TALLES = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '3XL',
  '4XL',
  '2',
  '4',
  '6',
  '8',
  '10',
  '12',
  '14',
  '16',
  'ÚNICO',
] as const;

/** Orden para mostrar los talles: primero los conocidos, después el resto. */
export const ordenTalle = (t: string) => {
  const i = (TALLES as readonly string[]).indexOf(t);
  return i === -1 ? 999 : i;
};

/** Un modelo de prenda, por ejemplo "Chomba piqué" o "Remera de algodón". */
export type Prenda = {
  id: string;
  nombre: string;
  proveedor: string | null;
  costo_unitario: number | null;
  stock_minimo: number;
  notas: string | null;
  created_at: string;
};

/** Un movimiento del historial. cantidad con signo: + entra, − sale. */
export type Movimiento = {
  id: string;
  prenda_id: string | null;
  prenda_nombre: string | null;
  talle: string;
  color: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  cantidad: number;
  stock_resultante: number;
  motivo: string | null;
  pedido_id: string | null;
  created_at: string;
};

/** Prenda del inventario que lleva un pedido del CRM. */
export type LineaPedido = {
  id: string;
  pedido_id: string;
  prenda_id: string;
  talle: string;
  color: string;
  cantidad: number;
  /** true cuando el pedido se entregó y el stock ya bajó. */
  descontado: boolean;
};

/** Cantidad de una combinación de talle y color de un modelo. */
export type Variante = {
  id: string;
  prenda_id: string;
  talle: string;
  color: string;
  cantidad: number;
};
