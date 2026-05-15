import { useState, useEffect, useRef } from "react";
import {
  Shield, LayoutDashboard, Users, Activity, History, LogOut,
  UserPlus, ClipboardList, ScanLine, ChevronDown, ChevronRight,
  FlaskConical, Pencil, Trash2, BookOpen, FileText, FilePlus,
  Search, X, Phone, Droplets, Archive, Plus,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { parseGS1 } from "../utils/gs1Parser";
import { parseDiuresisBarcode } from "../utils/diuresisParser";

const API = "/api";

// ── Utilidades ────────────────────────────────────────────────────────────────

function formatExp(exp: string) {
  if (!exp || exp.length !== 6) return exp || "—";
  return `${exp.slice(4, 6)}/${exp.slice(2, 4)}/${2000 + parseInt(exp.slice(0, 2))}`;
}

function validarFechaGS1(v: string): string | null {
  if (!v) return "Obligatorio";
  if (!/^\d{6}$/.test(v)) return "6 dígitos AAMMDD";
  const m = parseInt(v.slice(2, 4)), d = parseInt(v.slice(4, 6));
  const y = 2000 + parseInt(v.slice(0, 2));
  if (m < 1 || m > 12) return `Mes inválido: ${m}`;
  if (d < 1 || d > new Date(y, m, 0).getDate()) return `Día inválido: ${d}`;
  return null;
}

function getEstado(exp: string): "activo" | "por-vencer" | "vencido" {
  if (!exp || exp.length !== 6) return "activo";
  const y = 2000 + parseInt(exp.slice(0, 2));
  const m = parseInt(exp.slice(2, 4)) - 1;
  const d = parseInt(exp.slice(4, 6));
  const dias = Math.floor((new Date(y, m, d).getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  return dias < 0 ? "vencido" : dias <= 90 ? "por-vencer" : "activo";
}

function fmtDT(iso: string) {
  if (!iso) return { fecha: "—", hora: "—" };
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString("es-CL"),
    hora: d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
  };
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface InvRow {
  id: string; gtin: string; lot: string; expiration: string; usuario: string;
  nombre?: string; detalle?: string; seccion?: string; temperatura?: string; preparacion?: string;
}
interface GroupedItem {
  gtin: string; lot: string; nombre: string; detalle: string; seccion: string;
  expiration: string; temperatura: string; preparacion: string; cantidad: number; itemIds: string[];
}
interface Protocolo {
  id: string; titulo: string; seccion: string; contenido: string;
  autor: string; created_at: string; updated_at: string;
}
interface Anexo {
  id: string; servicio: string; salas: string; numero: string;
  creado_por: string; created_at: string; updated_at: string;
}
interface DiuresisRow {
  id: string; num_peticion: string; rut_paciente: string; nombre_paciente: string;
  diuresis_ml: string; peso: string; talla: string; baja_motivo: string;
  obs_rechazo: string; motivo_vih: string; usuario: string; fecha: string;
  archivado: number;
}
interface ProductForm {
  gtin: string; lot: string; exp: string; nombre: string; detalle: string;
  seccion: string; pack: string; temperatura: string; preparacion: string;
}

const EMPTY_FORM: ProductForm = {
  gtin: "", lot: "", exp: "", nombre: "", detalle: "",
  seccion: "", pack: "", temperatura: "Refrigerado", preparacion: "",
};
const EMPTY_DIURESIS = {
  num_peticion: "", rut_paciente: "", nombre_paciente: "",
  diuresis_ml: "", peso: "", talla: "", baja_motivo: "", obs_rechazo: "", motivo_vih: "",
};

// ── Estilos base ──────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.4)",
  borderRadius: "16px", boxShadow: "0 8px 32px rgba(31,38,135,0.07)",
};
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 13px", borderRadius: "9px",
  border: "1px solid rgba(0,0,0,0.1)", background: "rgba(255,255,255,0.9)",
  color: "#1e293b", fontSize: "13px", outline: "none", boxSizing: "border-box", fontWeight: 600,
};
const navBtn = (active: boolean): React.CSSProperties => ({
  padding: "10px 14px", borderRadius: "10px", border: "none",
  background: active ? "#005a9c" : "transparent", color: active ? "white" : "#64748b",
  textAlign: "left", cursor: "pointer", fontWeight: 700,
  display: "flex", alignItems: "center", gap: "9px", fontSize: "13px",
  transition: "all 0.18s", boxShadow: active ? "0 4px 12px rgba(0,90,156,0.25)" : "none",
  width: "100%",
});
const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: "9px 20px", borderRadius: "9px", border: "none", cursor: "pointer",
  fontWeight: 700, fontSize: "13px", transition: "all 0.15s",
  background: active ? "#005a9c" : "rgba(0,0,0,0.05)",
  color: active ? "white" : "#64748b",
  boxShadow: active ? "0 4px 12px rgba(0,90,156,0.2)" : "none",
});
const rolColor: Record<string, { bg: string; color: string }> = {
  ADMIN:        { bg: "rgba(16,185,129,0.15)",  color: "#059669" },
  TECNOLOGO:    { bg: "rgba(0,90,156,0.12)",    color: "#005a9c" },
  TECNICO:      { bg: "rgba(99,102,241,0.12)",  color: "#4338ca" },
  TOMA_MUESTRA: { bg: "rgba(245,158,11,0.12)",  color: "#d97706" },
};
const rolLabel: Record<string, string> = {
  ADMIN: "Administrador", TECNOLOGO: "Tecnólogo Médico",
  TECNICO: "Técnico Lab.", TOMA_MUESTRA: "Toma de Muestras",
};

// ── Sub-componentes ───────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: "activo"|"por-vencer"|"vencido" }) {
  const c = { activo: { l:"Activo", bg:"rgba(16,185,129,0.12)", co:"#059669" }, "por-vencer": { l:"Por Vencer", bg:"rgba(245,158,11,0.12)", co:"#d97706" }, vencido: { l:"Vencido", bg:"rgba(239,68,68,0.12)", co:"#dc2626" } }[estado];
  return <span style={{ display:"inline-block", background:c.bg, color:c.co, fontWeight:700, fontSize:"11px", padding:"3px 9px", borderRadius:"6px", whiteSpace:"nowrap" }}>{c.l}</span>;
}
function TempBadge({ temp }: { temp: string }) {
  const m: Record<string,{bg:string;co:string;l:string}> = { Refrigerado:{bg:"rgba(56,189,248,0.12)",co:"#0369a1",l:"Refrig."}, Congelado:{bg:"rgba(99,102,241,0.12)",co:"#4338ca",l:"Congel."}, Ambiente:{bg:"rgba(16,185,129,0.12)",co:"#059669",l:"Amb."} };
  const c = m[temp] || { bg:"rgba(0,0,0,0.05)", co:"#475569", l:temp };
  return <span style={{ display:"inline-block", background:c.bg, color:c.co, fontWeight:700, fontSize:"11px", padding:"3px 9px", borderRadius:"6px" }}>{c.l}</span>;
}
function RolBadge({ rol }: { rol: string }) {
  const c = rolColor[rol] || { bg:"rgba(0,0,0,0.05)", color:"#64748b" };
  return <span style={{ display:"inline-block", ...c, fontWeight:700, fontSize:"11px", padding:"3px 9px", borderRadius:"6px", whiteSpace:"nowrap" }}>{rolLabel[rol] || rol}</span>;
}
function FErr({ msg }: { msg: string|null }) {
  return msg ? <div style={{ color:"#dc2626", fontSize:"11px", fontWeight:600, marginTop:"3px" }}>⚠ {msg}</div> : null;
}
function SectionHead({ title, icon, action }: { title: string; icon: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px", flexWrap:"wrap", gap:"12px" }}>
      <h2 style={{ display:"flex", alignItems:"center", gap:"10px", color:"#005a9c", fontWeight:800, margin:0, fontSize:"20px" }}>{icon}{title}</h2>
      {action}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function InventoryApp() {
  // ─ Auth
  const [showLogin, setShowLogin]       = useState(true);
  const [currentUser, setCurrentUser]   = useState<any>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [pinInput, setPinInput]         = useState("");
  const [view, setView]                 = useState("Dashboard");

  // ─ Inventario
  const [inventory, setInventory]       = useState<InvRow[]>([]);
  const [secciones, setSecciones]       = useState<{ nombre: string }[]>([]);
  const [activeSection, setActiveSection] = useState("");
  const [activeProduct, setActiveProduct] = useState<string|null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm]     = useState("");
  const [laserActive, setLaserActive]   = useState(false);

  // ─ Modal clasificar
  const [showModal, setShowModal]       = useState(false);
  const [form, setForm]                 = useState<ProductForm>(EMPTY_FORM);
  const [gtinLocked, setGtinLocked]     = useState(false);
  const [expError, setExpError]         = useState<string|null>(null);
  const [productoExiste, setProductoExiste] = useState(false);

  // ─ Modal editar (admin)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget]     = useState<GroupedItem|null>(null);
  const [editForm, setEditForm]         = useState<ProductForm & { newLot:string; newExp:string }>({ ...EMPTY_FORM, newLot:"", newExp:"" });
  const [editExpError, setEditExpError] = useState<string|null>(null);

  // ─ Modal preparación
  const [showPrepModal, setShowPrepModal] = useState(false);
  const [prepItem, setPrepItem]         = useState<GroupedItem|null>(null);

  // ─ Usuarios / logs
  const [usuarios, setUsuarios]         = useState<any[]>([]);
  const [logs, setLogs]                 = useState<any[]>([]);
  const [newUser, setNewUser]           = useState({ nombre:"", rol:"TECNICO", pin:"" });

  // ─ Protocolos
  const [protocolos, setProtocolos]     = useState<Protocolo[]>([]);
  const [protSearch, setProtSearch]     = useState("");
  const [showProtoModal, setShowProtoModal] = useState(false);
  const [editProto, setEditProto]       = useState<Protocolo|null>(null);
  const [protoForm, setProtoForm]       = useState({ titulo:"", seccion:"", contenido:"" });
  const [expandedProto, setExpandedProto] = useState<string|null>(null);
  const [expandedProtoSecs, setExpandedProtoSecs] = useState<Set<string>>(new Set());

  // ─ Anexos
  const [anexos, setAnexos]             = useState<Anexo[]>([]);
  const [showAnexoModal, setShowAnexoModal] = useState(false);
  const [editAnexo, setEditAnexo]       = useState<Anexo|null>(null);
  const [anexoForm, setAnexoForm]       = useState({ servicio:"", salas:"", numero:"" });
  const [anexoSearch, setAnexoSearch]   = useState("");

  // ─ Diuresis
  const [diuresisHoy, setDiuresisHoy]   = useState<DiuresisRow[]>([]);
  const [diuresisHist, setDiuresisHist] = useState<DiuresisRow[]>([]);
  const [diuresisTab, setDiuresisTab]   = useState<"hoy"|"historico">("hoy");
  const [diuresisForm, setDiuresisForm] = useState({ ...EMPTY_DIURESIS });
  const [histFiltros, setHistFiltros]   = useState({ fecha:"", peticion:"", nombre:"" });
  const [buscandoHist, setBuscandoHist] = useState(false);

  const barcodeBuffer  = useRef("");
  const scanInputRef   = useRef<HTMLInputElement>(null);
  const diurScanRef    = useRef<HTMLInputElement>(null);

  // ── Permisos ─────────────────────────────────────────────────────────────────
  const isAdmin     = currentUser?.rol === "ADMIN";
  const isTecnologo = currentUser?.rol === "TECNOLOGO";
  const isTecnico   = currentUser?.rol === "TECNICO";
  const isToma      = currentUser?.rol === "TOMA_MUESTRA";

  const canInventario   = isAdmin || isTecnologo;
  const canConsumir     = isAdmin || isTecnologo;
  const canPrep         = isAdmin || isTecnologo;
  const canProtocolos   = isAdmin || isTecnologo;
  const canEditProto    = isAdmin || isTecnologo;
  const canCRUDAnexos   = isAdmin;
  const canEntrarDiur   = isAdmin || isToma;
  const canHistDiur     = isAdmin || isTecnologo;
  const canDelDiur      = isAdmin;

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    if (!currentUser) return;
    try {
      const [inv, cfg, lg, prot, anx, diur] = await Promise.all([
        fetch(`${API}/inventario`),
        fetch(`${API}/config`),
        fetch(`${API}/logs`),
        fetch(`${API}/protocolos`),
        fetch(`${API}/anexos`),
        fetch(`${API}/diuresis/hoy`),
      ]);
      if (inv.ok)  setInventory(await inv.json());
      if (cfg.ok)  { const d = await cfg.json(); setSecciones(d.secciones.filter((s:any) => s.nombre)); setUsuarios(d.usuarios); }
      if (lg.ok)   setLogs(await lg.json());
      if (prot.ok) setProtocolos(await prot.json());
      if (anx.ok)  setAnexos(await anx.json());
      if (diur.ok) setDiuresisHoy(await diur.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 3000); return () => clearInterval(id); }, [currentUser]);

  useEffect(() => {
    if (secciones.length > 0 && !activeSection) {
      setActiveSection(secciones[0].nombre);
      setExpandedSections(new Set([secciones[0].nombre]));
    }
  }, [secciones]);

  // Auto-tab al entrar a Diuresis según rol
  useEffect(() => {
    if (view === "Diuresis") {
      if (isTecnologo && !isAdmin) setDiuresisTab("historico");
      else setDiuresisTab("hoy");
    }
  }, [view]);

  // ── Scanner global ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!currentUser || !canInventario) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      setLaserActive(true); setTimeout(() => setLaserActive(false), 500);
      if (e.key === "Enter") { if (barcodeBuffer.current.length > 5) procesarEscaneo(barcodeBuffer.current); barcodeBuffer.current = ""; }
      else if (e.key.length === 1) barcodeBuffer.current += e.key;
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentUser, activeSection, canInventario]);

  // ── Flujo inventario ─────────────────────────────────────────────────────────
  const procesarEscaneo = async (code: string) => {
    const p = parseGS1(code) || { gtin: code.replace(/\D/g,"").slice(-14) || code, lot:"", expiration:"" };
    const res = await fetch(`${API}/producto/${p.gtin}`);
    const existe = await res.json();
    if (existe) { await registrarEnDB(p); setActiveSection(existe.seccion); setExpandedSections(prev => new Set([...prev, existe.seccion])); }
    else { setForm({ ...EMPTY_FORM, gtin:p.gtin, lot:p.lot, exp:p.expiration, seccion:activeSection||"" }); setGtinLocked(true); setExpError(null); setProductoExiste(false); setShowModal(true); }
  };

  const handleModalScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return; e.preventDefault();
    const code = scanInputRef.current?.value || "";
    if (scanInputRef.current) scanInputRef.current.value = "";
    if (code.length < 5) return;
    const parsed = parseGS1(code);
    const gtin = parsed?.gtin || code.replace(/\D/g,"").slice(-14) || code;
    const res = await fetch(`${API}/producto/${gtin}`);
    const existe = await res.json();
    if (existe) { setForm(f => ({ ...f, gtin, lot:parsed?.lot||f.lot, exp:parsed?.expiration||f.exp, nombre:existe.nombre, detalle:existe.detalle||"", seccion:existe.seccion, temperatura:existe.temperatura||"Refrigerado", preparacion:existe.preparacion||"" })); setProductoExiste(true); }
    else { setForm(f => ({ ...f, gtin, lot:parsed?.lot||f.lot, exp:parsed?.expiration||f.exp })); setProductoExiste(false); }
    setGtinLocked(true); setExpError(null);
  };

  const registrarEnDB = async (p: { gtin:string; lot:string; expiration:string }) => {
    await fetch(`${API}/inventario`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...p, scanDate:new Date().toISOString(), usuario:currentUser.nombre }) });
    fetchData();
  };

  const verificarGTINManual = async (gtin: string) => {
    if (!gtin || gtin.length < 8) { setProductoExiste(false); return; }
    const res = await fetch(`${API}/producto/${gtin}`); const existe = await res.json();
    if (existe) { setForm(f => ({ ...f, nombre:existe.nombre, detalle:existe.detalle||"", seccion:existe.seccion, temperatura:existe.temperatura||"Refrigerado", preparacion:existe.preparacion||"" })); setProductoExiste(true); }
    else setProductoExiste(false);
  };

  const cerrarModal = () => { setShowModal(false); setGtinLocked(false); setExpError(null); setProductoExiste(false); };

  const guardarProducto = async () => {
    const err = validarFechaGS1(form.exp); setExpError(err); if (err) return;
    if (!form.gtin || !form.lot) { alert("GTIN y Lote son obligatorios."); return; }
    if (!productoExiste && (!form.nombre || !form.seccion)) { alert("Nombre y Sección son obligatorios para clasificar."); return; }
    if (!productoExiste || isAdmin) {
      await fetch(`${API}/producto`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ gtin:form.gtin, nombre:form.nombre, detalle:form.detalle, pack:form.pack, seccion:form.seccion, temperatura:form.temperatura, preparacion:form.preparacion, usuario:currentUser.nombre }) });
    }
    await registrarEnDB({ gtin:form.gtin, lot:form.lot, expiration:form.exp });
    cerrarModal();
    if (form.seccion) { setActiveSection(form.seccion); setExpandedSections(prev => new Set([...prev, form.seccion])); }
  };

  const abrirEdicion = (g: GroupedItem) => {
    setEditTarget(g); setEditExpError(null);
    setEditForm({ gtin:g.gtin, lot:g.lot, exp:g.expiration, nombre:g.nombre, detalle:g.detalle, seccion:g.seccion, pack:"", temperatura:g.temperatura||"Refrigerado", preparacion:g.preparacion||"", newLot:g.lot, newExp:g.expiration });
    setShowEditModal(true);
  };

  const guardarEdicion = async () => {
    if (!editTarget) return;
    const err = validarFechaGS1(editForm.newExp); setEditExpError(err); if (err) return;
    await fetch(`${API}/producto/${editTarget.gtin}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ nombre:editForm.nombre, detalle:editForm.detalle, pack:editForm.pack, seccion:editForm.seccion, temperatura:editForm.temperatura, preparacion:editForm.preparacion, usuario:currentUser.nombre }) });
    if (editForm.newLot !== editTarget.lot || editForm.newExp !== editTarget.expiration) {
      await fetch(`${API}/inventario/lote`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ gtin:editTarget.gtin, lotActual:editTarget.lot, nuevoLot:editForm.newLot, nuevaExp:editForm.newExp, usuario:currentUser.nombre }) });
    }
    setShowEditModal(false); setEditTarget(null); fetchData();
    setActiveSection(editForm.seccion); setExpandedSections(prev => new Set([...prev, editForm.seccion]));
  };

  const eliminarProducto = async () => {
    if (!editTarget || !confirm(`¿Eliminar "${editTarget.nombre}" y dar de baja su stock?`)) return;
    await fetch(`${API}/producto/${editTarget.gtin}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser.nombre }) });
    setShowEditModal(false); setEditTarget(null); fetchData();
  };

  const consumirUnidad = async (g: GroupedItem) => {
    if (!confirm(`¿Descontar 1 unidad de "${g.nombre}" (Lote: ${g.lot})?`)) return;
    await fetch(`${API}/inventario/${g.itemIds[0]}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser.nombre }) });
    fetchData();
  };

  // ── Protocolos ───────────────────────────────────────────────────────────────
  const guardarProtocolo = async () => {
    if (!protoForm.titulo.trim() || !protoForm.seccion.trim() || !protoForm.contenido.trim()) { alert("Título, sección y contenido son obligatorios."); return; }
    if (editProto) await fetch(`${API}/protocolos/${editProto.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...protoForm, usuario:currentUser.nombre }) });
    else { await fetch(`${API}/protocolos`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...protoForm, usuario:currentUser.nombre }) }); setExpandedProtoSecs(p => new Set([...p, protoForm.seccion])); }
    setShowProtoModal(false); fetchData();
  };
  const eliminarProtocolo = async (p: Protocolo) => {
    if (!confirm(`¿Eliminar "${p.titulo}"?`)) return;
    await fetch(`${API}/protocolos/${p.id}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser.nombre }) });
    fetchData();
  };

  // ── Anexos ───────────────────────────────────────────────────────────────────
  const guardarAnexo = async () => {
    if (!anexoForm.servicio.trim() || !anexoForm.numero.trim()) { alert("Servicio y Número son obligatorios."); return; }
    if (editAnexo) await fetch(`${API}/anexos/${editAnexo.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...anexoForm, usuario:currentUser.nombre }) });
    else await fetch(`${API}/anexos`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...anexoForm, usuario:currentUser.nombre }) });
    setShowAnexoModal(false); setEditAnexo(null); setAnexoForm({ servicio:"", salas:"", numero:"" }); fetchData();
  };
  const eliminarAnexo = async (a: Anexo) => {
    if (!confirm(`¿Eliminar el anexo de "${a.servicio}"?`)) return;
    await fetch(`${API}/anexos/${a.id}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser.nombre }) });
    fetchData();
  };

  // ── Diuresis ─────────────────────────────────────────────────────────────────
  const handleDiurScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return; e.preventDefault();
    const code = diurScanRef.current?.value || "";
    if (diurScanRef.current) diurScanRef.current.value = "";
    if (!code.trim()) return;
    const p = parseDiuresisBarcode(code);
    setDiuresisForm(f => ({ ...f, num_peticion:p.peticion||f.num_peticion, rut_paciente:p.rut||f.rut_paciente, nombre_paciente:p.nombre||f.nombre_paciente }));
  };

  const guardarDiuresis = async () => {
    if (!diuresisForm.num_peticion.trim()) { alert("N° Petición es obligatorio."); return; }
    if (!diuresisForm.baja_motivo.trim()) { alert("Motivo de Baja es obligatorio."); return; }
    await fetch(`${API}/diuresis`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...diuresisForm, usuario:currentUser.nombre }) });
    setDiuresisForm({ ...EMPTY_DIURESIS }); fetchData();
  };

  const eliminarDiuresis = async (id: string) => {
    if (!confirm("¿Eliminar este registro?")) return;
    await fetch(`${API}/diuresis/${id}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser.nombre }) });
    fetchData();
  };

  const buscarHistorico = async () => {
    setBuscandoHist(true);
    try {
      const p = new URLSearchParams();
      if (histFiltros.fecha) p.set("fecha", histFiltros.fecha);
      if (histFiltros.peticion) p.set("peticion", histFiltros.peticion);
      if (histFiltros.nombre) p.set("nombre", histFiltros.nombre);
      const res = await fetch(`${API}/diuresis/historico?${p}`);
      if (res.ok) setDiuresisHist(await res.json());
    } finally { setBuscandoHist(false); }
  };

  useEffect(() => { if (view === "Diuresis" && diuresisTab === "historico") buscarHistorico(); }, [diuresisTab, view]);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!usernameInput || !pinInput) return alert("Ingrese usuario y clave.");
    const res = await fetch(`${API}/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ nombre:usernameInput, pin:pinInput }) });
    const data = await res.json();
    if (data.success) {
      setCurrentUser(data.user); setShowLogin(false); setPinInput("");
      const rol = data.user.rol;
      if (rol === "TECNICO") setView("Anexos");
      else if (rol === "TOMA_MUESTRA") setView("Diuresis");
      else setView("Dashboard");
    } else alert("❌ Usuario o Clave incorrectos");
  };

  const handleLogout = async () => {
    await fetch(`${API}/logout`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser.nombre }) }).catch(()=>{});
    setCurrentUser(null); setShowLogin(true); setUsernameInput(""); setPinInput("");
  };

  const crearUsuario = async () => {
    if (!newUser.nombre || !newUser.pin) return alert("Datos incompletos.");
    await fetch(`${API}/usuarios`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...newUser, adminUser:currentUser.nombre }) });
    setNewUser({ nombre:"", rol:"TECNICO", pin:"" }); fetchData();
  };

  // ── Datos derivados ───────────────────────────────────────────────────────────
  const allSecNames = [...new Set([...secciones.map(s=>s.nombre), ...inventory.map(i=>i.seccion).filter(Boolean) as string[]])];
  const sectionTree = allSecNames.map(n => ({ nombre:n, count:inventory.filter(i=>i.seccion===n).length, productos:[...new Set(inventory.filter(i=>i.seccion===n).map(i=>i.nombre).filter(Boolean))] as string[] })).filter(s=>s.count>0);

  const filteredInv = inventory.filter(i => {
    if (activeSection && i.seccion !== activeSection) return false;
    if (activeProduct && i.nombre !== activeProduct) return false;
    if (searchTerm) { const t = searchTerm.toLowerCase(); return i.nombre?.toLowerCase().includes(t) || i.lot?.toLowerCase().includes(t) || i.gtin?.includes(t); }
    return true;
  });

  const groupMap: Record<string, GroupedItem> = {};
  for (const item of filteredInv) {
    const key = `${item.gtin}||${item.lot}`;
    if (!groupMap[key]) groupMap[key] = { gtin:item.gtin, lot:item.lot, nombre:item.nombre||"Sin clasificar", detalle:item.detalle||"", seccion:item.seccion||"", expiration:item.expiration, temperatura:item.temperatura||"Refrigerado", preparacion:item.preparacion||"", cantidad:0, itemIds:[] };
    groupMap[key].cantidad++; groupMap[key].itemIds.push(item.id);
  }
  const groupedList = Object.values(groupMap);

  const chartData = Object.entries(
    (activeSection ? inventory.filter(i=>i.seccion===activeSection) : inventory)
      .filter(i=>i.nombre && (!activeProduct || i.nombre===activeProduct))
      .reduce((a,i) => { a[i.nombre!]=(a[i.nombre!]||0)+1; return a; }, {} as Record<string,number>)
  ).map(([name,stock]) => ({ name, stock }));

  const filteredAnexos = anexos.filter(a => {
    if (!anexoSearch) return true;
    const t = anexoSearch.toLowerCase();
    return a.servicio.toLowerCase().includes(t) || a.salas?.toLowerCase().includes(t) || a.numero.toLowerCase().includes(t);
  });

  // ── LOGIN ─────────────────────────────────────────────────────────────────────
  if (showLogin) {
    const li: React.CSSProperties = { width:"100%", padding:"13px", borderRadius:"10px", border:"1px solid rgba(255,255,255,0.2)", background:"rgba(0,0,0,0.2)", color:"white", textAlign:"center", fontSize:"15px", outline:"none", boxSizing:"border-box" };
    return (
      <div style={{ position:"fixed", inset:0, background:"linear-gradient(135deg,#0f2027,#203a43,#2c5364)", display:"flex", justifyContent:"center", alignItems:"center", fontFamily:"'Inter',sans-serif" }}>
        <div style={{ ...glass, padding:"50px", width:"360px", textAlign:"center", border:"1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ background:"rgba(56,189,248,0.15)", width:70, height:70, borderRadius:"50%", display:"flex", justifyContent:"center", alignItems:"center", margin:"0 auto 24px", border:"1px solid rgba(56,189,248,0.4)" }}><Shield color="#38bdf8" size={34} /></div>
          <h2 style={{ margin:"0 0 4px", color:"white", fontSize:"24px", letterSpacing:1 }}>BIO-STOCK <span style={{ fontWeight:300 }}>PRO</span></h2>
          <p style={{ fontSize:"12px", color:"#94a3b8", marginBottom:28 }}>Acceso Restringido — Nivel Clínico</p>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <input placeholder="Usuario" value={usernameInput} onChange={e=>setUsernameInput(e.target.value)} style={li} />
            <input type="password" placeholder="PIN" value={pinInput} onChange={e=>setPinInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{ ...li, letterSpacing:6 }} />
            <button onClick={handleLogin} style={{ width:"100%", padding:15, background:"#38bdf8", color:"#0f172a", border:"none", borderRadius:10, fontWeight:900, cursor:"pointer", marginTop:12, fontSize:14 }}>AUTENTICAR</button>
          </div>
        </div>
      </div>
    );
  }

  // ── APP ───────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:"fixed", inset:0, display:"flex", background:"linear-gradient(135deg,#e0eafc,#cfdef3)", fontFamily:"'Inter',sans-serif", overflow:"hidden" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────────── */}
      <aside style={{ ...glass, width:272, margin:14, padding:"18px 14px", display:"flex", flexDirection:"column", boxSizing:"border-box", border:"1px solid rgba(255,255,255,0.8)", overflowY:"auto", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:9, color:"#005a9c", marginBottom:14 }}>
          <Activity size={24} /><h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>BIO-STOCK</h2>
        </div>

        {/* Indicador láser */}
        {canInventario && (
          <div style={{ background:"rgba(255,255,255,0.5)", padding:"8px 12px", borderRadius:10, borderLeft:"4px solid #10b981", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:laserActive?"#00e676":"#10b981", boxShadow:laserActive?"0 0 10px #00e676":"0 0 4px #10b981", transition:"all 0.2s", flexShrink:0 }} />
            <span style={{ fontSize:"11px", fontWeight:700, color:"#0f172a" }}>Láser {laserActive?"ACTIVO":"En espera"}</span>
          </div>
        )}

        <nav style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:14 }}>
          {canInventario && <button onClick={()=>setView("Dashboard")} style={navBtn(view==="Dashboard")}><LayoutDashboard size={14}/> Inventario</button>}
          {canProtocolos && <button onClick={()=>setView("Protocolos")} style={navBtn(view==="Protocolos")}><FileText size={14}/> Protocolos</button>}
          <button onClick={()=>setView("Anexos")} style={navBtn(view==="Anexos")}><Phone size={14}/> Anexos Telefónicos</button>
          <button onClick={()=>setView("Diuresis")} style={navBtn(view==="Diuresis")}><Droplets size={14}/> Diuresis y Bajas</button>
          {isAdmin && <button onClick={()=>setView("Usuarios")} style={navBtn(view==="Usuarios")}><Users size={14}/> Personal</button>}
          {isAdmin && <button onClick={()=>setView("Logs")} style={navBtn(view==="Logs")}><History size={14}/> Auditoría</button>}
          {canInventario && (
            <button onClick={()=>{ setForm({...EMPTY_FORM, seccion:activeSection||""}); setGtinLocked(false); setExpError(null); setProductoExiste(false); setShowModal(true); }}
              style={{ padding:"10px", background:"#005a9c", color:"white", border:"none", borderRadius:10, marginTop:6, cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:7, boxShadow:"0 4px 14px rgba(0,90,156,0.3)", fontSize:"13px" }}>
              <ScanLine size={14}/> Ingreso Manual
            </button>
          )}
        </nav>

        {/* Árbol de secciones */}
        {view === "Dashboard" && canInventario && (
          <div style={{ flex:1, overflowY:"auto" }}>
            <div style={{ fontSize:"10px", fontWeight:800, color:"#94a3b8", letterSpacing:"1.2px", marginBottom:8 }}>SECCIONES DEL LABORATORIO</div>
            {sectionTree.length === 0
              ? <p style={{ fontSize:"11px", color:"#94a3b8", margin:0, fontStyle:"italic" }}>Sin secciones — escanea un control</p>
              : sectionTree.map(sec => (
                <div key={sec.nombre}>
                  <button onClick={()=>{ setActiveSection(sec.nombre); setActiveProduct(null); setExpandedSections(p=>{ const s=new Set(p); s.has(sec.nombre)?s.delete(sec.nombre):s.add(sec.nombre); return s; }); }}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:7, padding:"8px 9px", borderRadius:9, border:"none", background:activeSection===sec.nombre&&!activeProduct?"rgba(0,90,156,0.1)":"transparent", color:activeSection===sec.nombre&&!activeProduct?"#005a9c":"#334155", cursor:"pointer", fontWeight:700, fontSize:"12px", textAlign:"left" }}>
                    {expandedSections.has(sec.nombre)?<ChevronDown size={12}/>:<ChevronRight size={12}/>}
                    <FlaskConical size={12}/>
                    <span style={{ flex:1 }}>{sec.nombre}</span>
                    <span style={{ fontSize:"10px", background:"rgba(0,90,156,0.1)", color:"#005a9c", padding:"2px 6px", borderRadius:7, fontWeight:800 }}>{sec.count}</span>
                  </button>
                  {expandedSections.has(sec.nombre) && sec.productos.map(prod => {
                    const isA = activeProduct===prod && activeSection===sec.nombre;
                    return (
                      <button key={prod} onClick={()=>{ setActiveSection(sec.nombre); setActiveProduct(prod); }}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"6px 9px 6px 28px", borderRadius:8, border:"none", background:isA?"#005a9c":"transparent", color:isA?"white":"#475569", cursor:"pointer", fontWeight:600, fontSize:"11px", textAlign:"left" }}>
                        <span style={{ width:4, height:4, borderRadius:"50%", background:isA?"white":"#94a3b8", flexShrink:0 }}/>
                        <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{prod}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            }
          </div>
        )}

        {/* Usuario activo */}
        <div style={{ marginTop:"auto", paddingTop:12 }}>
          <div style={{ background:"rgba(0,0,0,0.03)", padding:12, borderRadius:10, border:"1px solid rgba(255,255,255,0.5)" }}>
            <div style={{ fontSize:"10px", color:"#64748b", marginBottom:3, fontWeight:700 }}>FIRMA ACTIVA</div>
            <div style={{ fontWeight:800, color:"#0f172a", fontSize:"12px", marginBottom:6 }}>{currentUser.nombre}</div>
            <RolBadge rol={currentUser.rol} />
            <button onClick={handleLogout} style={{ width:"100%", padding:8, background:"rgba(239,68,68,0.1)", color:"#ef4444", border:"none", borderRadius:8, cursor:"pointer", fontSize:"12px", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:5, marginTop:10 }}>
              <LogOut size={12}/> CERRAR SESIÓN
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────────────── */}
      <main style={{ flex:1, overflowY:"auto", padding:"16px 24px 30px 10px", boxSizing:"border-box" }}>

        {/* ─── DASHBOARD / INVENTARIO ───────────────────────────────────────── */}
        {view === "Dashboard" && canInventario && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
              <div>
                <h2 style={{ margin:0, color:"#005a9c", fontWeight:800, fontSize:"20px" }}>
                  {activeSection||"Todas las Secciones"}{activeProduct && <span style={{ color:"#64748b", fontWeight:600 }}> › {activeProduct}</span>}
                </h2>
                <p style={{ margin:"4px 0 0", color:"#64748b", fontSize:"13px" }}>{groupedList.length} control{groupedList.length!==1?"es":""} · {filteredInv.length} unidad{filteredInv.length!==1?"es":""}</p>
              </div>
              <input placeholder="🔍 Nombre, lote o GTIN…" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
                style={{ padding:"10px 15px", width:240, borderRadius:12, border:"1px solid rgba(255,255,255,0.8)", background:"rgba(255,255,255,0.7)", outline:"none", fontWeight:600, fontSize:"13px" }} />
            </div>

            {chartData.length > 0 && (
              <div style={{ ...glass, padding:"16px 20px", marginBottom:16 }}>
                <div style={{ fontSize:"11px", fontWeight:700, color:"#64748b", marginBottom:8 }}>Stock — {activeSection||"Todas"}{activeProduct?` › ${activeProduct}`:""}</div>
                <div style={{ height:160 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top:0, right:10, left:-20, bottom:0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)"/><XAxis dataKey="name" tick={{ fontSize:10, fill:"#64748b", fontWeight:600 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize:10, fill:"#64748b" }} allowDecimals={false} axisLine={false} tickLine={false}/><Tooltip cursor={{ fill:"rgba(0,0,0,0.02)" }} contentStyle={{ borderRadius:10, border:"none", boxShadow:"0 8px 20px rgba(0,0,0,0.1)", fontSize:13 }}/><Bar dataKey="stock" name="Unidades" fill="#005a9c" radius={[6,6,0,0]} barSize={38}/></BarChart></ResponsiveContainer></div>
              </div>
            )}

            {groupedList.length === 0
              ? <div style={{ ...glass, padding:60, textAlign:"center", color:"#94a3b8" }}><FlaskConical size={44} style={{ marginBottom:14, opacity:0.2 }}/><p style={{ fontWeight:700, fontSize:"15px", margin:0 }}>Sin stock{activeSection?` en ${activeSection}`:""}</p><p style={{ fontSize:"13px", margin:"8px 0 0" }}>Escanea un código de barras para comenzar</p></div>
              : <div style={{ ...glass, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }}>
                    <thead><tr style={{ background:"rgba(0,90,156,0.05)" }}>{["NOMBRE","LOTE","VENCIMIENTO","CANT.","TEMP.","ESTADO","ACCIONES"].map((h,i)=><th key={h} style={{ padding:"12px 13px", fontWeight:800, color:"#005a9c", fontSize:"11px", letterSpacing:"0.5px", textAlign:i>=3?"center":"left", whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {groupedList.map(g => (
                        <tr key={`${g.gtin}||${g.lot}`} style={{ borderTop:"1px solid rgba(0,0,0,0.04)" }}>
                          <td style={{ padding:"12px 13px" }}><div style={{ fontWeight:700, color:"#1e293b" }}>{g.nombre}</div>{g.detalle&&<div style={{ fontSize:"11px", color:"#94a3b8", marginTop:2 }}>{g.detalle}</div>}</td>
                          <td style={{ padding:"12px 13px", fontFamily:"'Roboto Mono',monospace", fontWeight:600, color:"#475569" }}>{g.lot}</td>
                          <td style={{ padding:"12px 13px", fontWeight:600, color:"#334155", whiteSpace:"nowrap" }}>{formatExp(g.expiration)}</td>
                          <td style={{ padding:"12px 13px", textAlign:"center" }}><span style={{ display:"inline-block", background:"rgba(0,90,156,0.1)", color:"#005a9c", fontWeight:900, fontSize:"16px", minWidth:36, padding:"3px 9px", borderRadius:8 }}>{g.cantidad}</span></td>
                          <td style={{ padding:"12px 13px", textAlign:"center" }}><TempBadge temp={g.temperatura}/></td>
                          <td style={{ padding:"12px 13px", textAlign:"center" }}><EstadoBadge estado={getEstado(g.expiration)}/></td>
                          <td style={{ padding:"12px 13px", textAlign:"center" }}>
                            <div style={{ display:"flex", gap:5, justifyContent:"center", flexWrap:"wrap" }}>
                              {canPrep && <button onClick={()=>{ setPrepItem(g); setShowPrepModal(true); fetch(`${API}/log-accion`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({usuario:currentUser.nombre,accion:"VER PREPARACIÓN",detalles:`${g.nombre} | ${g.lot}`})}).catch(()=>{}); }} style={{ display:"flex", alignItems:"center", gap:3, color:"#0369a1", border:"1px solid rgba(3,105,161,0.2)", background:"rgba(3,105,161,0.06)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}><BookOpen size={11}/> Prep.</button>}
                              {isAdmin && <button onClick={()=>abrirEdicion(g)} style={{ display:"flex", alignItems:"center", gap:3, color:"#d97706", border:"1px solid rgba(217,119,6,0.2)", background:"rgba(217,119,6,0.06)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}><Pencil size={11}/> Editar</button>}
                              {canConsumir && <button onClick={()=>consumirUnidad(g)} style={{ display:"flex", alignItems:"center", gap:3, color:"#dc2626", border:"1px solid rgba(220,38,38,0.2)", background:"rgba(220,38,38,0.06)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}>− Consumir</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </>
        )}

        {/* ─── ANEXOS TELEFÓNICOS ───────────────────────────────────────────── */}
        {view === "Anexos" && (
          <div style={{ maxWidth:900 }}>
            <SectionHead title="Anexos Telefónicos" icon={<Phone/>}
              action={canCRUDAnexos && <button onClick={()=>{ setEditAnexo(null); setAnexoForm({servicio:"",salas:"",numero:""}); setShowAnexoModal(true); }} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", background:"#005a9c", color:"white", border:"none", borderRadius:10, fontWeight:800, cursor:"pointer", fontSize:"13px", boxShadow:"0 4px 14px rgba(0,90,156,0.3)" }}><Plus size={15}/> Nuevo Anexo</button>}
            />
            <div style={{ position:"relative", marginBottom:18 }}>
              <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }}/>
              <input placeholder="Buscar por servicio, sala o número…" value={anexoSearch} onChange={e=>setAnexoSearch(e.target.value)} style={{ ...inp, paddingLeft:34 }}/>
            </div>
            {filteredAnexos.length === 0
              ? <div style={{ ...glass, padding:50, textAlign:"center", color:"#94a3b8" }}><Phone size={40} style={{ opacity:0.2, marginBottom:12 }}/><p style={{ fontWeight:700, margin:0 }}>{anexoSearch?"Sin resultados":"Sin anexos registrados"}</p>{canCRUDAnexos&&!anexoSearch&&<p style={{ fontSize:"13px", margin:"8px 0 0" }}>Haz clic en "Nuevo Anexo" para agregar</p>}</div>
              : <div style={{ ...glass, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }}>
                    <thead><tr style={{ background:"rgba(0,90,156,0.05)" }}>{["SERVICIO","SALA / ÁREA","N° ANEXO",...(canCRUDAnexos?["GESTIÓN"]:[])].map(h=><th key={h} style={{ padding:"12px 16px", fontWeight:800, color:"#005a9c", fontSize:"11px", textAlign:"left", whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {filteredAnexos.map(a => (
                        <tr key={a.id} style={{ borderTop:"1px solid rgba(0,0,0,0.04)" }}>
                          <td style={{ padding:"12px 16px", fontWeight:700, color:"#1e293b" }}>{a.servicio}</td>
                          <td style={{ padding:"12px 16px", color:"#475569" }}>{a.salas||<span style={{ color:"#cbd5e1" }}>—</span>}</td>
                          <td style={{ padding:"12px 16px", fontFamily:"'Roboto Mono',monospace", fontWeight:800, color:"#005a9c", fontSize:"15px" }}>{a.numero}</td>
                          {canCRUDAnexos && <td style={{ padding:"12px 16px" }}>
                            <div style={{ display:"flex", gap:6 }}>
                              <button onClick={()=>{ setEditAnexo(a); setAnexoForm({servicio:a.servicio,salas:a.salas||"",numero:a.numero}); setShowAnexoModal(true); }} style={{ display:"flex", alignItems:"center", gap:3, color:"#d97706", border:"1px solid rgba(217,119,6,0.2)", background:"rgba(217,119,6,0.06)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}><Pencil size={11}/> Editar</button>
                              <button onClick={()=>eliminarAnexo(a)} style={{ display:"flex", alignItems:"center", gap:3, color:"#dc2626", border:"1px solid rgba(220,38,38,0.2)", background:"rgba(220,38,38,0.06)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}><Trash2 size={11}/></button>
                            </div>
                          </td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* ─── DIURESIS Y BAJAS DE EXAMEN ──────────────────────────────────── */}
        {view === "Diuresis" && (
          <div style={{ maxWidth:1100 }}>
            <SectionHead title="Diuresis y Bajas de Examen" icon={<Droplets/>}/>

            {/* Tabs */}
            <div style={{ display:"flex", gap:8, marginBottom:20 }}>
              {(isAdmin || isToma || isTecnico) && <button onClick={()=>setDiuresisTab("hoy")} style={tabBtn(diuresisTab==="hoy")}>Registros de Hoy</button>}
              {canHistDiur && <button onClick={()=>setDiuresisTab("historico")} style={tabBtn(diuresisTab==="historico")}><Archive size={13} style={{ verticalAlign:"middle", marginRight:4 }}/>Historial</button>}
            </div>

            {/* ── TAB HOY ── */}
            {diuresisTab === "hoy" && (
              <>
                {/* Formulario ingreso */}
                {canEntrarDiur && (
                  <div style={{ ...glass, padding:22, marginBottom:18 }}>
                    <div style={{ fontSize:"12px", fontWeight:800, color:"#005a9c", marginBottom:14 }}>NUEVO REGISTRO</div>
                    {/* Scan */}
                    <div style={{ background:"rgba(0,90,156,0.04)", border:"2px dashed rgba(0,90,156,0.18)", borderRadius:10, padding:"10px 12px", marginBottom:14 }}>
                      <div style={{ fontSize:"10px", fontWeight:800, color:"#005a9c", marginBottom:5, letterSpacing:"0.5px" }}>ESCANEAR CÓDIGO DE PACIENTE</div>
                      <input ref={diurScanRef} onKeyDown={handleDiurScan} placeholder="Apunte aquí y escanee → auto-completa Petición, RUT y Nombre" style={{ ...inp, background:"white" }}/>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:10 }}>
                      <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>N° PETICIÓN *</div><input value={diuresisForm.num_peticion} onChange={e=>setDiuresisForm(f=>({...f,num_peticion:e.target.value}))} placeholder="Obligatorio" style={inp}/></div>
                      <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>RUT PACIENTE</div><input value={diuresisForm.rut_paciente} onChange={e=>setDiuresisForm(f=>({...f,rut_paciente:e.target.value}))} placeholder="12.345.678-9" style={inp}/></div>
                      <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>NOMBRE PACIENTE</div><input value={diuresisForm.nombre_paciente} onChange={e=>setDiuresisForm(f=>({...f,nombre_paciente:e.target.value}))} placeholder="Apellido, Nombre" style={inp}/></div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 2fr", gap:10, marginBottom:10 }}>
                      <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>DIURESIS (ml)</div><input value={diuresisForm.diuresis_ml} onChange={e=>setDiuresisForm(f=>({...f,diuresis_ml:e.target.value}))} placeholder="—" style={inp}/></div>
                      <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>PESO (kg)</div><input value={diuresisForm.peso} onChange={e=>setDiuresisForm(f=>({...f,peso:e.target.value}))} placeholder="—" style={inp}/></div>
                      <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>TALLA (cm)</div><input value={diuresisForm.talla} onChange={e=>setDiuresisForm(f=>({...f,talla:e.target.value}))} placeholder="—" style={inp}/></div>
                      <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>MOTIVO DE BAJA *</div><input value={diuresisForm.baja_motivo} onChange={e=>setDiuresisForm(f=>({...f,baja_motivo:e.target.value}))} placeholder="Obligatorio" style={inp}/></div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                      <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>OBSERVACIÓN RECHAZO</div><input value={diuresisForm.obs_rechazo} onChange={e=>setDiuresisForm(f=>({...f,obs_rechazo:e.target.value}))} placeholder="Opcional" style={inp}/></div>
                      <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>MOTIVO VIH</div><input value={diuresisForm.motivo_vih} onChange={e=>setDiuresisForm(f=>({...f,motivo_vih:e.target.value}))} placeholder="Opcional" style={inp}/></div>
                    </div>
                    <button onClick={guardarDiuresis} style={{ padding:"12px 24px", background:"#005a9c", color:"white", border:"none", borderRadius:10, fontWeight:800, cursor:"pointer", fontSize:"13px", boxShadow:"0 4px 14px rgba(0,90,156,0.3)" }}>GUARDAR REGISTRO</button>
                  </div>
                )}

                {/* Tabla hoy */}
                {diuresisHoy.length === 0
                  ? <div style={{ ...glass, padding:40, textAlign:"center", color:"#94a3b8" }}><Droplets size={36} style={{ opacity:0.2, marginBottom:10 }}/><p style={{ fontWeight:700, margin:0 }}>Sin registros para hoy</p></div>
                  : <div style={{ ...glass, overflow:"hidden" }}>
                      <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(0,0,0,0.05)", fontSize:"12px", fontWeight:700, color:"#64748b" }}>{diuresisHoy.length} registro{diuresisHoy.length!==1?"s":""} del día</div>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px", minWidth:900 }}>
                          <thead><tr style={{ background:"rgba(0,90,156,0.04)" }}>{["PETICIÓN","RUT","NOMBRE","DIURESIS","PESO","TALLA","MOTIVO BAJA","OBS. RECHAZO","USUARIO","HORA",...(canDelDiur?["—"]:[])].map(h=><th key={h} style={{ padding:"10px 12px", fontWeight:800, color:"#005a9c", fontSize:"10px", textAlign:"left", whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {diuresisHoy.map(d => { const { hora } = fmtDT(d.fecha); return (
                              <tr key={d.id} style={{ borderTop:"1px solid rgba(0,0,0,0.04)" }}>
                                <td style={{ padding:"10px 12px", fontFamily:"'Roboto Mono',monospace", fontWeight:700, color:"#005a9c" }}>{d.num_peticion}</td>
                                <td style={{ padding:"10px 12px", fontFamily:"'Roboto Mono',monospace", color:"#334155" }}>{d.rut_paciente||"—"}</td>
                                <td style={{ padding:"10px 12px", fontWeight:600, color:"#1e293b", whiteSpace:"nowrap" }}>{d.nombre_paciente||"—"}</td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontWeight:700 }}>{d.diuresis_ml||"—"}</td>
                                <td style={{ padding:"10px 12px", textAlign:"center" }}>{d.peso||"—"}</td>
                                <td style={{ padding:"10px 12px", textAlign:"center" }}>{d.talla||"—"}</td>
                                <td style={{ padding:"10px 12px", color:"#475569" }}>{d.baja_motivo}</td>
                                <td style={{ padding:"10px 12px", color:"#64748b", fontSize:"11px" }}>{d.obs_rechazo||"—"}</td>
                                <td style={{ padding:"10px 12px", color:"#94a3b8", fontSize:"11px" }}>{d.usuario}</td>
                                <td style={{ padding:"10px 12px", fontFamily:"'Roboto Mono',monospace", color:"#64748b", whiteSpace:"nowrap" }}>{hora}</td>
                                {canDelDiur && <td style={{ padding:"10px 12px" }}><button onClick={()=>eliminarDiuresis(d.id)} style={{ display:"flex", alignItems:"center", gap:3, color:"#dc2626", border:"1px solid rgba(220,38,38,0.2)", background:"rgba(220,38,38,0.06)", padding:"4px 8px", borderRadius:6, cursor:"pointer", fontWeight:700, fontSize:"10px" }}><Trash2 size={10}/></button></td>}
                              </tr>
                            ); })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                }
              </>
            )}

            {/* ── TAB HISTORIAL ── */}
            {diuresisTab === "historico" && canHistDiur && (
              <>
                <div style={{ ...glass, padding:18, marginBottom:16, display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap" }}>
                  <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>FECHA</div><input type="date" value={histFiltros.fecha} onChange={e=>setHistFiltros(f=>({...f,fecha:e.target.value}))} style={{ ...inp, width:160 }}/></div>
                  <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>N° PETICIÓN</div><input value={histFiltros.peticion} onChange={e=>setHistFiltros(f=>({...f,peticion:e.target.value}))} placeholder="Buscar…" style={{ ...inp, width:160 }}/></div>
                  <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>NOMBRE PACIENTE</div><input value={histFiltros.nombre} onChange={e=>setHistFiltros(f=>({...f,nombre:e.target.value}))} placeholder="Buscar…" style={{ ...inp, width:200 }}/></div>
                  <button onClick={buscarHistorico} style={{ padding:"10px 20px", background:"#005a9c", color:"white", border:"none", borderRadius:9, fontWeight:800, cursor:"pointer", fontSize:"13px" }}>{buscandoHist?"Buscando…":"BUSCAR"}</button>
                  <button onClick={()=>{ setHistFiltros({fecha:"",peticion:"",nombre:""}); buscarHistorico(); }} style={{ padding:"10px 14px", background:"rgba(0,0,0,0.05)", color:"#64748b", border:"none", borderRadius:9, fontWeight:700, cursor:"pointer", fontSize:"13px" }}>Limpiar</button>
                </div>
                {diuresisHist.length === 0
                  ? <div style={{ ...glass, padding:40, textAlign:"center", color:"#94a3b8" }}><Archive size={36} style={{ opacity:0.2, marginBottom:10 }}/><p style={{ fontWeight:700, margin:0 }}>Sin registros — aplica filtros y haz clic en Buscar</p></div>
                  : <div style={{ ...glass, overflow:"hidden" }}>
                      <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(0,0,0,0.05)", fontSize:"12px", fontWeight:700, color:"#64748b" }}>{diuresisHist.length} resultado{diuresisHist.length!==1?"s":""}</div>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px", minWidth:900 }}>
                          <thead><tr style={{ background:"rgba(0,90,156,0.04)" }}>{["FECHA","HORA","PETICIÓN","RUT","NOMBRE","DIURESIS","MOTIVO BAJA","OBS.","USUARIO"].map(h=><th key={h} style={{ padding:"10px 12px", fontWeight:800, color:"#005a9c", fontSize:"10px", textAlign:"left", whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {diuresisHist.map(d => { const { fecha, hora } = fmtDT(d.fecha); return (
                              <tr key={d.id} style={{ borderTop:"1px solid rgba(0,0,0,0.04)" }}>
                                <td style={{ padding:"10px 12px", fontFamily:"'Roboto Mono',monospace", color:"#334155", whiteSpace:"nowrap" }}>{fecha}</td>
                                <td style={{ padding:"10px 12px", fontFamily:"'Roboto Mono',monospace", color:"#64748b", whiteSpace:"nowrap" }}>{hora}</td>
                                <td style={{ padding:"10px 12px", fontFamily:"'Roboto Mono',monospace", fontWeight:700, color:"#005a9c" }}>{d.num_peticion}</td>
                                <td style={{ padding:"10px 12px", color:"#334155" }}>{d.rut_paciente||"—"}</td>
                                <td style={{ padding:"10px 12px", fontWeight:600, color:"#1e293b" }}>{d.nombre_paciente||"—"}</td>
                                <td style={{ padding:"10px 12px", textAlign:"center" }}>{d.diuresis_ml||"—"}</td>
                                <td style={{ padding:"10px 12px", color:"#475569" }}>{d.baja_motivo}</td>
                                <td style={{ padding:"10px 12px", color:"#64748b", fontSize:"11px" }}>{d.obs_rechazo||"—"}</td>
                                <td style={{ padding:"10px 12px", color:"#94a3b8", fontSize:"11px" }}>{d.usuario}</td>
                              </tr>
                            ); })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                }
              </>
            )}
          </div>
        )}

        {/* ─── PROTOCOLOS ──────────────────────────────────────────────────── */}
        {view === "Protocolos" && canProtocolos && (() => {
          const query = protSearch.trim().toLowerCase();
          const protoSecs = [...new Set(protocolos.map(p=>p.seccion))].sort();
          const filtered = query ? protocolos.filter(p=>p.titulo.toLowerCase().includes(query)||p.contenido.toLowerCase().includes(query)||p.seccion.toLowerCase().includes(query)) : null;
          const ProtoCard = ({ p }: { p: Protocolo }) => {
            const expanded = expandedProto === p.id;
            const preview = p.contenido.length > 200 ? p.contenido.slice(0,200)+"…" : p.contenido;
            return (
              <div style={{ ...glass, padding:"16px 18px", marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:800, color:"#1e293b", fontSize:"14px", marginBottom:2 }}>{p.titulo}</div>
                    <div style={{ fontSize:"11px", color:"#94a3b8" }}>{p.autor} · {new Date(p.updated_at).toLocaleDateString("es-CL")}</div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    {canEditProto && <button onClick={()=>{ setEditProto(p); setProtoForm({titulo:p.titulo,seccion:p.seccion,contenido:p.contenido}); setShowProtoModal(true); }} style={{ display:"flex", alignItems:"center", gap:3, color:"#d97706", border:"1px solid rgba(217,119,6,0.2)", background:"rgba(217,119,6,0.06)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}><Pencil size={11}/> Editar</button>}
                    {isAdmin && <button onClick={()=>eliminarProtocolo(p)} style={{ display:"flex", alignItems:"center", gap:3, color:"#dc2626", border:"1px solid rgba(220,38,38,0.2)", background:"rgba(220,38,38,0.05)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}><Trash2 size={11}/></button>}
                  </div>
                </div>
                <div style={{ marginTop:10, fontSize:"13px", color:"#334155", lineHeight:1.65 }}>{expanded?<div style={{ whiteSpace:"pre-wrap" }}>{p.contenido}</div>:<div>{preview}</div>}</div>
                {p.contenido.length > 200 && <button onClick={()=>setExpandedProto(expanded?null:p.id)} style={{ marginTop:8, background:"none", border:"none", color:"#005a9c", fontWeight:700, fontSize:"12px", cursor:"pointer", padding:0 }}>{expanded?"▲ Cerrar":"▼ Ver completo"}</button>}
              </div>
            );
          };
          return (
            <div style={{ maxWidth:860 }}>
              <SectionHead title="Protocolos del Laboratorio" icon={<FileText/>}
                action={canEditProto && <button onClick={()=>{ setEditProto(null); setProtoForm({titulo:"",seccion:"",contenido:""}); setShowProtoModal(true); }} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", background:"#005a9c", color:"white", border:"none", borderRadius:10, fontWeight:800, cursor:"pointer", fontSize:"13px", boxShadow:"0 4px 14px rgba(0,90,156,0.3)" }}><FilePlus size={15}/> Nuevo Protocolo</button>}
              />
              <div style={{ position:"relative", marginBottom:20 }}>
                <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }}/>
                <input placeholder="Buscar en títulos, contenido o sección…" value={protSearch} onChange={e=>setProtSearch(e.target.value)} style={{ ...inp, paddingLeft:34, paddingRight:protSearch?34:13 }}/>
                {protSearch && <button onClick={()=>setProtSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#94a3b8", display:"flex" }}><X size={14}/></button>}
              </div>
              {filtered
                ? filtered.length===0 ? <div style={{ ...glass, padding:40, textAlign:"center", color:"#94a3b8" }}><p style={{ fontWeight:700, margin:0 }}>Sin resultados para "{protSearch}"</p></div>
                  : <>{<div style={{ fontSize:"12px", color:"#64748b", fontWeight:700, marginBottom:14 }}>{filtered.length} resultado{filtered.length!==1?"s":""}</div>}{filtered.map(p=><ProtoCard key={p.id} p={p}/>)}</>
                : protoSecs.length===0
                  ? <div style={{ ...glass, padding:50, textAlign:"center", color:"#94a3b8" }}><FileText size={40} style={{ opacity:0.2, marginBottom:12 }}/><p style={{ fontWeight:700, margin:0 }}>Sin protocolos</p>{canEditProto&&<p style={{ fontSize:"13px", margin:"8px 0 0" }}>Clic en "Nuevo Protocolo" para comenzar</p>}</div>
                  : protoSecs.map(sec => {
                      const isOpen = expandedProtoSecs.has(sec);
                      return (
                        <div key={sec} style={{ marginBottom:6 }}>
                          <button onClick={()=>setExpandedProtoSecs(p=>{ const s=new Set(p); s.has(sec)?s.delete(sec):s.add(sec); return s; })}
                            style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:isOpen?"rgba(0,90,156,0.07)":"rgba(255,255,255,0.6)", border:"1px solid rgba(0,90,156,0.1)", borderRadius:isOpen?"12px 12px 0 0":"12px", cursor:"pointer", fontWeight:800, color:"#005a9c", fontSize:"13px", backdropFilter:"blur(10px)" }}>
                            <span style={{ display:"flex", alignItems:"center", gap:8 }}>{isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}{sec}<span style={{ fontWeight:600, fontSize:"11px", background:"rgba(0,90,156,0.1)", padding:"2px 8px", borderRadius:20 }}>{protocolos.filter(p=>p.seccion===sec).length}</span></span>
                          </button>
                          {isOpen && <div style={{ border:"1px solid rgba(0,90,156,0.1)", borderTop:"none", borderRadius:"0 0 12px 12px", padding:12, background:"rgba(255,255,255,0.4)" }}>{protocolos.filter(p=>p.seccion===sec).map(p=><ProtoCard key={p.id} p={p}/>)}</div>}
                        </div>
                      );
                    })
              }
            </div>
          );
        })()}

        {/* ─── USUARIOS ────────────────────────────────────────────────────── */}
        {view === "Usuarios" && isAdmin && (
          <div style={{ maxWidth:860 }}>
            <SectionHead title="Personal del Laboratorio" icon={<UserPlus/>}/>
            <div style={{ ...glass, padding:22, marginBottom:18 }}>
              <div style={{ fontSize:"11px", fontWeight:800, color:"#005a9c", marginBottom:12 }}>CREAR NUEVO ACCESO</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1.4fr 120px 150px", gap:10 }}>
                <input placeholder="Nombre de usuario" value={newUser.nombre} onChange={e=>setNewUser({...newUser,nombre:e.target.value})} style={inp}/>
                <select value={newUser.rol} onChange={e=>setNewUser({...newUser,rol:e.target.value})} style={inp}>
                  <option value="ADMIN">Administrador</option>
                  <option value="TECNOLOGO">Tecnólogo Médico</option>
                  <option value="TECNICO">Técnico de Laboratorio</option>
                  <option value="TOMA_MUESTRA">Toma de Muestras</option>
                </select>
                <input placeholder="PIN numérico" value={newUser.pin} onChange={e=>setNewUser({...newUser,pin:e.target.value})} style={inp}/>
                <button onClick={crearUsuario} style={{ background:"#005a9c", color:"white", border:"none", borderRadius:9, fontWeight:800, cursor:"pointer", fontSize:"13px" }}>CREAR ACCESO</button>
              </div>
            </div>
            <div style={{ ...glass, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }}>
                <thead><tr style={{ background:"rgba(0,0,0,0.03)", textAlign:"left" }}><th style={{ padding:"14px 18px" }}>USUARIO</th><th>PERFIL</th><th>GESTIÓN</th></tr></thead>
                <tbody>
                  {usuarios.map((u:any) => (
                    <tr key={u.id} style={{ borderTop:"1px solid rgba(0,0,0,0.04)" }}>
                      <td style={{ padding:"14px 18px", fontWeight:800, color:"#1e293b" }}>{u.nombre}</td>
                      <td style={{ padding:"14px 10px" }}><RolBadge rol={u.rol}/></td>
                      <td style={{ padding:"14px 10px" }}>{u.nombre!==currentUser.nombre&&<button onClick={()=>{ if(confirm(`¿Revocar acceso de ${u.nombre}?`)) fetch(`${API}/usuarios/${u.id}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({adminUser:currentUser.nombre})}).then(fetchData); }} style={{ color:"#ef4444", border:"none", background:"none", cursor:"pointer", fontWeight:800, fontSize:"12px" }}>REVOCAR</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── AUDITORÍA ───────────────────────────────────────────────────── */}
        {view === "Logs" && isAdmin && (
          <div>
            <SectionHead title="Registro de Auditoría" icon={<ClipboardList/>}/>
            <div style={{ ...glass, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
                <thead><tr style={{ background:"rgba(0,0,0,0.03)", textAlign:"left", color:"#64748b" }}>
                  <th style={{ padding:"14px 16px", whiteSpace:"nowrap" }}>FECHA</th>
                  <th style={{ padding:"14px 8px", whiteSpace:"nowrap" }}>HORA</th>
                  <th style={{ padding:"14px 8px" }}>USUARIO</th>
                  <th style={{ padding:"14px 8px" }}>PERFIL</th>
                  <th style={{ padding:"14px 8px" }}>EVENTO</th>
                  <th style={{ padding:"14px 8px" }}>DETALLES</th>
                  <th style={{ padding:"14px 8px", whiteSpace:"nowrap" }}>IP / EQUIPO</th>
                </tr></thead>
                <tbody>
                  {logs.map((l:any) => {
                    const d = new Date(l.fecha);
                    const esCrit = l.accion.includes("FALLIDO")||l.accion.includes("ELIMIN");
                    const esNeut = l.accion==="LOGIN"||l.accion==="LOGOUT"||l.accion.includes("VER");
                    const bg = esCrit?"rgba(239,68,68,0.1)":esNeut?"rgba(100,116,139,0.1)":"rgba(16,185,129,0.1)";
                    const co = esCrit?"#ef4444":esNeut?"#64748b":"#10b981";
                    return (
                      <tr key={l.id} style={{ borderTop:"1px solid rgba(0,0,0,0.04)" }}>
                        <td style={{ padding:"11px 16px", fontFamily:"'Roboto Mono',monospace", fontWeight:700, color:"#334155", whiteSpace:"nowrap" }}>{d.toLocaleDateString("es-CL")}</td>
                        <td style={{ padding:"11px 8px", fontFamily:"'Roboto Mono',monospace", color:"#64748b", whiteSpace:"nowrap" }}>{d.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</td>
                        <td style={{ padding:"11px 8px", fontWeight:800, color:"#1e293b" }}>{l.usuario}</td>
                        <td style={{ padding:"11px 8px" }}>{l.perfil?<RolBadge rol={l.perfil}/>:<span style={{ color:"#cbd5e1", fontSize:"11px" }}>—</span>}</td>
                        <td style={{ padding:"11px 8px" }}><span style={{ fontSize:"11px", fontWeight:800, padding:"3px 8px", borderRadius:6, background:bg, color:co, whiteSpace:"nowrap" }}>{l.accion}</span></td>
                        <td style={{ padding:"11px 8px", color:"#475569" }}>{l.detalles}</td>
                        <td style={{ padding:"11px 8px", color:"#94a3b8", fontSize:"11px", fontFamily:"'Roboto Mono',monospace", whiteSpace:"nowrap" }}>{l.ip||"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ══ MODAL: Clasificar control ════════════════════════════════════════ */}
      {showModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", backdropFilter:"blur(10px)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:3000 }}>
          <div style={{ ...glass, background:"rgba(255,255,255,0.96)", padding:30, width:500, maxHeight:"92vh", overflowY:"auto" }}>
            <h3 style={{ marginTop:0, color:"#005a9c", fontSize:"17px", fontWeight:800 }}>Clasificar Control</h3>
            <div style={{ background:"rgba(0,90,156,0.04)", border:"2px dashed rgba(0,90,156,0.18)", borderRadius:10, padding:"10px 12px", marginBottom:14 }}>
              <div style={{ fontSize:"10px", fontWeight:800, color:"#005a9c", marginBottom:4, letterSpacing:"0.5px" }}>ESCANEAR CON PISTOLA</div>
              <input ref={scanInputRef} placeholder="Apunte aquí → auto-completa todos los campos" onKeyDown={handleModalScan} style={{ ...inp, background:"white" }}/>
            </div>
            <div style={{ display:"grid", gap:11 }}>
              <div>
                <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>GTIN {gtinLocked&&<span style={{ color:"#10b981" }}>✓ escáner</span>}</div>
                <input value={form.gtin} onChange={e=>{ setForm(f=>({...f,gtin:e.target.value})); setGtinLocked(false); setProductoExiste(false); }} onBlur={e=>verificarGTINManual(e.target.value)} style={{ ...inp, background:gtinLocked?"rgba(16,185,129,0.04)":"", borderColor:gtinLocked?"rgba(16,185,129,0.3)":"rgba(0,0,0,0.1)" }}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11 }}>
                <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>LOTE *</div><input value={form.lot} onChange={e=>setForm(f=>({...f,lot:e.target.value}))} style={inp}/></div>
                <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>VENCIMIENTO * (AAMMDD)</div><input value={form.exp} onChange={e=>{ setForm(f=>({...f,exp:e.target.value})); setExpError(validarFechaGS1(e.target.value)); }} style={{ ...inp, borderColor:expError?"#dc2626":"rgba(0,0,0,0.1)" }}/><FErr msg={expError}/></div>
              </div>
              {productoExiste && !isAdmin
                ? <div style={{ background:"rgba(16,185,129,0.05)", border:"1px solid rgba(16,185,129,0.25)", borderRadius:12, padding:14 }}>
                    <div style={{ fontSize:"10px", fontWeight:800, color:"#059669", letterSpacing:"0.5px", marginBottom:8 }}>CONTROL REGISTRADO — solo lectura</div>
                    <div style={{ fontWeight:800, color:"#1e293b", fontSize:"14px" }}>{form.nombre}</div>
                    {form.detalle&&<div style={{ fontSize:"12px", color:"#64748b", marginTop:2 }}>{form.detalle}</div>}
                    <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}><span style={{ fontSize:"11px", background:"rgba(0,90,156,0.1)", color:"#005a9c", padding:"3px 9px", borderRadius:6, fontWeight:700 }}>{form.seccion}</span><TempBadge temp={form.temperatura}/></div>
                  </div>
                : <>
                    <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>SECCIÓN *</div><input list="sec-list" value={form.seccion} onChange={e=>setForm(f=>({...f,seccion:e.target.value}))} style={inp}/><datalist id="sec-list">{secciones.map(s=><option key={s.nombre} value={s.nombre}/>)}</datalist></div>
                    <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>NOMBRE DEL CONTROL *</div><input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} style={inp}/></div>
                    <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>DETALLE</div><input value={form.detalle} onChange={e=>setForm(f=>({...f,detalle:e.target.value}))} placeholder="[cantidad] x [ml]" style={inp}/></div>
                    <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>TEMPERATURA</div><select value={form.temperatura} onChange={e=>setForm(f=>({...f,temperatura:e.target.value}))} style={inp}><option>Refrigerado</option><option>Congelado</option><option>Ambiente</option></select></div>
                    <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>INSTRUCCIONES DE PREPARACIÓN</div><textarea value={form.preparacion} onChange={e=>setForm(f=>({...f,preparacion:e.target.value}))} rows={3} style={{ ...inp, resize:"vertical", lineHeight:1.5 }}/></div>
                  </>
              }
              <button onClick={guardarProducto} style={{ padding:13, background:"#005a9c", color:"white", border:"none", borderRadius:11, fontWeight:800, cursor:"pointer", boxShadow:"0 6px 18px rgba(0,90,156,0.3)", fontSize:"14px" }}>{productoExiste?"AÑADIR AL STOCK":"GUARDAR Y AÑADIR AL STOCK"}</button>
              <button onClick={cerrarModal} style={{ background:"none", border:"none", color:"#64748b", fontWeight:700, cursor:"pointer", fontSize:"13px" }}>CANCELAR</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Editar control (admin) ════════════════════════════════════ */}
      {showEditModal && editTarget && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", backdropFilter:"blur(10px)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:3000 }}>
          <div style={{ ...glass, background:"rgba(255,255,255,0.96)", padding:30, width:520, maxHeight:"92vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
              <h3 style={{ margin:0, color:"#d97706", fontSize:"17px", fontWeight:800 }}>✏ Editar Control</h3>
              <span style={{ fontSize:"10px", color:"#94a3b8", fontFamily:"'Roboto Mono',monospace" }}>GTIN: {editTarget.gtin}</span>
            </div>
            <div style={{ display:"grid", gap:11 }}>
              <div style={{ padding:14, background:"rgba(0,90,156,0.03)", borderRadius:10, display:"grid", gap:10 }}>
                <div style={{ fontSize:"10px", fontWeight:800, color:"#005a9c" }}>DATOS DEL CONTROL</div>
                <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>NOMBRE</div><input value={editForm.nombre} onChange={e=>setEditForm(f=>({...f,nombre:e.target.value}))} style={inp}/></div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>SECCIÓN</div><input list="sec-edit" value={editForm.seccion} onChange={e=>setEditForm(f=>({...f,seccion:e.target.value}))} style={inp}/><datalist id="sec-edit">{secciones.map(s=><option key={s.nombre} value={s.nombre}/>)}</datalist></div>
                  <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>TEMPERATURA</div><select value={editForm.temperatura} onChange={e=>setEditForm(f=>({...f,temperatura:e.target.value}))} style={inp}><option>Refrigerado</option><option>Congelado</option><option>Ambiente</option></select></div>
                </div>
                <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>DETALLE</div><input value={editForm.detalle} onChange={e=>setEditForm(f=>({...f,detalle:e.target.value}))} style={inp}/></div>
                <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>PREPARACIÓN</div><textarea value={editForm.preparacion} onChange={e=>setEditForm(f=>({...f,preparacion:e.target.value}))} rows={3} style={{ ...inp, resize:"vertical", lineHeight:1.5 }}/></div>
              </div>
              <div style={{ padding:14, background:"rgba(217,119,6,0.03)", border:"1px solid rgba(217,119,6,0.12)", borderRadius:10, display:"grid", gap:10 }}>
                <div style={{ fontSize:"10px", fontWeight:800, color:"#d97706" }}>CORRECCIÓN DE LOTE / VENCIMIENTO</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>LOTE</div><input value={editForm.newLot} onChange={e=>setEditForm(f=>({...f,newLot:e.target.value}))} style={inp}/></div>
                  <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>VENCIMIENTO (AAMMDD)</div><input value={editForm.newExp} onChange={e=>{ setEditForm(f=>({...f,newExp:e.target.value})); setEditExpError(validarFechaGS1(e.target.value)); }} style={{ ...inp, borderColor:editExpError?"#dc2626":"rgba(0,0,0,0.1)" }}/><FErr msg={editExpError}/></div>
                </div>
                <p style={{ margin:0, fontSize:"11px", color:"#94a3b8" }}>Afecta {editTarget.cantidad} unidad{editTarget.cantidad!==1?"es":""} activas de este lote.</p>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={guardarEdicion} style={{ flex:1, padding:13, background:"#d97706", color:"white", border:"none", borderRadius:10, fontWeight:800, cursor:"pointer" }}>GUARDAR CAMBIOS</button>
                <button onClick={()=>{ setShowEditModal(false); setEditTarget(null); }} style={{ padding:"13px 16px", background:"rgba(0,0,0,0.05)", color:"#64748b", border:"none", borderRadius:10, fontWeight:700, cursor:"pointer" }}>CANCELAR</button>
              </div>
              <button onClick={eliminarProducto} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:11, background:"rgba(220,38,38,0.07)", color:"#dc2626", border:"1px solid rgba(220,38,38,0.18)", borderRadius:10, fontWeight:800, cursor:"pointer", fontSize:"12px" }}><Trash2 size={13}/> ELIMINAR PRODUCTO Y SU STOCK</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Preparación ═══════════════════════════════════════════════ */}
      {showPrepModal && prepItem && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", backdropFilter:"blur(8px)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:3000 }} onClick={()=>setShowPrepModal(false)}>
          <div style={{ ...glass, background:"rgba(255,255,255,0.97)", padding:30, width:460, maxHeight:"80vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:5 }}><BookOpen size={19} color="#0369a1"/><h3 style={{ margin:0, color:"#0369a1", fontSize:"17px", fontWeight:800 }}>Preparación</h3></div>
            <p style={{ margin:"0 0 18px", color:"#64748b", fontSize:"14px", fontWeight:600 }}>{prepItem.nombre}</p>
            <div style={{ display:"grid", gap:12 }}>
              <div style={{ display:"flex", gap:10 }}>
                {[["LOTE",prepItem.lot,true],["VENCIMIENTO",formatExp(prepItem.expiration),false]].map(([l,v,mono])=><div key={l as string} style={{ flex:1, background:"rgba(0,90,156,0.04)", padding:11, borderRadius:9 }}><div style={{ fontSize:"10px", fontWeight:800, color:"#64748b", marginBottom:3 }}>{l as string}</div><div style={{ fontWeight:700, color:"#1e293b", fontFamily:mono?"'Roboto Mono',monospace":undefined }}>{v as string}</div></div>)}
                <div style={{ flex:1, background:"rgba(0,90,156,0.04)", padding:11, borderRadius:9 }}><div style={{ fontSize:"10px", fontWeight:800, color:"#64748b", marginBottom:3 }}>ALMACENAMIENTO</div><TempBadge temp={prepItem.temperatura}/></div>
              </div>
              {prepItem.detalle&&<div><div style={{ fontSize:"10px", fontWeight:800, color:"#64748b", marginBottom:3 }}>PRESENTACIÓN</div><div style={{ fontWeight:600, color:"#334155" }}>{prepItem.detalle}</div></div>}
              <div>
                <div style={{ fontSize:"10px", fontWeight:800, color:"#64748b", marginBottom:6 }}>INSTRUCCIONES</div>
                {prepItem.preparacion?<div style={{ background:"rgba(3,105,161,0.04)", border:"1px solid rgba(3,105,161,0.14)", borderRadius:10, padding:13, color:"#1e293b", fontSize:"14px", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{prepItem.preparacion}</div>:<div style={{ background:"rgba(0,0,0,0.03)", borderRadius:10, padding:13, color:"#94a3b8", fontSize:"13px", fontStyle:"italic" }}>Sin instrucciones. El Admin puede agregarlas editando el control.</div>}
              </div>
            </div>
            <button onClick={()=>setShowPrepModal(false)} style={{ width:"100%", marginTop:18, padding:12, background:"rgba(0,0,0,0.05)", border:"none", borderRadius:10, fontWeight:700, color:"#64748b", cursor:"pointer" }}>CERRAR</button>
          </div>
        </div>
      )}

      {/* ══ MODAL: Protocolo ═════════════════════════════════════════════════ */}
      {showProtoModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", backdropFilter:"blur(10px)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:3000 }}>
          <div style={{ ...glass, background:"rgba(255,255,255,0.97)", padding:30, width:560, maxHeight:"92vh", overflowY:"auto" }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:20 }}><FileText size={19} color="#005a9c"/><h3 style={{ margin:0, color:"#005a9c", fontSize:"17px", fontWeight:800 }}>{editProto?"Editar Protocolo":"Nuevo Protocolo"}</h3></div>
            <div style={{ display:"grid", gap:13 }}>
              <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>SECCIÓN *</div><input list="proto-secs" value={protoForm.seccion} onChange={e=>setProtoForm(f=>({...f,seccion:e.target.value}))} style={inp}/><datalist id="proto-secs">{[...new Set(protocolos.map(p=>p.seccion))].sort().map(s=><option key={s} value={s}/>)}</datalist></div>
              <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>TÍTULO *</div><input value={protoForm.titulo} onChange={e=>setProtoForm(f=>({...f,titulo:e.target.value}))} style={inp}/></div>
              <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>CONTENIDO *</div><textarea value={protoForm.contenido} onChange={e=>setProtoForm(f=>({...f,contenido:e.target.value}))} rows={10} style={{ ...inp, resize:"vertical", lineHeight:1.65, minHeight:180 }}/></div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={guardarProtocolo} style={{ flex:1, padding:13, background:"#005a9c", color:"white", border:"none", borderRadius:11, fontWeight:800, cursor:"pointer", fontSize:"14px" }}>{editProto?"GUARDAR CAMBIOS":"CREAR PROTOCOLO"}</button>
                <button onClick={()=>setShowProtoModal(false)} style={{ padding:"13px 18px", background:"rgba(0,0,0,0.05)", color:"#64748b", border:"none", borderRadius:11, fontWeight:700, cursor:"pointer" }}>CANCELAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Anexo ═════════════════════════════════════════════════════ */}
      {showAnexoModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", backdropFilter:"blur(10px)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:3000 }}>
          <div style={{ ...glass, background:"rgba(255,255,255,0.97)", padding:30, width:460 }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:20 }}><Phone size={19} color="#005a9c"/><h3 style={{ margin:0, color:"#005a9c", fontSize:"17px", fontWeight:800 }}>{editAnexo?"Editar Anexo":"Nuevo Anexo"}</h3></div>
            <div style={{ display:"grid", gap:13 }}>
              <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>SERVICIO *</div><input value={anexoForm.servicio} onChange={e=>setAnexoForm(f=>({...f,servicio:e.target.value}))} placeholder="ej: Urgencias, UCI, Laboratorio…" style={inp}/></div>
              <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>SALA / ÁREA (opcional)</div><input value={anexoForm.salas} onChange={e=>setAnexoForm(f=>({...f,salas:e.target.value}))} placeholder="ej: Sala 3, Box 12…" style={inp}/></div>
              <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>N° ANEXO *</div><input value={anexoForm.numero} onChange={e=>setAnexoForm(f=>({...f,numero:e.target.value}))} placeholder="ej: 2340" style={{ ...inp, fontSize:"18px", letterSpacing:2, fontFamily:"'Roboto Mono',monospace" }}/></div>
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button onClick={guardarAnexo} style={{ flex:1, padding:13, background:"#005a9c", color:"white", border:"none", borderRadius:11, fontWeight:800, cursor:"pointer", fontSize:"14px" }}>{editAnexo?"GUARDAR CAMBIOS":"CREAR ANEXO"}</button>
                <button onClick={()=>{ setShowAnexoModal(false); setEditAnexo(null); }} style={{ padding:"13px 18px", background:"rgba(0,0,0,0.05)", color:"#64748b", border:"none", borderRadius:11, fontWeight:700, cursor:"pointer" }}>CANCELAR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
