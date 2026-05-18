import React from "react";

export function SectionHead({ title, icon, action }: { title: string; icon: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px", flexWrap:"wrap", gap:"12px" }}>
      <h2 style={{ display:"flex", alignItems:"center", gap:"10px", color:"#005a9c", fontWeight:800, margin:0, fontSize:"20px" }}>
        {icon}{title}
      </h2>
      {action}
    </div>
  );
}

export function FErr({ msg }: { msg: string | null }) {
  return msg ? <div style={{ color:"#dc2626", fontSize:"11px", fontWeight:600, marginTop:"3px" }}>⚠ {msg}</div> : null;
}
