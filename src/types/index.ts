export type Rol = "ADMIN" | "TECNOLOGO" | "TECNICO" | "TOMA_MUESTRA";

export interface User {
  id: string;
  nombre: string;
  rol: Rol;
  must_change_pin?: boolean;
}

export interface InvRow extends Partial<PrepFields> {
  id: string; gtin: string; lot: string; expiration: string; usuario: string;
  nombre?: string; abreviado?: string; detalle?: string; seccion?: string;
  temperatura?: string; preparacion?: string;
}

export interface GroupedItem extends Partial<PrepFields> {
  gtin: string; lot: string; nombre: string; abreviado: string;
  detalle: string; seccion: string;
  expiration: string; temperatura: string; preparacion: string;
  cantidad: number; itemIds: string[];
}

export interface Protocolo {
  id: string; titulo: string; seccion: string; contenido: string;
  autor: string; created_at: string; updated_at: string;
}

export interface Anexo {
  id: string; servicio: string; salas: string; numero: string;
  creado_por: string; created_at: string; updated_at: string;
}

export interface DiuresisRow {
  id: string; num_peticion: string; rut_paciente: string; nombre_paciente: string;
  diuresis_ml: string; peso: string; talla: string; baja_motivo: string;
  obs_rechazo: string; motivo_vih: string; usuario: string; fecha: string;
  archivado: number;
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
}

export interface MaestroRow extends PrepFields {
  gtin: string; nombre: string; detalle: string; pack: string;
  seccion: string; temperatura: string; preparacion: string;
  fecha_baja: string | null;
}

export interface LogEntry {
  id: number; usuario: string; perfil: string; accion: string; detalles: string; fecha: string; ip?: string;
}

export interface DiuresisStats {
  n: number; mean: number | null; std: number | null; lastValue: number | null; lastDate?: string;
}

export interface BulkImportResult {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}
