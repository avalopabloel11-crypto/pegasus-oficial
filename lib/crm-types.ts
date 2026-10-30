export const ESTADOS = [
  'consulta',
  'presupuestado',
  'aprobado',
  'en_produccion',
  'listo',
  'entregado',
  'cancelado',
] as const;

export type Estado = (typeof ESTADOS)[number];

export const ESTADO_LABEL: Record<Estado, string> = {
  consulta: 'Consulta',
  presupuestado: 'Presupuestado',
  aprobado: 'Aprobado',
  en_produccion: 'En producción',
  listo: 'Listo para entregar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Pedidos que todavía requieren atención. */
export const ESTADOS_ACTIVOS: Estado[] = [
  'consulta',
  'presupuestado',
  'aprobado',
  'en_produccion',
  'listo',
];

/** Estados en los que ya hay un trabajo confirmado, así que cuenta el saldo a cobrar. */
export const ESTADOS_CON_SALDO: Estado[] = [
  'aprobado',
  'en_produccion',
  'listo',
  'entregado',
];

export const TIPOS = ['bordado', 'digitalizacion', 'otro'] as const;

export const TIPO_LABEL: Record<(typeof TIPOS)[number], string> = {
  bordado: 'Bordado',
  digitalizacion: 'Digitalización',
  otro: 'Otro',
};

export const ORIGENES = [
  'whatsapp',
  'instagram',
  'web',
  'recomendacion',
  'otro',
] as const;

export const ORIGEN_LABEL: Record<(typeof ORIGENES)[number], string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  web: 'Página web',
  recomendacion: 'Recomendación',
  otro: 'Otro',
};

export type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  origen: string | null;
  notas: string | null;
  created_at: string;
};

export type Pedido = {
  id: string;
  cliente_id: string;
  titulo: string;
  descripcion: string | null;
  tipo: string | null;
  cantidad: number | null;
  presupuesto_monto: number | null;
  sena_monto: number | null;
  estado: Estado;
  fecha_entrega: string | null;
  created_at: string;
  updated_at: string;
};

export type Seguimiento = {
  id: string;
  cliente_id: string;
  pedido_id: string | null;
  nota: string;
  proximo_contacto: string | null;
  created_at: string;
};

export type ActionResult = { ok: true } | { ok: false; error: string };
