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

/** Cantidad de una combinación de talle y color de un modelo. */
export type Variante = {
  id: string;
  prenda_id: string;
  talle: string;
  color: string;
  cantidad: number;
};
