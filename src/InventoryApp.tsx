import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, ShieldLock, Database, History, LayoutDashboard, PlusCircle, Beaker, Trash2, ThermometerSnowflake, Flame } from "lucide-react";

const API_URL = `http://${window.location.hostname}:3000/api`;
const SECCIONES = ["Hematología", "Química", "Inmunología", "Coagulación", "Uroanálisis", "Microbiología"];

export default function InventoryApp() {
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("Inventario");
  const [activeSection, setActiveSection] = useState("Hematología");
  const [tempFilter, setTempFilter] = useState("TODOS");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isManual, setIsManual] = useState(false);
  const [form, setForm] = useState({ gtin: "", lot: "", exp: "", name: "", section: "Hematología", pack: "", temp: "Refrigerado" });

  const barcodeBuffer = useRef("");
  const lastKeyTime = useRef(Date.now());

  const fetchAll = async () => {
    try {
      const [inv, lg] = await Promise.all([fetch(`${API_URL}/inventario`), fetch(`${API_URL}/logs`)]);
      if (inv.ok) setInventory(await inv.json());
      if (lg.ok) setLogs(await lg.json());
    } catch (e) { console.error("Error conexión API"); }
  };

  useEffect(() => {
    fetchAll();
    const int = setInterval(fetchAll, 5000);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const now = Date.now();
      if (now - lastKeyTime.current > 150) barcodeBuffer.current = "";
      lastKeyTime.current = now;
      if (e.key === "Enter") {
        if (barcodeBuffer.current.length > 5) handleScanner(barcodeBuffer.current);
        barcodeBuffer.current = "";
      } else if (e.key.length === 1) barcodeBuffer.current += e.key;
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inventory]);

  const handleScanner = async (code: string) => {
    const res = await fetch(`${API_URL}/producto/${code}`);
    const data = await res.json();
    if (data) {
      registrarEnStock({ gtin: code, lot: "LÁSER", exp: "999999" });
      setActiveSection(data.seccion);
    } else {
      setForm({ ...form, gtin: code, lot: "", exp: "" });
      setIsManual(false);
      setShowModal(true);
    }
  };

  const registrarEnStock = async (p: any) => {
    await fetch(`${API_URL}/inventario`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Math.random().toString(36).substr(2,9), ...p, scanDate: new Date().toISOString(), usuario: "TEC_SALA" })
    });
    fetchAll();
  };

  const saveProduct = async () => {
    if (!form.name || !form.gtin) return alert("Nombre y Código requeridos");
    await fetch(`${API_URL}/producto`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, usuario: "SISTEMA" })
    });
    await registrarEnStock({ gtin: form.gtin, lot: form.lot, exp: form.exp });
    setShowModal(false);
  };

  const filtered = inventory.filter(i => 
    i.seccion === activeSection && 
    (tempFilter === "TODOS" || i.temperatura === tempFilter) &&
    (i.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || i.lot?.includes(searchTerm))
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f1f5f9", fontFamily: "sans-serif" }}>
      <aside style={{ width: "260px", background: "#0f172a", color: "white", padding: "25px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ color: "#38bdf8", marginBottom: "30px" }}>BIO-STOCK</h2>
        <nav style={{ flex: 1 }}>
          <button onClick={() => setActiveTab("Inventario")} style={btnStyle(activeTab === "Inventario")}><Database size={18}/> Inventario</button>
          {isAdmin && <button onClick={() => setActiveTab("Logs")} style={btnStyle(activeTab === "Logs")}><History size={18}/> Trazabilidad</button>}
          <button onClick={() => { setIsManual(true); setShowModal(true); }} style={{ width: "100%", padding: "12px", background: "#10b981", color: "white", border: "none", borderRadius: "10px", marginTop: "20px", cursor: "pointer", fontWeight: "bold" }}>+ INGRESO MANUAL</button>
        </nav>
        <button onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)} style={{ background: "#1e293b", color: "white", padding: "10px", border: "none", borderRadius: "8px", cursor: "pointer" }}>{isAdmin ? "Salir Admin" : "Acceso Admin"}</button>
      </aside>

      <main style={{ flex: 1, padding: "30px", overflowY: "auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
          <input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: "10px", width: "300px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
          <div style={{ display: "flex", gap: "5px", background: "white", padding: "5px", borderRadius: "10px" }}>
            {["TODOS", "Refrigerado", "Congelado"].map(t => (
              <button key={t} onClick={() => setTempFilter(t)} style={tempStyle(tempFilter === t)}>{t}</button>
            ))}
          </div>
        </header>

        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          {SECCIONES.map(s => (
            <button key={s} onClick={() => setActiveSection(s)} style={secStyle(activeSection === s)}>{s}</button>
          ))}
        </div>

        <div style={{ background: "white", borderRadius: "15px", overflow: "hidden", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#f8fafc" }}>
              <tr style={{ textAlign: "left" }}><th style={{ padding: "15px" }}>PRODUCTO</th><th>LOTE</th><th>VENCE</th><th>TEMP</th><th>ACCIÓN</th></tr>
            </thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "15px" }}><strong>{i.nombre}</strong></td>
                  <td>{i.lot}</td>
                  <td style={{ color: "#ef4444", fontWeight: "bold" }}>{i.expiration}</td>
                  <td><small>{i.temperatura === 'Refrigerado' ? "❄️ REF" : "🧊 CONG"}</small></td>
                  <td><button onClick={() => fetch(`${API_URL}/inventario/${i.id}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({usuario:"TEC"})}).then(fetchAll)} style={{ color: "#ef4444", border: "none", background: "none", cursor: "pointer" }}><Trash2 size={18}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* MODAL REGISTRO */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ background: "white", padding: "30px", borderRadius: "20px", width: "400px" }}>
            <h3>{isManual ? "Registro Manual" : "Nuevo Producto"}</h3>
            <input placeholder="GTIN / Código" value={form.gtin} onChange={e => setForm({...form, gtin: e.target.value})} style={inStyle}/>
            <input placeholder="Lote" onChange={e => setForm({...form, lot: e.target.value})} style={inStyle}/>
            <input placeholder="Vence (AAMMDD)" onChange={e => setForm({...form, exp: e.target.value})} style={inStyle}/>
            <select onChange={e => setForm({...form, section: e.target.value})} style={inStyle}>
              {SECCIONES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select onChange={e => setForm({...form, temp: e.target.value})} style={inStyle}>
              <option value="Refrigerado">Refrigerado</option>
              <option value="Congelado">Congelado</option>
            </select>
            <input placeholder="Nombre" onChange={e => setForm({...form, name: e.target.value})} style={inStyle}/>
            <button onClick={saveProduct} style={{ width: "100%", padding: "12px", background: "#0f172a", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold" }}>GUARDAR</button>
            <button onClick={() => setShowModal(false)} style={{ width: "100%", background: "none", border: "none", marginTop: "10px", color: "#64748b" }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* MODAL ADMIN */}
      {showAdminLogin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ background: "white", padding: "30px", borderRadius: "20px", textAlign: "center" }}>
            <ShieldLock size={40} style={{ marginBottom: "10px" }}/>
            <input type="password" placeholder="Contraseña Admin" value={passInput} onChange={e => setPassInput(e.target.value)} style={inStyle}/>
            <button onClick={() => { if(passInput === "LAB_ADMIN_2024") { setIsAdmin(true); setShowAdminLogin(false); setPassInput(""); } else alert("Error"); }} style={{ width: "100%", padding: "10px", background: "#0f172a", color: "white", border: "none", borderRadius: "8px" }}>Ingresar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = (a: boolean) => ({ width: "100%", padding: "12px", borderRadius: "10px", border: "none", background: a ? "#38bdf8" : "transparent", color: a ? "#0f172a" : "#94a3b8", textAlign: "left" as const, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px" });
const secStyle = (a: boolean) => ({ padding: "10px 20px", borderRadius: "10px", border: "none", background: a ? "#0f172a" : "white", color: a ? "white" : "#64748b", cursor: "pointer", fontWeight: "bold" });
const tempStyle = (a: boolean) => ({ padding: "5px 10px", border: "none", borderRadius: "8px", background: a ? "#0f172a" : "transparent", color: a ? "white" : "#64748b", fontSize: "11px", cursor: "pointer" });
const inStyle = { width: "94%", padding: "10px", marginBottom: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" };
