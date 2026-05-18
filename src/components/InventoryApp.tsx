import { useState, useEffect, useRef } from "react";
import {
  Shield, LayoutDashboard, Users, Activity, History, LogOut,
  UserPlus, ClipboardList, ScanLine, ChevronDown, ChevronRight,
  FlaskConical, Pencil, Trash2, BookOpen, FileText, FilePlus,
  Search, X, Phone, Droplets, Archive, Plus, Upload, Printer, LayoutGrid,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { parseGS1 } from "../utils/gs1Parser";
import { parseDiuresisBarcode } from "../utils/diuresisParser";
import { apiFetch, setToken, TOKEN_KEY, USER_KEY } from "../lib/api";
import { formatExp, validarFechaGS1, getEstado, fmtDT } from "../lib/format";
import { RolBadge, EstadoBadge, TempBadge } from "./shared/Badges";
import { SectionHead, FErr } from "./shared/SectionHead";
import type { InvRow, GroupedItem, Protocolo, Anexo, DiuresisRow, ProductForm, User } from "../types";
import { lazy, Suspense } from "react";
const ControlCenter = lazy(() => import("../features/admin/ControlCenter").then(m => ({ default: m.ControlCenter })));


const EMPTY_PREP = {
  almacenamiento_sin_abrir: "" as const,
  descongelar_min: null,
  reconstituir: "" as const,
  tiempo_reconstitucion_min: null,
  temperatura_post_reconstitucion: "" as const,
  duracion_dias: null,
  cantidad_alicuotas: null,
  volumen_ul: null,
};
const EMPTY_FORM: ProductForm = {
  gtin: "", lot: "", exp: "", nombre: "", detalle: "",
  seccion: "", pack: "", temperatura: "Refrigerado", preparacion: "",
  ...EMPTY_PREP,
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
// ── Componente principal ──────────────────────────────────────────────────────

export default function InventoryApp() {
  // ─ Auth
  const [showLogin, setShowLogin]       = useState(true);
  const [currentUser, setCurrentUser]   = useState<User|null>(null);
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
  const [viewProto, setViewProto] = useState<Protocolo|null>(null);
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

  // ─ Force-PIN-change
  const [showPinChange, setShowPinChange] = useState(false);
  const [pinActual, setPinActual] = useState("");
  const [pinNuevo, setPinNuevo]   = useState("");
  const [pinNuevo2, setPinNuevo2] = useState("");

  // ─ Toast system
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "success"|"error"|"info" }[]>([]);
  const toast = (msg: string, kind: "success"|"error"|"info" = "info") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  // ─ ConfirmDialog promise-based
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; msg: string; kind: "danger"|"default"; resolve?: (v: boolean) => void }>({ open: false, title: "", msg: "", kind: "default" });
  const confirmDialog = (msg: string, opts?: { title?: string; kind?: "danger"|"default" }): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({ open: true, title: opts?.title || "Confirmar", msg, kind: opts?.kind || "default", resolve });
    });
  };
  const handleConfirmClose = (result: boolean) => {
    confirmState.resolve?.(result);
    setConfirmState(s => ({ ...s, open: false }));
  };

  // ─ Anomaly check de diuresis
  const [anomalyWarning, setAnomalyWarning] = useState<string|null>(null);

  // ─ Control Center (ERP Admin Panel)
  const [controlCenterOpen, setControlCenterOpen] = useState(false);

  // ─ Auto-fill por nombre (independiente de GTIN/lote)
  const [autofilled, setAutofilled] = useState(false);
  const buscarPorNombre = async (nombre: string) => {
    const n = nombre.trim();
    if (!n) return;
    try {
      const r = await apiFetch(`/maestro/by-name?nombre=${encodeURIComponent(n)}`);
      if (!r.ok) return;
      const m = await r.json();
      if (!m) return;
      // "Soft paste": rellena todos los campos pero permite editar
      setForm(f => ({
        ...f,
        nombre: m.nombre,
        detalle: f.detalle || m.detalle || "",
        seccion: f.seccion || m.seccion || "",
        temperatura: m.almacenamiento_sin_abrir || m.temperatura || f.temperatura,
        preparacion: f.preparacion || m.preparacion || "",
        almacenamiento_sin_abrir: (m.almacenamiento_sin_abrir || m.temperatura || f.almacenamiento_sin_abrir) as any,
        descongelar_min: m.descongelar_min !== undefined ? m.descongelar_min : f.descongelar_min,
        reconstituir: (m.reconstituir || f.reconstituir) as any,
        tiempo_reconstitucion_min: m.tiempo_reconstitucion_min !== undefined ? m.tiempo_reconstitucion_min : f.tiempo_reconstitucion_min,
        temperatura_post_reconstitucion: (m.temperatura_post_reconstitucion || f.temperatura_post_reconstitucion) as any,
        duracion_dias: m.duracion_dias !== undefined ? m.duracion_dias : f.duracion_dias,
        cantidad_alicuotas: m.cantidad_alicuotas !== undefined ? m.cantidad_alicuotas : f.cantidad_alicuotas,
        volumen_ul: m.volumen_ul !== undefined ? m.volumen_ul : f.volumen_ul,
      }));
      setAutofilled(true);
    } catch (_) {}
  };

  // ─ Bulk import desde Excel
  const [bulkPreview, setBulkPreview] = useState<Record<string, any>[]>([]);
  const [bulkErrors, setBulkErrors]   = useState<string[]>([]);
  const [bulkFileName, setBulkFileName] = useState<string>("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  const barcodeBuffer  = useRef("");
  const scanInputRef   = useRef<HTMLInputElement>(null);
  const diurScanRef    = useRef<HTMLInputElement>(null);

  // ── Restaurar sesión desde localStorage ──────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(USER_KEY);
    const tok = localStorage.getItem(TOKEN_KEY);
    if (saved && tok) {
      try {
        JSON.parse(saved); // valida formato
        // Verificar token con /api/me antes de confiar
        apiFetch("/me").then(async r => {
          if (r.ok) {
            const fresh = await r.json();
            setCurrentUser(fresh);
            setShowLogin(false);
            if (fresh.must_change_pin) setShowPinChange(true);
            if (fresh.rol === "TECNICO") setView("Anexos");
            else if (fresh.rol === "TOMA_MUESTRA") setView("Diuresis");
            else setView("Dashboard");
          }
        }).catch(() => {});
      } catch (_) {}
    }
  }, []);

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
        apiFetch(`/inventario`),
        apiFetch(`/config`),
        apiFetch(`/logs`),
        apiFetch(`/protocolos`),
        apiFetch(`/anexos`),
        apiFetch(`/diuresis/hoy`),
      ]);
      if (inv.ok)  setInventory(await inv.json());
      if (cfg.ok)  { const d = await cfg.json(); setSecciones(d.secciones.filter((s:any) => s.nombre)); setUsuarios(d.usuarios); }
      if (lg.ok)   { const d = await lg.json(); setLogs(Array.isArray(d) ? d : d.rows || []); }
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
    const res = await apiFetch(`/producto/${p.gtin}`);
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
    const res = await apiFetch(`/producto/${gtin}`);
    const existe = await res.json();
    if (existe) {
      setForm(f => ({
        ...f, gtin, lot: parsed?.lot || f.lot, exp: parsed?.expiration || f.exp,
        nombre: existe.nombre, detalle: existe.detalle || "", seccion: existe.seccion,
        temperatura: existe.almacenamiento_sin_abrir || existe.temperatura || "Refrigerado",
        preparacion: existe.preparacion || "",
        almacenamiento_sin_abrir: existe.almacenamiento_sin_abrir || existe.temperatura || "",
        descongelar_min: existe.descongelar_min ?? null,
        reconstituir: existe.reconstituir || "",
        tiempo_reconstitucion_min: existe.tiempo_reconstitucion_min ?? null,
        temperatura_post_reconstitucion: existe.temperatura_post_reconstitucion || "",
        duracion_dias: existe.duracion_dias ?? null,
        cantidad_alicuotas: existe.cantidad_alicuotas ?? null,
        volumen_ul: existe.volumen_ul ?? null,
      }));
      setProductoExiste(true); setAutofilled(true);
    } else {
      setForm(f => ({ ...f, gtin, lot: parsed?.lot || f.lot, exp: parsed?.expiration || f.exp }));
      setProductoExiste(false); setAutofilled(false);
    }
    setGtinLocked(true); setExpError(null);
  };

  const registrarEnDB = async (p: { gtin:string; lot:string; expiration:string }) => {
    await apiFetch(`/inventario`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...p, scanDate:new Date().toISOString(), usuario:currentUser!.nombre }) });
    fetchData();
  };

  const verificarGTINManual = async (gtin: string) => {
    if (!gtin || gtin.length < 8) { setProductoExiste(false); return; }
    const res = await apiFetch(`/producto/${gtin}`); const existe = await res.json();
    if (existe) {
      setForm(f => ({
        ...f, nombre: existe.nombre, detalle: existe.detalle || "", seccion: existe.seccion,
        temperatura: existe.almacenamiento_sin_abrir || existe.temperatura || "Refrigerado",
        preparacion: existe.preparacion || "",
        almacenamiento_sin_abrir: existe.almacenamiento_sin_abrir || existe.temperatura || "",
        descongelar_min: existe.descongelar_min ?? null,
        reconstituir: existe.reconstituir || "",
        tiempo_reconstitucion_min: existe.tiempo_reconstitucion_min ?? null,
        temperatura_post_reconstitucion: existe.temperatura_post_reconstitucion || "",
        duracion_dias: existe.duracion_dias ?? null,
        cantidad_alicuotas: existe.cantidad_alicuotas ?? null,
        volumen_ul: existe.volumen_ul ?? null,
      }));
      setProductoExiste(true); setAutofilled(true);
    } else { setProductoExiste(false); setAutofilled(false); }
  };

  const cerrarModal = () => { setShowModal(false); setGtinLocked(false); setExpError(null); setProductoExiste(false); setAutofilled(false); };

  const guardarProducto = async () => {
    const err = validarFechaGS1(form.exp); setExpError(err); if (err) return;
    if (!form.gtin || !form.lot) { toast("GTIN y Lote son obligatorios.", "error"); return; }
    if (!productoExiste && (!form.nombre || !form.seccion)) { toast("Nombre y Sección son obligatorios para clasificar.", "error"); return; }
    if (!productoExiste || isAdmin) {
      await apiFetch(`/producto`, { method:"POST", body: JSON.stringify({
        gtin: form.gtin, nombre: form.nombre, detalle: form.detalle, pack: form.pack, seccion: form.seccion,
        temperatura: form.almacenamiento_sin_abrir || form.temperatura, preparacion: form.preparacion,
        almacenamiento_sin_abrir: form.almacenamiento_sin_abrir,
        descongelar_min: form.descongelar_min,
        reconstituir: form.reconstituir || "No",
        tiempo_reconstitucion_min: form.tiempo_reconstitucion_min,
        temperatura_post_reconstitucion: form.temperatura_post_reconstitucion || null,
        duracion_dias: form.duracion_dias,
        cantidad_alicuotas: form.cantidad_alicuotas,
        volumen_ul: form.volumen_ul,
      })});
    }
    await registrarEnDB({ gtin:form.gtin, lot:form.lot, expiration:form.exp });
    cerrarModal();
    if (form.seccion) { setActiveSection(form.seccion); setExpandedSections(prev => new Set([...prev, form.seccion])); }
  };

  const abrirEdicion = (g: GroupedItem) => {
    setEditTarget(g); setEditExpError(null);
    setEditForm({
      gtin: g.gtin, lot: g.lot, exp: g.expiration,
      nombre: g.nombre, detalle: g.detalle, seccion: g.seccion, pack: "",
      temperatura: g.temperatura || "Refrigerado", preparacion: g.preparacion || "",
      almacenamiento_sin_abrir: (g.almacenamiento_sin_abrir || g.temperatura || "") as any,
      descongelar_min: g.descongelar_min ?? null,
      reconstituir: (g.reconstituir || "") as any,
      tiempo_reconstitucion_min: g.tiempo_reconstitucion_min ?? null,
      temperatura_post_reconstitucion: (g.temperatura_post_reconstitucion || "") as any,
      duracion_dias: g.duracion_dias ?? null,
      cantidad_alicuotas: g.cantidad_alicuotas ?? null,
      volumen_ul: g.volumen_ul ?? null,
      newLot: g.lot, newExp: g.expiration,
    });
    setShowEditModal(true);
  };

  const guardarEdicion = async () => {
    if (!editTarget) return;
    const err = validarFechaGS1(editForm.newExp); setEditExpError(err); if (err) return;
    await apiFetch(`/producto/${editTarget.gtin}`, { method:"PUT", body: JSON.stringify({
      nombre: editForm.nombre, detalle: editForm.detalle, pack: editForm.pack, seccion: editForm.seccion,
      temperatura: editForm.almacenamiento_sin_abrir || editForm.temperatura, preparacion: editForm.preparacion,
      almacenamiento_sin_abrir: editForm.almacenamiento_sin_abrir,
      descongelar_min: editForm.descongelar_min,
      reconstituir: editForm.reconstituir || "No",
      tiempo_reconstitucion_min: editForm.tiempo_reconstitucion_min,
      temperatura_post_reconstitucion: editForm.temperatura_post_reconstitucion || null,
      duracion_dias: editForm.duracion_dias,
      cantidad_alicuotas: editForm.cantidad_alicuotas,
      volumen_ul: editForm.volumen_ul,
    })});
    if (editForm.newLot !== editTarget.lot || editForm.newExp !== editTarget.expiration) {
      await apiFetch(`/inventario/lote`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ gtin:editTarget.gtin, lotActual:editTarget.lot, nuevoLot:editForm.newLot, nuevaExp:editForm.newExp, usuario:currentUser!.nombre }) });
    }
    setShowEditModal(false); setEditTarget(null); fetchData();
    setActiveSection(editForm.seccion); setExpandedSections(prev => new Set([...prev, editForm.seccion]));
  };

  const eliminarProducto = async () => {
    if (!editTarget || !await confirmDialog(`¿Eliminar "${editTarget.nombre}" y dar de baja su stock?`, { kind:"danger" })) return;
    await apiFetch(`/producto/${editTarget.gtin}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser!.nombre }) });
    setShowEditModal(false); setEditTarget(null); fetchData();
  };

  const consumirUnidad = async (g: GroupedItem) => {
    if (!await confirmDialog(`¿Descontar 1 unidad de "${g.nombre}" (Lote: ${g.lot})?`, { kind:"danger" })) return;
    await apiFetch(`/inventario/${g.itemIds[0]}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser!.nombre }) });
    fetchData();
  };

  // ── Protocolos ───────────────────────────────────────────────────────────────
  const guardarProtocolo = async () => {
    if (!protoForm.titulo.trim() || !protoForm.seccion.trim() || !protoForm.contenido.trim()) { toast("Título, sección y contenido son obligatorios.", "error"); return; }
    if (editProto) await apiFetch(`/protocolos/${editProto.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...protoForm, usuario:currentUser!.nombre }) });
    else { await apiFetch(`/protocolos`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...protoForm, usuario:currentUser!.nombre }) }); setExpandedProtoSecs(p => new Set([...p, protoForm.seccion])); }
    setShowProtoModal(false); fetchData();
  };
  const eliminarProtocolo = async (p: Protocolo) => {
    if (!await confirmDialog(`¿Eliminar "${p.titulo}"?`, { kind:"danger" })) return;
    await apiFetch(`/protocolos/${p.id}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser!.nombre }) });
    fetchData();
  };

  // ── Anexos ───────────────────────────────────────────────────────────────────
  const guardarAnexo = async () => {
    if (!anexoForm.servicio.trim() || !anexoForm.numero.trim()) { toast("Servicio y Número son obligatorios.", "error"); return; }
    if (editAnexo) await apiFetch(`/anexos/${editAnexo.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...anexoForm, usuario:currentUser!.nombre }) });
    else await apiFetch(`/anexos`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...anexoForm, usuario:currentUser!.nombre }) });
    setShowAnexoModal(false); setEditAnexo(null); setAnexoForm({ servicio:"", salas:"", numero:"" }); fetchData();
  };
  const eliminarAnexo = async (a: Anexo) => {
    if (!await confirmDialog(`¿Eliminar el anexo de "${a.servicio}"?`, { kind:"danger" })) return;
    await apiFetch(`/anexos/${a.id}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser!.nombre }) });
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

  // ── Anomaly detection: cuando hay petición + valor, comparar con histórico
  useEffect(() => {
    const peticion = diuresisForm.num_peticion.trim();
    const valStr = diuresisForm.diuresis_ml.trim();
    if (!peticion || !valStr) { setAnomalyWarning(null); return; }
    const val = parseFloat(valStr);
    if (isNaN(val)) { setAnomalyWarning(null); return; }
    const id = setTimeout(async () => {
      try {
        const r = await apiFetch(`/diuresis/stats/${encodeURIComponent(peticion)}`);
        if (!r.ok) { setAnomalyWarning(null); return; }
        const s = await r.json();
        if (s.n >= 3 && s.std !== null && s.mean !== null) {
          const z = Math.abs(val - s.mean) / Math.max(s.std, 1);
          if (z > 2) {
            setAnomalyWarning(`⚠ Anomalía: ${val} ml está ${z.toFixed(1)}σ del promedio histórico (${s.mean} ± ${s.std} ml, n=${s.n}). Verificar.`);
          } else {
            setAnomalyWarning(null);
          }
        } else {
          setAnomalyWarning(null);
        }
      } catch (_) { setAnomalyWarning(null); }
    }, 600);
    return () => clearTimeout(id);
  }, [diuresisForm.num_peticion, diuresisForm.diuresis_ml]);

  const guardarDiuresis = async () => {
    if (!diuresisForm.num_peticion.trim()) { toast("N° Petición es obligatorio.", "error"); return; }
    if (!diuresisForm.baja_motivo.trim()) { toast("Motivo de Baja es obligatorio.", "error"); return; }
    await apiFetch(`/diuresis`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...diuresisForm, usuario:currentUser!.nombre }) });
    setDiuresisForm({ ...EMPTY_DIURESIS }); fetchData();
  };

  const eliminarDiuresis = async (id: string) => {
    if (!await confirmDialog("¿Eliminar este registro?", { kind:"danger" })) return;
    await apiFetch(`/diuresis/${id}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ usuario:currentUser!.nombre }) });
    fetchData();
  };

  const buscarHistorico = async () => {
    setBuscandoHist(true);
    try {
      const p = new URLSearchParams();
      if (histFiltros.fecha) p.set("fecha", histFiltros.fecha);
      if (histFiltros.peticion) p.set("peticion", histFiltros.peticion);
      if (histFiltros.nombre) p.set("nombre", histFiltros.nombre);
      const res = await apiFetch(`/diuresis/historico?${p}`);
      if (res.ok) { const d = await res.json(); setDiuresisHist(Array.isArray(d) ? d : d.rows || []); }
    } finally { setBuscandoHist(false); }
  };

  useEffect(() => { if (view === "Diuresis" && diuresisTab === "historico") buscarHistorico(); }, [diuresisTab, view]);

  // ── Bulk import desde Excel ─────────────────────────────────────────────────
  const handleBulkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    setBulkErrors([]); setBulkPreview([]);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      if (rows.length === 0) { setBulkErrors(["El archivo no contiene filas."]); return; }
      // Normalizar nombres de columnas (case-insensitive, sin acentos)
      const norm = (k: string) => k.toString().trim().toLowerCase().replace(/[áàäâ]/g,"a").replace(/[éèëê]/g,"e").replace(/[íìïî]/g,"i").replace(/[óòöô]/g,"o").replace(/[úùüû]/g,"u");
      const map: Record<string, string> = {
        gtin: "gtin", "gtin-14": "gtin",
        nombre: "nombre", "nombre del control": "nombre", control: "nombre",
        detalle: "detalle", presentacion: "detalle", presentación: "detalle",
        pack: "pack", "pack size": "pack",
        seccion: "seccion", "sección": "seccion",
        temperatura: "temperatura", temp: "temperatura",
        preparacion: "preparacion", "preparación": "preparacion", instrucciones: "preparacion",
      };
      const cleanRows = rows.map(r => {
        const out: Record<string, any> = {};
        for (const k of Object.keys(r)) {
          const target = map[norm(k)];
          if (target) out[target] = String(r[k]).trim();
        }
        return out;
      });
      const errs: string[] = [];
      cleanRows.forEach((r, i) => {
        if (!r.gtin) errs.push(`Fila ${i+2}: falta GTIN`);
        else if (!r.nombre) errs.push(`Fila ${i+2}: falta nombre`);
        else if (!r.seccion) errs.push(`Fila ${i+2}: falta sección`);
      });
      setBulkPreview(cleanRows);
      setBulkErrors(errs.slice(0, 10));
    } catch (e: any) {
      setBulkErrors([`Error leyendo archivo: ${e.message}`]);
    }
  };

  const ejecutarBulkImport = async () => {
    if (bulkPreview.length === 0) { toast("Sin filas para importar.", "error"); return; }
    const valid = bulkPreview.filter(r => r.gtin && r.nombre && r.seccion);
    if (valid.length === 0) { toast("Ninguna fila válida.", "error"); return; }
    if (!await confirmDialog(`Importar ${valid.length} controles al maestro?`, { title:"Confirmar importación" })) return;
    setBulkImporting(true);
    try {
      const res = await apiFetch("/inventario/bulk-import", { method:"POST", body: JSON.stringify({ items: valid }) });
      const d = await res.json();
      if (d.success) {
        toast(`Importado: ${d.inserted} nuevos, ${d.updated} actualizados, ${d.skipped} saltados.`, "success");
        setBulkPreview([]); setBulkFileName(""); setBulkErrors([]);
        if (bulkFileRef.current) bulkFileRef.current.value = "";
        fetchData();
      } else {
        toast(d.message || "Error en importación.", "error");
      }
    } catch (e: any) {
      toast(`Error: ${e.message}`, "error");
    } finally {
      setBulkImporting(false);
    }
  };

  // ── Export PDF — print-friendly view en nueva pestaña, user → Cmd+P → Save PDF
  const exportarPDF = (titulo: string, filas: string[][], headers: string[]) => {
    const w = window.open("", "_blank");
    if (!w) { toast("Habilita popups para exportar PDF.", "error"); return; }
    const fecha = new Date().toLocaleString("es-CL");
    const tableRows = filas.map(r => `<tr>${r.map(c => `<td>${(c||"").toString().replace(/</g,"&lt;")}</td>`).join("")}</tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
      <style>
        body { font-family: 'Helvetica',sans-serif; margin: 30px; color: #1e293b; }
        h1 { color: #005a9c; font-size: 20px; margin: 0 0 4px; }
        .meta { color: #64748b; font-size: 11px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #005a9c; color: white; padding: 8px; text-align: left; }
        td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) td { background: #f8fafc; }
        .footer { margin-top: 30px; font-size: 10px; color: #64748b; }
        .signature { margin-top: 60px; border-top: 1px solid #1e293b; width: 280px; padding-top: 6px; font-size: 11px; }
        @media print { body { margin: 15px; } }
      </style></head><body>
      <h1>${titulo}</h1>
      <div class="meta">BIO-STOCK LIMS · Generado por <strong>${currentUser!.nombre}</strong> (${currentUser!.rol}) · ${fecha}</div>
      <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${tableRows}</tbody></table>
      <div class="signature">Firma del responsable</div>
      <div class="footer">Documento confidencial. Uso interno del laboratorio clínico.</div>
      <script>window.onload=()=>{ window.print(); }</script>
      </body></html>`);
    w.document.close();
    apiFetch("/log-accion", { method:"POST", body: JSON.stringify({ accion:"EXPORTAR PDF", detalles:`${titulo} (${filas.length} filas)` }) }).catch(()=>{});
  };

  const exportarLogsPDF = () => {
    const headers = ["FECHA","HORA","USUARIO","PERFIL","EVENTO","DETALLES","IP"];
    const filas = logs.map((l:any) => { const { fecha, hora } = fmtDT(l.fecha); return [fecha, hora, l.usuario, l.perfil||"—", l.accion, l.detalles, l.ip||"—"]; });
    exportarPDF(`Auditoría — ${logs.length} eventos`, filas, headers);
  };

  const exportarDiuresisPDF = () => {
    const headers = ["FECHA","HORA","PETICIÓN","RUT","NOMBRE","DIURESIS","MOTIVO BAJA","USUARIO"];
    const filas = diuresisHist.map(d => { const { fecha, hora } = fmtDT(d.fecha); return [fecha, hora, d.num_peticion, d.rut_paciente||"—", d.nombre_paciente||"—", d.diuresis_ml||"—", d.baja_motivo, d.usuario]; });
    exportarPDF(`Diuresis Histórico — ${diuresisHist.length} registros`, filas, headers);
  };

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!usernameInput || !pinInput) return toast("Ingrese usuario y clave.", "error");
    const res = await apiFetch(`/login`, { method:"POST", body:JSON.stringify({ nombre:usernameInput, pin:pinInput }) });
    const data = await res.json();
    if (data.success) {
      setToken(data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setCurrentUser(data.user); setShowLogin(false); setPinInput("");
      if (data.user.must_change_pin) setShowPinChange(true);
      const rol = data.user.rol;
      if (rol === "TECNICO") setView("Anexos");
      else if (rol === "TOMA_MUESTRA") setView("Diuresis");
      else setView("Dashboard");
    } else toast(data.message || "Usuario o Clave incorrectos", "error");
  };

  const handleLogout = async () => {
    await apiFetch(`/logout`, { method:"POST", body:JSON.stringify({}) }).catch(()=>{});
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setCurrentUser(null); setShowLogin(true); setUsernameInput(""); setPinInput("");
  };

  const cambiarPin = async () => {
    if (!pinActual || !pinNuevo) return toast("Complete ambos campos.", "error");
    if (pinNuevo !== pinNuevo2) return toast("Los PIN nuevos no coinciden.", "error");
    if (pinNuevo.length < 4) return toast("PIN nuevo mínimo 4 caracteres.", "error");
    if (pinNuevo === "1234" || pinNuevo === "0000") return toast("PIN demasiado débil.", "error");
    const res = await apiFetch(`/cambiar-pin`, { method:"POST", body:JSON.stringify({ pinActual, pinNuevo }) });
    const data = await res.json();
    if (data.success) {
      setShowPinChange(false); setPinActual(""); setPinNuevo(""); setPinNuevo2("");
      setCurrentUser((u:any) => ({ ...u, must_change_pin: false }));
      toast("PIN actualizado correctamente.", "success");
    } else toast(data.message || "No se pudo actualizar el PIN.", "error");
  };

  const crearUsuario = async () => {
    if (!newUser.nombre || !newUser.pin) return toast("Datos incompletos.", "error");
    const res = await apiFetch(`/usuarios`, { method:"POST", body:JSON.stringify(newUser) });
    const data = await res.json();
    if (data.success) { toast(`Usuario "${newUser.nombre}" creado.`, "success"); setNewUser({ nombre:"", rol:"TECNICO", pin:"" }); fetchData(); }
    else toast(data.message || "Error al crear usuario.", "error");
  };

  // ── Datos derivados ───────────────────────────────────────────────────────────
  const allSecNames = [...new Set([...secciones.map(s=>s.nombre), ...inventory.map(i=>i.seccion).filter(Boolean) as string[]])];
  const sectionTree = allSecNames.map(n => ({ nombre:n, count:inventory.filter(i=>i.seccion===n).length, productos:[...new Set(inventory.filter(i=>i.seccion===n).map(i=>i.nombre).filter(Boolean))] as string[] })).filter(s=>s.count>0);
  // Lista de nombres únicos para el dropdown del modal — derivada del stock activo
  const productNames = [...new Set(inventory.map(i => i.nombre).filter(Boolean) as string[])].sort();

  const filteredInv = inventory.filter(i => {
    if (activeSection && i.seccion !== activeSection) return false;
    if (activeProduct && i.nombre !== activeProduct) return false;
    if (searchTerm) { const t = searchTerm.toLowerCase(); return i.nombre?.toLowerCase().includes(t) || i.lot?.toLowerCase().includes(t) || i.gtin?.includes(t); }
    return true;
  });

  const groupMap: Record<string, GroupedItem> = {};
  for (const item of filteredInv) {
    const key = `${item.gtin}||${item.lot}`;
    if (!groupMap[key]) groupMap[key] = {
      gtin: item.gtin, lot: item.lot, nombre: item.nombre || "Sin clasificar",
      detalle: item.detalle || "", seccion: item.seccion || "",
      expiration: item.expiration,
      temperatura: item.temperatura || "Refrigerado",
      preparacion: item.preparacion || "",
      almacenamiento_sin_abrir: item.almacenamiento_sin_abrir as any,
      descongelar_min: item.descongelar_min ?? null,
      reconstituir: item.reconstituir as any,
      tiempo_reconstitucion_min: item.tiempo_reconstitucion_min ?? null,
      temperatura_post_reconstitucion: item.temperatura_post_reconstitucion as any,
      duracion_dias: item.duracion_dias ?? null,
      cantidad_alicuotas: item.cantidad_alicuotas ?? null,
      volumen_ul: item.volumen_ul ?? null,
      cantidad: 0, itemIds: [],
    };
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

  // ── CONTROL CENTER (ERP Admin) — overlay full-screen para admins ─────────────
  if (controlCenterOpen && currentUser && isAdmin) {
    return (
      <Suspense fallback={<div style={{ position:"fixed", inset:0, background:"#0a0a0a", color:"#fafafa", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui" }}>Cargando Control Center…</div>}>
        <ControlCenter
          currentUser={currentUser}
          onExit={() => setControlCenterOpen(false)}
          onToast={toast}
        />
      </Suspense>
    );
  }

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
          {isAdmin && <button onClick={()=>setView("Importar")} style={navBtn(view==="Importar")}><Upload size={14}/> Importar Excel</button>}
          {isAdmin && <button onClick={()=>setView("Usuarios")} style={navBtn(view==="Usuarios")}><Users size={14}/> Personal</button>}
          {isAdmin && <button onClick={()=>setView("Logs")} style={navBtn(view==="Logs")}><History size={14}/> Auditoría</button>}
          {isAdmin && (
            <button onClick={()=>setControlCenterOpen(true)}
              style={{
                marginTop: 10, padding: "11px 14px",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "white", border: "none", borderRadius: 10,
                fontWeight: 800, cursor: "pointer", fontSize: "13px",
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
                letterSpacing: 0.3,
              }}>
              <LayoutGrid size={14}/> CONTROL CENTER
            </button>
          )}
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
            <div style={{ fontWeight:800, color:"#0f172a", fontSize:"12px", marginBottom:6 }}>{currentUser!.nombre}</div>
            <RolBadge rol={currentUser!.rol} />
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
                              {canPrep && <button onClick={()=>{ setPrepItem(g); setShowPrepModal(true); apiFetch(`/log-accion`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({usuario:currentUser!.nombre,accion:"VER PREPARACIÓN",detalles:`${g.nombre} | ${g.lot}`})}).catch(()=>{}); }} style={{ display:"flex", alignItems:"center", gap:3, color:"#0369a1", border:"1px solid rgba(3,105,161,0.2)", background:"rgba(3,105,161,0.06)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}><BookOpen size={11}/> Prep.</button>}
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
                    {anomalyWarning && (
                      <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:10, padding:"10px 14px", marginBottom:12, color:"#92400e", fontSize:"12px", fontWeight:700, lineHeight:1.5 }}>
                        {anomalyWarning}
                      </div>
                    )}
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
                      <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(0,0,0,0.05)", fontSize:"12px", fontWeight:700, color:"#64748b", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span>{diuresisHist.length} resultado{diuresisHist.length!==1?"s":""}</span>
                        <button onClick={exportarDiuresisPDF} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", background:"#005a9c", color:"white", border:"none", borderRadius:7, fontWeight:700, cursor:"pointer", fontSize:"11px" }}><Printer size={11}/> PDF</button>
                      </div>
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
          const ProtoRow = ({ p }: { p: Protocolo }) => (
            <div
              onClick={()=>setViewProto(p)}
              style={{ ...glass, padding:"12px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12, cursor:"pointer", transition:"all 0.15s" }}
              onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.background = "rgba(0,90,156,0.06)"; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.72)"; }}
            >
              <FileText size={16} color="#005a9c" style={{ flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, color:"#1e293b", fontSize:"14px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.titulo}</div>
                <div style={{ fontSize:"11px", color:"#94a3b8" }}>{p.autor} · {new Date(p.updated_at).toLocaleDateString("es-CL")}</div>
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                {canEditProto && <button onClick={()=>{ setEditProto(p); setProtoForm({titulo:p.titulo,seccion:p.seccion,contenido:p.contenido}); setShowProtoModal(true); }} style={{ display:"flex", alignItems:"center", gap:3, color:"#d97706", border:"1px solid rgba(217,119,6,0.2)", background:"rgba(217,119,6,0.06)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}><Pencil size={11}/> Editar</button>}
                {isAdmin && <button onClick={()=>eliminarProtocolo(p)} style={{ display:"flex", alignItems:"center", gap:3, color:"#dc2626", border:"1px solid rgba(220,38,38,0.2)", background:"rgba(220,38,38,0.05)", padding:"5px 9px", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:"11px" }}><Trash2 size={11}/></button>}
              </div>
            </div>
          );
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
                  : <>{<div style={{ fontSize:"12px", color:"#64748b", fontWeight:700, marginBottom:14 }}>{filtered.length} resultado{filtered.length!==1?"s":""}</div>}{filtered.map(p=><ProtoRow key={p.id} p={p}/>)}</>
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
                          {isOpen && <div style={{ border:"1px solid rgba(0,90,156,0.1)", borderTop:"none", borderRadius:"0 0 12px 12px", padding:12, background:"rgba(255,255,255,0.4)" }}>{protocolos.filter(p=>p.seccion===sec).map(p=><ProtoRow key={p.id} p={p}/>)}</div>}
                        </div>
                      );
                    })
              }
            </div>
          );
        })()}

        {/* ─── USUARIOS ────────────────────────────────────────────────────── */}
        {/* ─── IMPORTAR EXCEL ──────────────────────────────────────────────── */}
        {view === "Importar" && isAdmin && (
          <div style={{ maxWidth: 1000 }}>
            <SectionHead title="Importar Maestro desde Excel" icon={<Upload/>}/>
            <div style={{ ...glass, padding: 22, marginBottom: 16 }}>
              <div style={{ fontSize:"12px", color:"#64748b", marginBottom:12, lineHeight:1.55 }}>
                Sube un archivo <strong>.xlsx</strong> con las columnas: <code style={{ background:"rgba(0,0,0,0.05)", padding:"1px 6px", borderRadius:4 }}>gtin</code>, <code style={{ background:"rgba(0,0,0,0.05)", padding:"1px 6px", borderRadius:4 }}>nombre</code>, <code style={{ background:"rgba(0,0,0,0.05)", padding:"1px 6px", borderRadius:4 }}>seccion</code>, y opcionalmente <code>detalle</code>, <code>pack</code>, <code>temperatura</code>, <code>preparacion</code>. Los nombres de columnas no son sensibles a mayúsculas/acentos. Máximo 5,000 filas.
              </div>
              <input
                ref={bulkFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleBulkFile}
                style={{ padding:"10px", border:"2px dashed rgba(0,90,156,0.3)", borderRadius:10, width:"100%", background:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:"13px" }}
              />
              {bulkFileName && (
                <div style={{ marginTop:10, fontSize:"12px", color:"#475569" }}>
                  Archivo: <strong>{bulkFileName}</strong> · {bulkPreview.length} filas detectadas
                </div>
              )}
            </div>

            {bulkErrors.length > 0 && (
              <div style={{ ...glass, background:"rgba(239,68,68,0.05)", border:"1px solid rgba(239,68,68,0.25)", padding:14, marginBottom:14 }}>
                <div style={{ fontWeight:800, color:"#dc2626", marginBottom:8, fontSize:"12px" }}>{bulkErrors.length} ERRORES DETECTADOS (mostrando 10):</div>
                <ul style={{ margin:0, paddingLeft:20, fontSize:"12px", color:"#7f1d1d" }}>{bulkErrors.map((e,i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}

            {bulkPreview.length > 0 && (
              <div style={{ ...glass, overflow:"hidden", marginBottom:14 }}>
                <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(0,0,0,0.05)", fontSize:"12px", fontWeight:700, color:"#64748b" }}>
                  Previsualización ({Math.min(bulkPreview.length, 20)} de {bulkPreview.length})
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"11px" }}>
                    <thead><tr style={{ background:"rgba(0,90,156,0.04)" }}>
                      {["GTIN","Nombre","Sección","Detalle","Temp.","Preparación","Estado"].map(h => <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontWeight:800, color:"#005a9c" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {bulkPreview.slice(0, 20).map((r, i) => {
                        const ok = r.gtin && r.nombre && r.seccion;
                        return (
                          <tr key={i} style={{ borderTop:"1px solid rgba(0,0,0,0.04)" }}>
                            <td style={{ padding:"6px 10px", fontFamily:"'Roboto Mono',monospace" }}>{r.gtin}</td>
                            <td style={{ padding:"6px 10px", fontWeight:700 }}>{r.nombre}</td>
                            <td style={{ padding:"6px 10px" }}>{r.seccion}</td>
                            <td style={{ padding:"6px 10px", color:"#64748b" }}>{r.detalle || "—"}</td>
                            <td style={{ padding:"6px 10px" }}>{r.temperatura || "Refrigerado"}</td>
                            <td style={{ padding:"6px 10px", color:"#64748b", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.preparacion || "—"}</td>
                            <td style={{ padding:"6px 10px" }}>
                              {ok ? <span style={{ color:"#059669", fontWeight:700 }}>✓ OK</span> : <span style={{ color:"#dc2626", fontWeight:700 }}>✗ Inválido</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {bulkPreview.length > 0 && (
              <button
                onClick={ejecutarBulkImport}
                disabled={bulkImporting}
                style={{ padding:"12px 28px", background:"#005a9c", color:"white", border:"none", borderRadius:10, fontWeight:800, cursor: bulkImporting ? "wait" : "pointer", fontSize:"14px", boxShadow:"0 4px 14px rgba(0,90,156,0.3)", opacity: bulkImporting ? 0.6 : 1 }}
              >
                {bulkImporting ? "IMPORTANDO…" : `IMPORTAR ${bulkPreview.filter(r => r.gtin && r.nombre && r.seccion).length} CONTROLES`}
              </button>
            )}
          </div>
        )}

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
                      <td style={{ padding:"14px 10px" }}>{u.nombre!==currentUser!.nombre&&<button onClick={async ()=>{ if(await confirmDialog(`¿Revocar acceso de ${u.nombre}?`, { kind:"danger" })) apiFetch(`/usuarios/${u.id}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({adminUser:currentUser!.nombre})}).then(fetchData); }} style={{ color:"#ef4444", border:"none", background:"none", cursor:"pointer", fontWeight:800, fontSize:"12px" }}>REVOCAR</button>}</td>
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
            <SectionHead title="Registro de Auditoría" icon={<ClipboardList/>}
              action={<button onClick={exportarLogsPDF} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", background:"#005a9c", color:"white", border:"none", borderRadius:10, fontWeight:800, cursor:"pointer", fontSize:"13px", boxShadow:"0 4px 14px rgba(0,90,156,0.3)" }}><Printer size={15}/> Exportar PDF</button>}
            />
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
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                        <span style={{ fontSize:"10px", fontWeight:700, color:"#64748b" }}>NOMBRE DEL CONTROL *</span>
                        {autofilled && <span style={{ fontSize:"10px", fontWeight:700, color:"#059669" }}>✓ datos heredados (editables)</span>}
                      </div>
                      <input
                        list="prod-name-list"
                        value={form.nombre}
                        onChange={e=>{ setForm(f=>({ ...f, nombre: e.target.value })); setAutofilled(false); }}
                        onBlur={e => buscarPorNombre(e.target.value)}
                        style={inp}
                      />
                      <datalist id="prod-name-list">{productNames.map(n => <option key={n} value={n}/>)}</datalist>
                    </div>
                    <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>DETALLE</div><input value={form.detalle} onChange={e=>setForm(f=>({...f,detalle:e.target.value}))} placeholder="[cantidad] x [ml]" style={inp}/></div>

                    {/* ─── PREPARACIÓN ESTRUCTURADA (8 campos) ─── */}
                    <div style={{ background:"rgba(0,90,156,0.04)", border:"1px solid rgba(0,90,156,0.12)", borderRadius:10, padding:14, marginTop:4 }}>
                      <div style={{ fontSize:"11px", fontWeight:800, color:"#005a9c", marginBottom:10, letterSpacing:"0.5px" }}>PREPARACIÓN Y CONSERVACIÓN</div>

                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        {/* Almacenamiento sin abrir */}
                        <div>
                          <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>ALMACENAMIENTO SIN ABRIR *</div>
                          <select value={form.almacenamiento_sin_abrir} onChange={e=>setForm(f=>({...f, almacenamiento_sin_abrir:e.target.value as any, temperatura:e.target.value }))} style={inp}>
                            <option value="">— Seleccionar —</option>
                            <option value="Refrigerado">Refrigerado</option>
                            <option value="Congelado">Congelado</option>
                            <option value="Ambiente">T. Ambiente</option>
                          </select>
                        </div>

                        {/* Descongelar */}
                        <div>
                          <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>DESCONGELAR (min)</div>
                          <div style={{ display:"flex", gap:6 }}>
                            <select
                              value={form.descongelar_min === null ? "na" : "min"}
                              onChange={e=>setForm(f=>({ ...f, descongelar_min: e.target.value === "na" ? null : (f.descongelar_min ?? 30) }))}
                              style={{ ...inp, width:90 }}
                            >
                              <option value="na">No aplica</option>
                              <option value="min">Minutos</option>
                            </select>
                            {form.descongelar_min !== null && (
                              <input type="number" min="0" value={form.descongelar_min} onChange={e=>setForm(f=>({ ...f, descongelar_min: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 }))} style={{ ...inp, flex:1 }}/>
                            )}
                          </div>
                        </div>

                        {/* Reconstituir */}
                        <div>
                          <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>RECONSTITUIR</div>
                          <select value={form.reconstituir} onChange={e=>setForm(f=>({ ...f, reconstituir: e.target.value as any, ...(e.target.value === "No" ? { tiempo_reconstitucion_min: null, temperatura_post_reconstitucion: "", duracion_dias: null, cantidad_alicuotas: null, volumen_ul: null } : {}) }))} style={inp}>
                            <option value="">— Seleccionar —</option>
                            <option value="No">No</option>
                            <option value="Si">Sí</option>
                          </select>
                        </div>

                        {/* Tiempo reconstitución */}
                        <div>
                          <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>TIEMPO RECONSTITUCIÓN (min)</div>
                          <div style={{ display:"flex", gap:6 }}>
                            <select
                              disabled={form.reconstituir !== "Si"}
                              value={form.tiempo_reconstitucion_min === null ? "na" : "min"}
                              onChange={e=>setForm(f=>({ ...f, tiempo_reconstitucion_min: e.target.value === "na" ? null : (f.tiempo_reconstitucion_min ?? 30) }))}
                              style={{ ...inp, width:90, opacity: form.reconstituir !== "Si" ? 0.5 : 1 }}
                            >
                              <option value="na">No aplica</option>
                              <option value="min">Minutos</option>
                            </select>
                            {form.tiempo_reconstitucion_min !== null && form.reconstituir === "Si" && (
                              <input type="number" min="0" value={form.tiempo_reconstitucion_min} onChange={e=>setForm(f=>({ ...f, tiempo_reconstitucion_min: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 }))} style={{ ...inp, flex:1 }}/>
                            )}
                          </div>
                        </div>

                        {/* Temperatura post-reconstitución */}
                        <div>
                          <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>T° ALMACÉN POST-RECONST.</div>
                          <select disabled={form.reconstituir !== "Si"} value={form.temperatura_post_reconstitucion} onChange={e=>setForm(f=>({ ...f, temperatura_post_reconstitucion: e.target.value as any }))} style={{ ...inp, opacity: form.reconstituir !== "Si" ? 0.5 : 1 }}>
                            <option value="">— Seleccionar —</option>
                            <option value="Refrigerado">Refrigerado</option>
                            <option value="Congelado">Congelado</option>
                            <option value="Ambiente">T. Ambiente</option>
                          </select>
                        </div>

                        {/* Duración */}
                        <div>
                          <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>DURACIÓN (días)</div>
                          <input type="number" min="0" placeholder="—" disabled={form.reconstituir !== "Si"}
                            value={form.duracion_dias ?? ""}
                            onChange={e=>setForm(f=>({ ...f, duracion_dias: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 }))}
                            style={{ ...inp, opacity: form.reconstituir !== "Si" ? 0.5 : 1 }}/>
                        </div>

                        {/* Cantidad alícuotas */}
                        <div>
                          <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>CANTIDAD ALÍCUOTAS</div>
                          <input type="number" min="0" placeholder="—" disabled={form.reconstituir !== "Si"}
                            value={form.cantidad_alicuotas ?? ""}
                            onChange={e=>setForm(f=>({ ...f, cantidad_alicuotas: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 }))}
                            style={{ ...inp, opacity: form.reconstituir !== "Si" ? 0.5 : 1 }}/>
                        </div>

                        {/* Volumen uL */}
                        <div>
                          <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>VOLUMEN ALÍCUOTA (μL)</div>
                          <input type="number" min="0" placeholder="—" disabled={form.reconstituir !== "Si"}
                            value={form.volumen_ul ?? ""}
                            onChange={e=>setForm(f=>({ ...f, volumen_ul: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 }))}
                            style={{ ...inp, opacity: form.reconstituir !== "Si" ? 0.5 : 1 }}/>
                        </div>
                      </div>

                      {/* Notas libres opcionales */}
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>NOTAS ADICIONALES (opcional)</div>
                        <textarea value={form.preparacion} onChange={e=>setForm(f=>({...f,preparacion:e.target.value}))} rows={2} placeholder="Observaciones libres sobre la preparación" style={{ ...inp, resize:"vertical", lineHeight:1.5 }}/>
                      </div>
                    </div>
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

              {/* Preparación estructurada */}
              {(prepItem.almacenamiento_sin_abrir || prepItem.reconstituir || prepItem.descongelar_min !== null) ? (
                <div style={{ background:"rgba(3,105,161,0.04)", border:"1px solid rgba(3,105,161,0.14)", borderRadius:10, padding:13 }}>
                  <div style={{ fontSize:"10px", fontWeight:800, color:"#0369a1", marginBottom:8, letterSpacing:"0.5px" }}>PREPARACIÓN</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:"13px" }}>
                    {prepItem.almacenamiento_sin_abrir && <div><div style={{ color:"#64748b", fontSize:"10px", fontWeight:700 }}>Sin abrir</div><div style={{ color:"#1e293b", fontWeight:600 }}>{prepItem.almacenamiento_sin_abrir}</div></div>}
                    {prepItem.descongelar_min !== null && prepItem.descongelar_min !== undefined && <div><div style={{ color:"#64748b", fontSize:"10px", fontWeight:700 }}>Descongelar</div><div style={{ color:"#1e293b", fontWeight:600 }}>{prepItem.descongelar_min} min</div></div>}
                    {prepItem.reconstituir && <div><div style={{ color:"#64748b", fontSize:"10px", fontWeight:700 }}>Reconstituir</div><div style={{ color:"#1e293b", fontWeight:600 }}>{prepItem.reconstituir}</div></div>}
                    {prepItem.tiempo_reconstitucion_min !== null && prepItem.tiempo_reconstitucion_min !== undefined && <div><div style={{ color:"#64748b", fontSize:"10px", fontWeight:700 }}>Tiempo reconst.</div><div style={{ color:"#1e293b", fontWeight:600 }}>{prepItem.tiempo_reconstitucion_min} min</div></div>}
                    {prepItem.temperatura_post_reconstitucion && <div><div style={{ color:"#64748b", fontSize:"10px", fontWeight:700 }}>T° post-reconst.</div><div style={{ color:"#1e293b", fontWeight:600 }}>{prepItem.temperatura_post_reconstitucion}</div></div>}
                    {prepItem.duracion_dias !== null && prepItem.duracion_dias !== undefined && <div><div style={{ color:"#64748b", fontSize:"10px", fontWeight:700 }}>Duración</div><div style={{ color:"#1e293b", fontWeight:600 }}>{prepItem.duracion_dias} días</div></div>}
                    {prepItem.cantidad_alicuotas !== null && prepItem.cantidad_alicuotas !== undefined && <div><div style={{ color:"#64748b", fontSize:"10px", fontWeight:700 }}>Alícuotas</div><div style={{ color:"#1e293b", fontWeight:600 }}>{prepItem.cantidad_alicuotas} × {prepItem.volumen_ul || "?"} μL</div></div>}
                  </div>
                </div>
              ) : null}

              {/* Notas libres */}
              {prepItem.preparacion ? (
                <div>
                  <div style={{ fontSize:"10px", fontWeight:800, color:"#64748b", marginBottom:6 }}>NOTAS ADICIONALES</div>
                  <div style={{ background:"rgba(0,0,0,0.02)", border:"1px solid rgba(0,0,0,0.05)", borderRadius:10, padding:13, color:"#334155", fontSize:"13px", lineHeight:1.6, whiteSpace:"pre-wrap" }}>{prepItem.preparacion}</div>
                </div>
              ) : (!prepItem.almacenamiento_sin_abrir && !prepItem.reconstituir) ? (
                <div style={{ background:"rgba(0,0,0,0.03)", borderRadius:10, padding:13, color:"#94a3b8", fontSize:"13px", fontStyle:"italic" }}>Sin instrucciones. El Admin puede agregarlas editando el control.</div>
              ) : null}
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

      {/* ══ MODAL: Visualizar Protocolo ══════════════════════════════════════ */}
      {viewProto && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", backdropFilter:"blur(10px)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:3000 }} onClick={()=>setViewProto(null)}>
          <div style={{ ...glass, background:"rgba(255,255,255,0.98)", padding:0, width:680, maxHeight:"88vh", display:"flex", flexDirection:"column" }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding:"22px 28px 16px", borderBottom:"1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <FileText size={20} color="#005a9c"/>
                    <span style={{ fontSize:"11px", fontWeight:800, color:"#005a9c", background:"rgba(0,90,156,0.1)", padding:"3px 10px", borderRadius:20, letterSpacing:"0.4px" }}>{viewProto.seccion}</span>
                  </div>
                  <h2 style={{ margin:0, color:"#0f172a", fontSize:"22px", fontWeight:800, lineHeight:1.25 }}>{viewProto.titulo}</h2>
                  <div style={{ marginTop:8, fontSize:"12px", color:"#64748b" }}>
                    Autor: <strong style={{ color:"#334155" }}>{viewProto.autor}</strong> ·
                    Última actualización: {new Date(viewProto.updated_at).toLocaleString("es-CL")}
                  </div>
                </div>
                <button onClick={()=>setViewProto(null)} aria-label="Cerrar" style={{ background:"rgba(0,0,0,0.04)", border:"none", borderRadius:9, padding:8, cursor:"pointer", color:"#64748b", display:"flex", flexShrink:0 }}><X size={18}/></button>
              </div>
            </div>
            {/* Contenido scrollable */}
            <div style={{ padding:"22px 28px", overflowY:"auto", flex:1, fontSize:"14px", color:"#1e293b", lineHeight:1.75, whiteSpace:"pre-wrap" }}>
              {viewProto.contenido}
            </div>
            {/* Footer con acciones */}
            <div style={{ padding:"14px 28px", borderTop:"1px solid rgba(0,0,0,0.06)", display:"flex", justifyContent:"flex-end", gap:8, background:"rgba(0,0,0,0.02)" }}>
              {canEditProto && (
                <button onClick={()=>{ setEditProto(viewProto); setProtoForm({titulo:viewProto.titulo,seccion:viewProto.seccion,contenido:viewProto.contenido}); setShowProtoModal(true); setViewProto(null); }}
                  style={{ display:"flex", alignItems:"center", gap:5, color:"#d97706", border:"1px solid rgba(217,119,6,0.25)", background:"rgba(217,119,6,0.08)", padding:"9px 16px", borderRadius:9, cursor:"pointer", fontWeight:700, fontSize:"13px" }}><Pencil size={13}/> Editar</button>
              )}
              <button onClick={()=>setViewProto(null)} style={{ padding:"9px 20px", background:"#005a9c", color:"white", border:"none", borderRadius:9, fontWeight:800, cursor:"pointer", fontSize:"13px" }}>CERRAR</button>
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

      {/* ══ MODAL: Cambio de PIN obligatorio ═══════════════════════════════ */}
      {showPinChange && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.85)", backdropFilter:"blur(10px)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:4000 }}>
          <div style={{ ...glass, background:"rgba(255,255,255,0.98)", padding:34, width:440 }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:6 }}>
              <Shield size={22} color="#dc2626"/>
              <h3 style={{ margin:0, color:"#dc2626", fontSize:"18px", fontWeight:800 }}>Cambio de PIN obligatorio</h3>
            </div>
            <p style={{ color:"#64748b", fontSize:"13px", margin:"6px 0 22px", lineHeight:1.55 }}>
              Tu cuenta requiere un PIN nuevo. Elige uno de al menos 4 dígitos. Evita combinaciones obvias.
            </p>
            <div style={{ display:"grid", gap:13 }}>
              <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>PIN ACTUAL</div><input type="password" value={pinActual} onChange={e=>setPinActual(e.target.value)} style={inp}/></div>
              <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>PIN NUEVO</div><input type="password" value={pinNuevo} onChange={e=>setPinNuevo(e.target.value)} style={inp}/></div>
              <div><div style={{ fontSize:"10px", fontWeight:700, color:"#64748b", marginBottom:3 }}>REPETIR PIN NUEVO</div><input type="password" value={pinNuevo2} onChange={e=>setPinNuevo2(e.target.value)} style={inp}/></div>
              <button onClick={cambiarPin} style={{ padding:13, background:"#005a9c", color:"white", border:"none", borderRadius:11, fontWeight:800, cursor:"pointer", fontSize:"14px", marginTop:6 }}>CAMBIAR PIN</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM DIALOG ════════════════════════════════════════════════════ */}
      {confirmState.open && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", backdropFilter:"blur(10px)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:5000 }}>
          <div style={{ ...glass, background:"rgba(255,255,255,0.98)", padding:28, width:420 }}>
            <h3 style={{ margin:"0 0 10px", color: confirmState.kind === "danger" ? "#dc2626" : "#005a9c", fontSize:"17px", fontWeight:800 }}>
              {confirmState.title}
            </h3>
            <p style={{ margin:"0 0 22px", color:"#334155", fontSize:"14px", lineHeight:1.55 }}>
              {confirmState.msg}
            </p>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={()=>handleConfirmClose(false)} style={{ padding:"10px 20px", background:"rgba(0,0,0,0.05)", color:"#64748b", border:"none", borderRadius:9, fontWeight:700, cursor:"pointer", fontSize:"13px" }}>CANCELAR</button>
              <button onClick={()=>handleConfirmClose(true)} style={{ padding:"10px 20px", background: confirmState.kind === "danger" ? "#dc2626" : "#005a9c", color:"white", border:"none", borderRadius:9, fontWeight:800, cursor:"pointer", fontSize:"13px" }}>CONFIRMAR</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TOASTS ═══════════════════════════════════════════════════════════ */}
      <div style={{ position:"fixed", top:16, right:16, zIndex:9999, display:"flex", flexDirection:"column", gap:8, pointerEvents:"none" }}>
        {toasts.map(t => {
          const bg = t.kind==="success" ? "#10b981" : t.kind==="error" ? "#dc2626" : "#005a9c";
          return (
            <div key={t.id} style={{ background:bg, color:"white", padding:"12px 18px", borderRadius:10, fontWeight:700, fontSize:"13px", boxShadow:"0 10px 30px rgba(0,0,0,0.18)", maxWidth:380, pointerEvents:"auto" }}>{t.msg}</div>
          );
        })}
      </div>
    </div>
  );
}
