export interface BioRadProduct {
  gtin: string;
  lot: string;
  expiration: string;
}

export function parseGS1(codigo: string): BioRadProduct | null {
  if (!codigo) return null;

  let gtin = "";
  let lot = "";
  let expiration = "";

  // 1. Unificamos separadores invisibles a un carácter de tubería "|"
  let cleanCode = codigo.replace(/[\x1D\x1E\x1F]/g, "|");

  // ==========================================
  // CASO A: EL ESCÁNER USA PARÉNTESIS (01)
  // ==========================================
  if (cleanCode.includes("(01)")) {
    const mGtin = cleanCode.match(/\(01\)(\d{14})/);
    if (mGtin) gtin = mGtin[1];

    const mExp = cleanCode.match(/\(17\)(\d{6})/);
    if (mExp) expiration = mExp[1];

    // Lote con paréntesis busca hasta encontrar otro paréntesis, un pipe, o el fin
    const mLot = cleanCode.match(/\(10\)([^(|)]+)/);
    if (mLot) lot = mLot[1];
  } 
  // ==========================================
  // CASO B: CÓDIGO CRUDO CONTINUO (SIN PARÉNTESIS)
  // ==========================================
  else {
    // 1. Extraer y aislar GTIN
    const mGtin = cleanCode.match(/01(\d{14})/);
    if (mGtin) {
      gtin = mGtin[1];
      // BORRAMOS el GTIN de la cadena temporal para evitar falsos positivos con el "10" o "17"
      cleanCode = cleanCode.replace(mGtin[0], ""); 
    }

    // 2. Extraer y aislar Caducidad
    const mExp = cleanCode.match(/17(\d{6})/);
    if (mExp) {
      expiration = mExp[1];
      // BORRAMOS la caducidad
      cleanCode = cleanCode.replace(mExp[0], "");
    }

    // 3. Extraer Lote (Ahora que la cadena está limpia, cualquier '10' es el Lote real)
    // Busca el 10, y extrae hasta encontrar un pipe "|" o terminar el string
    const mLot = cleanCode.match(/10([A-Za-z0-9\-_]+)(\||$)/);
    if (mLot) {
      lot = mLot[1];
    } else {
      // Plan de respaldo si no hay pipe al final
      const mLotBackup = cleanCode.match(/10([A-Za-z0-9\-_]+)/);
      if (mLotBackup) lot = mLotBackup[1];
    }
  }

  // Limpieza final de espacios por seguridad
  if (gtin) gtin = gtin.trim();
  if (lot) lot = lot.trim();
  if (expiration) expiration = expiration.trim();

  // Filtro Estricto: Solo pasamos si tenemos la Trinidad completa
  if (gtin && lot && expiration) {
    return { gtin, lot, expiration };
  }

  return null; // Si falta algo, manda a Ingreso Manual
}
