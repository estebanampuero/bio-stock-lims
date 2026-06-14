export type Rol = "ADMIN" | "TECNOLOGO" | "TECNICO";

export interface User {
  id: string;
  nombre: string;
  rol: Rol;
  must_change_pin?: boolean;
}

export interface InvRow extends Partial<PrepFields> {
  id: string; gtin: string; lot: string; expiration: string; usuario: string;
  nombre?: string; abreviado?: string; detalle?: string; seccion?: string;
  temperatura?: string; preparacion?: string; min_stock?: number | null;
  estado_aceptacion?: string;
}

export interface GroupedItem extends Partial<PrepFields> {
  gtin: string; lot: string; nombre: string; abreviado: string;
  detalle: string; seccion: string;
  expiration: string; temperatura: string; preparacion: string;
  cantidad: number; itemIds: string[]; min_stock?: number | null;
  estado_aceptacion?: string;
}

export interface Protocolo {
  id: string; titulo: string; seccion: string; contenido: string;
  autor: string; created_at: string; updated_at: string;
}

export interface Anexo {
  id: string; servicio: string; salas: string; numero: string;
  creado_por: string; created_at: string; updated_at: string;
}

export type TempStorage = "Refrigerado" | "Congelado" | "Ambiente";
export type YesNo = "Si" | "No";

export interface PrepFields {
  almacenamiento_sin_abrir: TempStorage | "";
  descongelar_min: number | null;            // null = no aplica
  reconstituir: YesNo | "";
  tiempo_reconstitucion_min: number | null;  // null = no aplica
  temperatura_post_reconstitucion: TempStorage | "";
  duracion_dias: number | null;
  cantidad_alicuotas: number | null;
  volumen_ul: number | null;
  dias_uso_aprox: number | null;             // días de autonomía por unidad
}

export interface ProductForm extends PrepFields {
  gtin: string; lot: string; exp: string;
  nombre: string; abreviado: string;
  detalle: string; seccion: string; pack: string;
  temperatura: string; preparacion: string;
  min_stock: number | null;                  // umbral para alerta de stock bajo
}

export interface MaestroRow extends PrepFields {
  gtin: string; nombre: string; detalle: string; pack: string;
  seccion: string; temperatura: string; preparacion: string;
  fecha_baja: string | null;
}

export interface LogEntry {
  id: number; usuario: string; perfil: string; accion: string; detalles: string; fecha: string; ip?: string;
}

export interface BulkImportResult {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}
