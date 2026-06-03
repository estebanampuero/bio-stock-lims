# BIO-STOCK LIMS

Sistema de gestión de inventario clínico para laboratorios hospitalarios.
**On-premise, Windows, sin dependencias cloud.**

## Para personal de IT del hospital

1. Descomprimir `release.zip` en `C:\BioStock\`
2. Doble clic en `Iniciar.bat` (o ejecutar `BioStock-LIMS.exe`)
3. Abrir navegador en `http://localhost:3000`
4. Login inicial: usuario `admin`, PIN `1234` — **se forzará cambio inmediato**
5. Otros PCs de la red: `http://<IP-del-servidor>:3000`

Documentación operacional completa: ver `release/COMO-INSTALAR.txt`.

## Para desarrolladores

Stack: React 19 + TypeScript + Vite + Express 5 + SQLite (WAL) + JWT + bcrypt + AES-256-GCM.

```bash
npm install
npm run dev          # Vite dev server (puerto 1420)
node server.cjs      # API + servir SPA build (puerto 3000)
npm run build        # Compilar SPA → dist/
npm run build:exe    # Empaquetar como Windows .exe → release/
```

Arquitectura, decisiones, deuda técnica y roadmap: ver [`CLAUDE.md`](CLAUDE.md).

## Seguridad

- JWT con TTL 8 horas (`jwt.secret` autogenerado al primer arranque)
- PINs hasheados con bcrypt (cost 10)
- Rate limit en `/api/login`: 10 intentos / 15 min / IP
- RBAC server-side por ruta (ADMIN, TECNOLOGO, TECNICO)
- Audit log inmutable + `pii_access_log` separado
- Forzar cambio de PIN al primer login

**No commitear:** `master.key`, `jwt.secret`, `.env`, `*.db`. Están en `.gitignore`.
