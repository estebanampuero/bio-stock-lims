import React, { useState, useEffect, useRef } from "react";
import { Shield, LayoutDashboard, Trash2, Users, Activity, History, LogOut, UserPlus, ClipboardList, ScanLine } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { parseGS1 } from "../utils/gs1Parser";

const API_URL = `http://${window.location.hostname}:3000/api`;

const formatExp = (exp: string) => {
  if (!exp || exp.length !== 6) return exp;
  return `${exp.substring(4, 6)}-${exp.substring(2, 4)}-${exp.substring(0, 2)}`;
};

const glassStyle = {
  background: "rgba(255, 255, 255, 0.7)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.4)",
  borderRadius: "16px",
  boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.07)"
};

export default function InventoryApp() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [secciones, setSecciones] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [view, setView] = useState("Dashboard");
  const [activeSection, setActiveSection] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [showLogin, setShowLogin] = useState(true);
  const [usernameInput, setUsernameInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ gtin: "", lot: "", exp: "", name: "", detail: "", section: "", pack: "", temp: "Refrigerado" });
  const [newUser, setNewUser] = useState({ nombre: "", rol: "TECNICO", pin: "" });
  const [laserActive, setLaserActive] = useState(false);

  const fetchData = async () => {
    if (!currentUser) return;
    try {
      const [inv, cfg, lg] = await Promise.all([ fetch(`${API_URL}/inventario`), fetch(`${API_URL}/config`), fetch(`${API_URL}/logs`) ]);
      if (inv.ok) setInventory(await inv.json());
      if (cfg.ok) {
        const data = await cfg.json();
        setSecciones(data.secciones);
        setUsuarios(data.usuarios);
        if(!activeSection && data.secciones.length > 0) setActiveSection(data.secciones[0].nombre);
      }
      if (lg.ok) setLogs(await lg.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchData();
    const int = setInterval(fetchData, 3000); // Rápida actualización para ver las multicajas
    return () => clearInterval(int);
  }, [currentUser]);

  // MOTOR LÁSER INTELIGENTE
  const barcodeBuffer = useRef("");
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentUser || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      
      setLaserActive(true);
      setTimeout(() => setLaserActive(false), 500);

      if (e.key === "Enter") {
        if (barcodeBuffer.current.length > 5) procesarEscaneo(barcodeBuffer.current);
        barcodeBuffer.current = "";
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentUser, activeSection]);

  const procesarEscaneo = async (code: string) => {
    let p = parseGS1(code) || { gtin: code, lot: "S/L", expiration: "999999" };
    const res = await fetch(`${API_URL}/producto/${p.gtin}`);
    const existe = await res.json();
    
    if (existe) {
      // SI YA EXISTE: Simplemente suma otra caja (sin abrir el modal manual)
      registrarEnDB(p);
      setActiveSection(existe.seccion);
    } else {
      // SI ES NUEVO: Limpiamos por completo la memoria de las variables manuales 
      // (Name, Detail, Section) para que el operario las llene desde cero.
      setForm({ gtin: p.gtin, lot: p.lot, exp: p.expiration, name: "", detail: "", section: "", pack: "", temp: "Refrigerado" });
      setShowModal(true);
    }
  };

  const registrarEnDB = async (p: any) => {
    await fetch(`${API_URL}/inventario`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...p, scanDate: new Date().toISOString(), usuario: currentUser.nombre }) });
    fetchData(); // Refresca inmediato para que el gráfico suba
  };

  const handleLogin = async () => {
    if(!usernameInput || !pinInput) return alert("Ingrese Usuario y Clave");
    const res = await fetch(`${API_URL}/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: usernameInput, pin: pinInput })
    });
    const data = await res.json();
    if (data.success) {
      setCurrentUser(data.user);
      setShowLogin(false);
      setPinInput("");
    } else alert("❌ Usuario o Clave incorrectos");
  };

  const crearUsuario = async () => {
    if(!newUser.nombre || !newUser.pin) return alert("Datos incompletos");
    await fetch(`${API_URL}/usuarios`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newUser, adminUser: currentUser.nombre }) });
    setNewUser({ nombre: "", rol: "TECNICO", pin: "" });
    fetchData();
  };

  const filtered = inventory.filter(i => i.seccion === activeSection && (i.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || i.lot?.includes(searchTerm)));
  
  // SISTEMA DE SUB-VIÑETAS (Agrupación Master-Detail)
  const grouped = filtered.reduce((acc, i) => {
    const k = i.nombre || "Sin Nombre";
    if(!acc[k]) acc[k] = { name: k, total: 0, items: [], detail: i.detalle };
    acc[k].total++;
    acc[k].items.push(i);
    return acc;
  }, {});
  const chartData = Object.values(grouped).map((g: any) => ({ name: g.name, stock: g.total }));

  // MURO DE SEGURIDAD (GLASSMORPHISM)
  if (showLogin) {
    return (
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)", display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "'Inter', sans-serif", margin: 0, padding: 0 }}>
        <div style={{ ...glassStyle, padding: "50px", width: "350px", textAlign: "center", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ background: "rgba(56, 189, 248, 0.2)", width: "70px", height: "70px", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", margin: "0 auto 25px", border: "1px solid rgba(56,189,248,0.5)" }}>
            <Shield color="#38bdf8" size={35} />
          </div>
          <h2 style={{ margin: "0 0 5px", color: "white", fontSize: "24px", letterSpacing: "1px" }}>BIO-STOCK <span style={{fontWeight: 300}}>PRO</span></h2>
          <p style={{ fontSize: "13px", color: "#cbd5e1", marginBottom: "30px" }}>Acceso Restringido - Nivel Clínico</p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <input placeholder="Usuario" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} style={{ padding: "14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "white", textAlign: "center", fontSize: "16px", outline: "none" }} />
            <input type="password" placeholder="PIN" value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ padding: "14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "white", textAlign: "center", fontSize: "16px", letterSpacing: "5px", outline: "none" }} />
            <button onClick={handleLogin} style={{ width: "100%", padding: "15px", background: "#38bdf8", color: "#0f172a", border: "none", borderRadius: "10px", fontWeight: "900", cursor: "pointer", marginTop: "15px", transition: "transform 0.2s" }}>
              AUTENTICAR
            </button>
          </div>
        </div>
      </div>
    );
  }

  // APLICACIÓN PRINCIPAL (GLASSMORPHISM UX)
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh", display: "flex", background: "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)", fontFamily: "'Inter', sans-serif", overflow: "hidden", margin: 0, padding: 0 }}>
      
      {/* SIDEBAR GLASS */}
      <aside style={{ ...glassStyle, width: "280px", margin: "15px", padding: "25px", display: "flex", flexDirection: "column", boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.8)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#005a9c", marginBottom: "30px" }}>
          <Activity size={28} /> <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>BIO-STOCK</h2>
        </div>

        {/* PANEL LÁSER INTELIGENTE */}
        <div style={{ background: "rgba(255,255,255,0.5)", padding: "15px", borderRadius: "12px", borderLeft: "5px solid #10b981", marginBottom: "25px", boxShadow: "0 4px 15px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: laserActive ? "#00e676" : "#10b981", boxShadow: laserActive ? "0 0 15px #00e676" : "0 0 5px #10b981", transition: "all 0.2s" }}></div>
            <h3 style={{ margin: 0, fontSize: "14px", color: "#0f172a", fontWeight: 700 }}>Láser Inteligente</h3>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "#64748b", lineHeight: "1.4" }}>
            Escáner activo y enlazado. <br/><i>(Escanea misma caja para añadir stock)</i>
          </p>
        </div>
        
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
          <button onClick={() => setView("Dashboard")} style={navBtnStyle(view === "Dashboard")}><LayoutDashboard size={18}/> Inventario Real</button>
          {currentUser.rol === "ADMIN" && (
            <>
              <button onClick={() => setView("Usuarios")} style={navBtnStyle(view === "Usuarios")}><Users size={18}/> Personal Admin</button>
              <button onClick={() => setView("Logs")} style={navBtnStyle(view === "Logs")}><History size={18}/> Auditoría (Logs)</button>
            </>
          )}
          <button onClick={() => { 
            // Limpieza manual también en el botón
            setForm({ gtin: "", lot: "", exp: "", name: "", detail: "", section: "", pack: "", temp: "Refrigerado" }); 
            setShowModal(true); 
          }} style={{ padding: "14px", background: "#005a9c", color: "white", border: "none", borderRadius: "12px", marginTop: "15px", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: "0 4px 15px rgba(0,90,156,0.3)" }}>
            <ScanLine size={18}/> Ingreso Manual
          </button>
        </nav>

        <div style={{ marginTop: "auto", background: "rgba(0,0,0,0.03)", padding: "15px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.5)" }}>
          <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "5px", fontWeight: 700 }}>FIRMA ACTIVA</div>
          <div style={{ fontWeight: 800, marginBottom: "12px", color: "#0f172a" }}>{currentUser.nombre} ({currentUser.rol})</div>
          <button onClick={() => { setCurrentUser(null); setShowLogin(true); setUsernameInput(""); setPinInput(""); }} style={{ width: "100%", padding: "10px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
            <LogOut size={14}/> CERRAR SESIÓN
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: "auto", padding: "15px 30px 30px 15px", boxSizing: "border-box" }}>
        {view === "Dashboard" && (
          <>
            {/* SISTEMA DE VIÑETAS (TABS SUPERIORES) */}
            <header style={{ display: "flex", justifyContent: "space-between", marginBottom: "25px", alignItems: "center", background: "rgba(255,255,255,0.5)", padding: "15px", borderRadius: "16px", backdropFilter: "blur(10px)" }}>
              <div style={{ display: "flex", gap: "10px", overflowX: "auto" }}>
                {secciones.map((s:any) => (
                  <button key={s.nombre} onClick={() => setActiveSection(s.nombre)} style={secBtnStyle(activeSection === s.nombre)}>{s.nombre}</button>
                ))}
              </div>
              <input placeholder="🔍 Buscar reactivo o lote..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding: "12px 20px", width: "280px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.7)", outline: "none", fontWeight: 600 }} />
            </header>

            {chartData.length > 0 && (
              <div style={{ ...glassStyle, padding: "25px", marginBottom: "25px", height: "220px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="name" tick={{fontSize: 11, fill: "#64748b", fontWeight: 600}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 11, fill: "#64748b"}} allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: 'rgba(0,0,0,0.02)'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}} />
                    <Bar dataKey="stock" fill="#005a9c" radius={[6, 6, 0, 0]} barSize={45} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* SISTEMA DE SUB-VIÑETAS (TARJETAS AGRUPADAS POR REACTIVO) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {Object.values(grouped).map((g: any) => (
                <div key={g.name} style={{ ...glassStyle, overflow: "hidden" }}>
                  <div style={{ background: "rgba(255,255,255,0.4)", padding: "15px 25px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <div><strong style={{color:"#005a9c", fontSize: "16px", fontWeight: 800}}>{g.name}</strong> <small style={{color: "#64748b", marginLeft: "10px", fontWeight: 600}}>{g.detail}</small></div>
                    <div style={{ background: "#005a9c", color: "white", padding: "6px 16px", borderRadius: "20px", fontWeight: 800, fontSize: "13px", boxShadow: "0 4px 10px rgba(0,90,156,0.3)" }}>Total Stock: {g.total}</div>
                  </div>
                  <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
                    <tbody>
                      {g.items.map((i: any) => (
                        <tr key={i.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.03)", transition: "background 0.2s" }}>
                          <td style={{ padding: "15px 25px", color: "#1e293b", fontFamily: "'Roboto Mono', monospace", fontWeight: 600 }}>Lote: {i.lot}</td>
                          <td style={{ color: "#1e293b", fontWeight: 700 }}>Vence: {formatExp(i.expiration)}</td>
                          <td><span style={{ fontSize: "11px", background: "rgba(0,0,0,0.04)", padding: "4px 8px", borderRadius: "6px", color: "#64748b", fontWeight: 600 }}>Registro: {i.usuario}</span></td>
                          <td style={{ textAlign: "right", paddingRight: "25px" }}>
                            <button onClick={() => { if(confirm("¿Confirmar consumo de caja?")) fetch(`${API_URL}/inventario/${i.id}`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({usuario: currentUser.nombre})}).then(fetchData) }} style={{ color: "#ef4444", border: "none", background: "rgba(239,68,68,0.1)", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 800, fontSize: "12px", transition: "all 0.2s" }}>BAJA</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </>
        )}

        {view === "Usuarios" && (
          <div style={{ maxWidth: "900px" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "10px", color: "#005a9c", fontWeight: 800 }}><UserPlus/> Configuración de Personal</h2>
            <div style={{ ...glassStyle, padding: "30px", marginBottom: "25px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 140px", gap: "15px" }}>
                <input placeholder="Usuario (Ej: juan.perez)" value={newUser.nombre} onChange={e => setNewUser({...newUser, nombre: e.target.value})} style={inStyle} />
                <select value={newUser.rol} onChange={e => setNewUser({...newUser, rol: e.target.value})} style={inStyle}>
                  <option value="TECNICO">Técnico de Laboratorio</option><option value="ADMIN">Administrador</option>
                </select>
                <input placeholder="PIN Numérico" value={newUser.pin} onChange={e => setNewUser({...newUser, pin: e.target.value})} style={inStyle} />
                <button onClick={crearUsuario} style={{ background: "#005a9c", color: "white", border: "none", borderRadius: "10px", fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 15px rgba(0,90,156,0.3)" }}>CREAR ACCESO</button>
              </div>
            </div>
            <div style={{ ...glassStyle, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "rgba(0,0,0,0.03)" }}>
                  <tr style={{ textAlign: "left", color: "#64748b", fontSize: "13px" }}><th style={{ padding: "20px" }}>IDENTIFICADOR</th><th>NIVEL DE ACCESO</th><th>GESTIÓN</th></tr>
                </thead>
                <tbody>
                  {usuarios.map((u: any) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
                      <td style={{ padding: "20px", fontWeight: 800, color: "#1e293b" }}>{u.nombre}</td>
                      <td><span style={{ fontSize: "11px", fontWeight: 800, background: u.rol === 'ADMIN' ? "rgba(16,185,129,0.15)" : "rgba(0,90,156,0.1)", color: u.rol === 'ADMIN' ? "#059669" : "#005a9c", padding: "6px 12px", borderRadius: "8px" }}>{u.rol}</span></td>
                      <td>
                        {u.nombre !== currentUser.nombre && (
                          <button onClick={() => { if(confirm("¿Revocar acceso al usuario?")) fetch(`${API_URL}/usuarios/${u.id}`, {method: "DELETE", headers: {"Content-Type": "application/json"}, body: JSON.stringify({adminUser: currentUser.nombre})}).then(fetchData) }} style={{ color: "#ef4444", border: "none", background: "none", cursor: "pointer", fontWeight: 800, fontSize: "12px" }}>REVOCAR</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === "Logs" && (
          <div>
            <h2 style={{ display: "flex", alignItems: "center", gap: "10px", color: "#005a9c", fontWeight: 800 }}><ClipboardList/> Registro Forense de Auditoría</h2>
            <div style={{ ...glassStyle, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead style={{ background: "rgba(0,0,0,0.03)" }}>
                  <tr style={{ textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "20px" }}>MARCA DE TIEMPO</th><th>USUARIO / FIRMA</th><th>TIPO DE EVENTO</th><th>DETALLES DEL SISTEMA</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l: any) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
                      <td style={{ padding: "16px 20px", color: "#64748b", fontWeight: 600 }}>{new Date(l.fecha).toLocaleString()}</td>
                      <td style={{ fontWeight: 800, color: "#1e293b" }}>{l.usuario}</td>
                      <td><span style={{ fontSize: "11px", fontWeight: 800, padding: "5px 10px", borderRadius: "8px", background: l.accion.includes("BAJA") ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", color: l.accion.includes("BAJA") ? "#ef4444" : "#10b981" }}>{l.accion}</span></td>
                      <td style={{ color: "#475569", fontWeight: 500 }}>{l.detalles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL CONFIGURACIÓN MAESTRA (CAMPOS LIMPIOS) */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(10px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 3000 }}>
          <div style={{ ...glassStyle, background: "rgba(255,255,255,0.9)", padding: "40px", width: "450px" }}>
            <h3 style={{ marginTop: 0, color: "#005a9c", fontSize: "22px", fontWeight: 800 }}>Configuración de Reactivo</h3>
            <div style={{ display: "grid", gap: "15px", marginTop: "20px" }}>
              <input placeholder="Código de Barras / GTIN" value={form.gtin} readOnly={!!form.gtin} onChange={e => setForm({...form, gtin: e.target.value})} style={{ ...inStyle, background: form.gtin ? "rgba(0,0,0,0.03)" : "white", color: "#64748b", fontWeight: 600 }} />
              <div style={{ display: "flex", gap: "10px" }}>
                <input placeholder="Lote" value={form.lot} onChange={e => setForm({...form, lot: e.target.value})} style={inStyle} />
                <input placeholder="Vence (AAMMDD)" value={form.exp} onChange={e => setForm({...form, exp: e.target.value})} style={inStyle} />
              </div>
              <input list="secciones-list" placeholder="Escriba o asigne la Sección" value={form.section} onChange={e => setForm({...form, section: e.target.value})} style={inStyle} />
              <datalist id="secciones-list">
                {secciones.map((s:any) => <option key={s.nombre} value={s.nombre} />)}
              </datalist>
              <input placeholder="Nombre del Kit (Ej: Liquichek)" value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={inStyle} />
              <input placeholder="Detalle Adicional (Opcional)" value={form.detail} onChange={e => setForm({...form, detail: e.target.value})} style={inStyle} />
              <button onClick={() => {
                if(!form.name || !form.section || !form.gtin || !form.lot) return alert("Faltan datos obligatorios.");
                fetch(`${API_URL}/producto`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...form, usuario: currentUser.nombre}) }).then(() => {
                  registrarEnDB({ gtin: form.gtin, lot: form.lot, expiration: form.exp });
                  setShowModal(false);
                });
              }} style={{ padding: "16px", background: "#005a9c", color: "white", border: "none", borderRadius: "12px", fontWeight: 800, cursor: "pointer", marginTop: "15px", boxShadow: "0 8px 20px rgba(0,90,156,0.3)" }}>GUARDAR Y AÑADIR A STOCK</button>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontWeight: 700, cursor: "pointer" }}>CANCELAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle = (a: boolean) => ({ padding: "14px 18px", borderRadius: "12px", border: "none", background: a ? "#005a9c" : "transparent", color: a ? "white" : "#64748b", textAlign: "left" as const, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: "12px", transition: "all 0.3s ease", boxShadow: a ? "0 4px 15px rgba(0,90,156,0.3)" : "none" });
const secBtnStyle = (a: boolean) => ({ padding: "10px 22px", borderRadius: "12px", border: "none", background: a ? "#005a9c" : "rgba(255,255,255,0.6)", color: a ? "white" : "#475569", cursor: "pointer", fontWeight: 800, fontSize: "13px", whiteSpace: "nowrap", transition: "all 0.3s ease", boxShadow: a ? "0 4px 15px rgba(0,90,156,0.3)" : "none" });
const inStyle = { width: "100%", padding: "14px", borderRadius: "10px", border: "1px solid rgba(0,0,0,0.1)", background: "rgba(255,255,255,0.8)", boxSizing: "border-box" as const, outline: "none", fontWeight: 600, color: "#1e293b" };
