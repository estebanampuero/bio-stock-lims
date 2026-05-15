export function parseDiuresisBarcode(code: string): { peticion: string; rut: string; nombre: string } {
  const clean = code.trim();

  const pipes = clean.split("|");
  if (pipes.length >= 3) {
    return { peticion: pipes[0].trim(), rut: pipes[1].trim(), nombre: pipes[2].trim() };
  }

  const semis = clean.split(";");
  if (semis.length >= 3) {
    return { peticion: semis[0].trim(), rut: semis[1].trim(), nombre: semis[2].trim() };
  }

  // Fallback: código completo como número de petición
  return { peticion: clean, rut: "", nombre: "" };
}
