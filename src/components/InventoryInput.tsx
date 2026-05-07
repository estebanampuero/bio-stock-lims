import { useState, useEffect, useRef } from "react";
import { parseGS1 } from "../utils/gs1Parser";

export default function InventoryInput() {
  const [inventory, setInventory] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeSection, setActiveSection] = useState("Alertas");
  const [activeSubTab, setActiveSubTab] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);
  
  // Estados para datos de producto y stock
  const [tempProduct, setTempProduct] = useState(null);
  const [newName, setNewName] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newPack, setNewPack] = useState("");
  const [newSeccion, setNewSeccion] = useState("");
  
  // Campos específicos de la caja
  const [manualLot, setManualLot] = useState("");
  const [manualExp, setManualExp] = useState("");
  const [manualGtin, setManualGtin] = useState("");

  const API_URL = `http://${window.location.hostname}:3000/api`;

  const cargarDatos = () => {
    fetch(`${API_URL}/inventario`).then(res => res.json()).then(setInventory).catch(console.error);
    fetch(`${API_URL}/historial`).then(res => res.json()).then(setHistory).catch(console.error);
  };

  useEffect(() => {
    cargarDatos();
    const interval = setInterval(cargarDatos, 4000);
    return () => clearInterval(interval);
  }, []);

  const abrirIngresoManual = () => {
    setTempProduct(null);
    setIsManualEntry(true);
    setManualGtin(""); setManualLot(""); setManualExp("");
    setNewName(""); setNewDetail(""); setNewPack(""); setNewSeccion("");
    setShowModal(true);
  };

  const procesarEscaneo = async (codigo) => {
    const p = parseGS1(codigo);
    if (!p) return alert("❌ Código GS1 no reconocido.");
    
    const res = await fetch(`${API_URL}/producto/${p.gtin}`);
    const existe = await res.json();

    if (existe) {
      registrarEntrada(p);
      setActiveSection(existe.seccion);
      setActiveSubTab(existe.nombre);
    } else {
      setTempProduct(p);
      setIsManualEntry(false);
      setManualLot(p.lot);
      setManualExp(p.expiration);
      setShowModal(true);
    }
  };

  const registrarEntrada = (p) => {
    const item = { ...p, id: Math.random().toString(36).substr(2,9), scanDate: new Date().toISOString() };
    fetch(`${API_URL}/inventario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item)
    }).then(async r => {
      if(r.status === 409) alert("🚫 Error: Esta caja con este lote ya está en stock.");
      cargarDatos();
    });
  };

  const guardarMaestroYStock = () => {
    const gtinUsar = tempProduct ? tempProduct.gtin : (manualGtin || `MAN-${Math.random().toString(36).substr(2,5)}`);
    const dataProducto = { gtin: gtinUsar, nombre: newName, detalle: newDetail, pack: newPack, seccion: newSeccion };

    fetch(`${API_URL}/producto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataProducto)
    }).then(() => {
      registrarEntrada({ gtin: gtinUsar, lot: manualLot, expiration: manualExp });
      setShowModal(false);
    });
  };

  // Agrupación Jerárquica
  const secciones = ["Alertas", "Historial", ...new Set(inventory.map(i => i.seccion).filter(s => s))];
  const subTabs = activeSection !== "Alertas" && activeSection !== "Historial" 
    ? [...new Set(inventory.filter(i => i.seccion === activeSection).map(i => i.nombre))] 
    : [];

  const itemsFiltrados = activeSection === "Alertas" 
    ? inventory.filter(i => {
        const y = 2000+parseInt(i.expiration.substr(0,2)), m = parseInt(i.expiration.substr(2,2))-1, d = parseInt(i.expiration.substr(4,2));
        return (new Date(y,m,d).getTime() - new Date().getTime()) < (60 * 86400000);
      })
    : activeSection === "Historial" ? history 
    : inventory.filter(i => i.seccion === activeSection && i.nombre === activeSubTab);

  const barcodeBuffer = useRef("");
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Enter") {
        if (barcodeBuffer.current.length > 10) procesarEscaneo(barcodeBuffer.current);
        barcodeBuffer.current = "";
      } else if (e.key.length === 1) barcodeBuffer.current += e.key;
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div style={{ background: "linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%)", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <header style={{ background: "rgba(0, 90, 156, 0.9)", color: "white", padding: "20px 40px", backdropFilter: "blur(10px)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>BIO-STOCK <span style={{fontWeight: 200}}>MASTER CONTROL</span></h1>
        <button onClick={abrirIngresoManual} style={{ background: "#28a745", color: "white", border: "none", padding: "12px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", boxShadow: "0 4px 15px rgba(40,167,69,0.3)" }}>
          + NUEVO INGRESO MANUAL
        </button>
      </header>

      <div style={{ maxWidth: "1400px", margin: "30px auto", padding: "0 20px" }}>
        {/* Nivel 1: SECCIONES */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", overflowX: "auto", paddingBottom: "10px" }}>
          {secciones.map(sec => (
            <button key={sec} onClick={() => { setActiveSection(sec); setActiveSubTab(""); }} style={{
              padding: "12px 25px", borderRadius: "12px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "13px",
              background: activeSection === sec ? "#005a9c" : "rgba(255,255,255,0.6)", color: activeSection === sec ? "white" : "#486581",
              boxShadow: activeSection === sec ? "0 4px 12px rgba(0,90,156,0.2)" : "none", transition: "all 0.2s"
            }}>{sec.toUpperCase()}</button>
          ))}
        </div>

        {/* Nivel 2: PRODUCTOS */}
        {subTabs.length > 0 && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", padding: "10px", background: "rgba(255,255,255,0.3)", borderRadius: "15px", backdropFilter: "blur(5px)" }}>
            {subTabs.map(sub => (
              <button key={sub} onClick={() => setActiveSubTab(sub)} style={{
                padding: "8px 18px", borderRadius: "20px", border: "1px solid #005a9c", cursor: "pointer", fontSize: "12px", fontWeight: 600,
                background: activeSubTab === sub ? "#005a9c" : "white", color: activeSubTab === sub ? "white" : "#005a9c"
              }}>{sub}</button>
            ))}
          </div>
        )}

        {/* TABLA PRINCIPAL GLASSMORPHISM */}
        <div style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.4)", boxShadow: "0 8px 32px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#627d98", fontSize: "12px", background: "rgba(0,0,0,0.02)" }}>
                <th style={{ padding: "20px" }}>PRODUCTO</th>
                <th>LOTE</th>
                <th>VENCIMIENTO (AAMMDD)</th>
                <th>ESTADO</th>
                {activeSection !== "Historial" && <th>ACCIÓN</th>}
              </tr>
            </thead>
            <tbody>
              {itemsFiltrados.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <td style={{ padding: "20px" }}>
                    <div style={{ fontWeight: 800, color: "#102a43" }}>{item.nombre}</div>
                    <div style={{ fontSize: "11px", color: "#627d98" }}>{item.detalle} • {item.pack}</div>
                  </td>
                  <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{item.lot}</td>
                  <td style={{ fontWeight: 600 }}>{item.expiration}</td>
                  <td>
                    {activeSection === "Historial" ? <span style={{fontSize:"11px", color:"#829ab1"}}>BAJA: {new Date(item.fecha_baja).toLocaleDateString()}</span> : 
                    <span style={{ background: "rgba(0,230,118,0.1)", color: "#00c853", padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold" }}>EN STOCK</span>}
                  </td>
                  <td>
                    {activeSection !== "Historial" && <button onClick={() => { if(confirm("¿Retirar reactivo?")) fetch(`${API_URL}/inventario/${item.id}`, {method:"PATCH"}).then(cargarDatos) }} style={{ border: "none", background: "none", color: "#ef4444", fontWeight: 800, cursor: "pointer" }}>BAJA</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {itemsFiltrados.length === 0 && <div style={{ padding: "60px", textAlign: "center", color: "#9fb3c8", fontStyle: "italic" }}>Sin registros en esta vista.</div>}
        </div>
      </div>

      {/* MODAL DE REGISTRO COMPLETO (ESCANER Y MANUAL) */}
      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000 }}>
          <div style={{ background: "white", padding: "35px", borderRadius: "25px", width: "450px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h2 style={{ color: "#005a9c", marginTop: 0, fontSize: "22px" }}>{isManualEntry ? "📝 Registro Manual Completo" : "🆕 Nuevo Producto Detectado"}</h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "20px" }}>
              <div style={{ background: "#f0f4f8", padding: "15px", borderRadius: "12px" }}>
                <p style={{ margin: "0 0 10px 0", fontSize: "12px", fontWeight: "bold", color: "#486581" }}>DATOS DE LA CAJA (ESPECÍFICOS):</p>
                {isManualEntry && <input placeholder="GTIN / ID Producto" value={manualGtin} onChange={e => setManualGtin(e.target.value)} style={{ width: "90%", padding: "10px", marginBottom: "10px", borderRadius: "8px", border: "1px solid #d9e2ec" }} />}
                <input placeholder="LOTE" value={manualLot} onChange={e => setManualLot(e.target.value)} style={{ width: "90%", padding: "10px", marginBottom: "10px", borderRadius: "8px", border: "1px solid #d9e2ec" }} />
                <input placeholder="VENCIMIENTO (AAMMDD)" value={manualExp} onChange={e => setManualExp(e.target.value)} style={{ width: "90%", padding: "10px", borderRadius: "8px", border: "1px solid #d9e2ec" }} />
              </div>

              <div style={{ padding: "15px", border: "1px solid #f0f4f8", borderRadius: "12px" }}>
                <p style={{ margin: "0 0 10px 0", fontSize: "12px", fontWeight: "bold", color: "#486581" }}>INFORMACIÓN DEL CATÁLOGO:</p>
                <select value={newSeccion} onChange={e => setNewSeccion(e.target.value)} style={{ width: "97%", padding: "10px", marginBottom: "10px", borderRadius: "8px", border: "1px solid #d9e2ec" }}>
                  <option value="">-- SELECCIONAR SECCIÓN --</option>
                  <option value="Hematología">Hematología</option>
                  <option value="Química Clínica">Química Clínica</option>
                  <option value="Inmunología">Inmunología / Sífilis</option>
                  <option value="Uroanálisis">Uroanálisis</option>
                  <option value="Coagulación">Coagulación</option>
                </select>
                <input placeholder="NOMBRE (Ej: Sífilis RPR)" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: "90%", padding: "10px", marginBottom: "10px", borderRadius: "8px", border: "1px solid #d9e2ec" }} />
                <input placeholder="DETALLE (Ej: Nivel 2)" value={newDetail} onChange={e => setNewDetail(e.target.value)} style={{ width: "90%", padding: "10px", marginBottom: "10px", borderRadius: "8px", border: "1px solid #d9e2ec" }} />
                <input placeholder="PRESENTACIÓN (Ej: 100 Tests)" value={newPack} onChange={e => setNewPack(e.target.value)} style={{ width: "90%", padding: "10px", borderRadius: "8px", border: "1px solid #d9e2ec" }} />
              </div>

              <button onClick={guardarMaestroYStock} style={{ padding: "16px", background: "#005a9c", color: "white", border: "none", borderRadius: "12px", fontWeight: "800", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,90,156,0.3)" }}>
                CONFIRMAR REGISTRO EN STOCK
              </button>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#829ab1", cursor: "pointer", fontSize: "13px" }}>CANCELAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
