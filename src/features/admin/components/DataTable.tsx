import { useState, useMemo, type ReactNode } from "react";
import { Search, ChevronUp, ChevronDown, Download, X } from "lucide-react";
import type { ThemeTokens } from "../adminTheme";
import { SkeletonGrid } from "./Skeleton";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: string;
  label: string;
  width?: number | string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  searchable?: boolean;
  accessor?: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  mono?: boolean;
}

export interface DataTableProps<T> {
  tokens: ThemeTokens;
  rows: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  toolbar?: ReactNode;
  selectable?: boolean;
  bulkActions?: (selected: T[]) => ReactNode;
  exportFilename?: string;
}

export function DataTable<T>({
  tokens, rows, columns, loading, emptyTitle = "Sin resultados", emptyHint,
  searchPlaceholder = "Buscar…", pageSize = 25, rowKey, onRowClick,
  toolbar, selectable, bulkActions, exportFilename,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter(r => columns.some(c => {
      if (c.searchable === false) return false;
      const val = c.accessor ? c.accessor(r) : (r as any)[c.key];
      return String(val ?? "").toLowerCase().includes(q);
    }));
  }, [rows, query, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find(c => c.key === sortKey);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const av = col.accessor ? col.accessor(a) : (a as any)[sortKey] ?? "";
      const bv = col.accessor ? col.accessor(b) : (b as any)[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleSelect = (id: string) => {
    setSelected(s => { const ns = new Set(s); if (ns.has(id)) ns.delete(id); else ns.add(id); return ns; });
  };
  const toggleSelectAll = () => {
    if (selected.size === pageRows.length) setSelected(new Set());
    else setSelected(new Set(pageRows.map(rowKey)));
  };

  const exportCSV = () => {
    const headers = columns.map(c => c.label);
    const data = sorted.map(r => columns.map(c => {
      const v = c.accessor ? c.accessor(r) : (r as any)[c.key];
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }));
    const csv = [headers.join(","), ...data.map(r => r.join(","))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${exportFilename || "export"}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const selectedRows = pageRows.filter(r => selected.has(rowKey(r)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: tokens.text3 }} />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(0); }}
            placeholder={searchPlaceholder}
            style={{
              width: "100%", padding: "9px 36px 9px 36px",
              background: tokens.bgElev, border: `1px solid ${tokens.border}`,
              borderRadius: 8, color: tokens.text, fontSize: 13, outline: "none",
              boxSizing: "border-box",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              border: "none", background: "transparent", color: tokens.text3, cursor: "pointer",
              padding: 4, display: "flex",
            }}><X size={14} /></button>
          )}
        </div>
        {toolbar}
        {exportFilename && (
          <button onClick={exportCSV} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
            background: tokens.bgElev, color: tokens.text2,
            border: `1px solid ${tokens.border}`, borderRadius: 8,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}><Download size={13}/> Export CSV</button>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectable && selected.size > 0 && bulkActions && (
        <div style={{
          padding: "10px 14px", background: tokens.accentSoft,
          border: `1px solid ${tokens.accent}40`, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: tokens.accent, fontWeight: 600, fontSize: 13 }}>
            {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>{bulkActions(selectedRows)}</div>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: tokens.bgElev, border: `1px solid ${tokens.border}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        {loading ? (
          <div style={{ padding: 24 }}><SkeletonGrid tokens={tokens} rows={6} cols={columns.length} /></div>
        ) : pageRows.length === 0 ? (
          <div style={{ padding: 24 }}>
            <EmptyState tokens={tokens} title={query ? `Sin resultados para "${query}"` : emptyTitle} hint={emptyHint} />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: tokens.bgElev2 }}>
                  {selectable && (
                    <th style={{ padding: "10px 12px", width: 32 }}>
                      <input
                        type="checkbox"
                        checked={pageRows.length > 0 && selected.size === pageRows.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  {columns.map(c => (
                    <th key={c.key}
                      onClick={c.sortable !== false ? () => handleSort(c.key) : undefined}
                      style={{
                        padding: "10px 12px", textAlign: c.align || "left",
                        color: tokens.text2, fontSize: 11, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: 0.4,
                        cursor: c.sortable !== false ? "pointer" : "default",
                        whiteSpace: "nowrap", userSelect: "none",
                        width: c.width,
                      }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {c.label}
                        {sortKey === c.key && (sortDir === "asc" ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => {
                  const id = rowKey(row);
                  const isSel = selected.has(id);
                  return (
                    <tr key={id}
                      onClick={() => onRowClick?.(row)}
                      style={{
                        borderTop: `1px solid ${tokens.border}`,
                        cursor: onRowClick ? "pointer" : "default",
                        background: isSel ? tokens.accentSoft : "transparent",
                        transition: "background 100ms",
                      }}
                      onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLTableRowElement).style.background = tokens.bgHover; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isSel ? tokens.accentSoft : "transparent"; }}
                    >
                      {selectable && (
                        <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isSel} onChange={() => toggleSelect(id)} />
                        </td>
                      )}
                      {columns.map(c => {
                        const val = c.accessor ? c.accessor(row) : (row as any)[c.key];
                        return (
                          <td key={c.key} style={{
                            padding: "10px 12px", textAlign: c.align || "left",
                            color: tokens.text,
                            fontFamily: c.mono ? 'ui-monospace, "SF Mono", monospace' : undefined,
                            verticalAlign: "middle",
                          }}>{c.render ? c.render(row) : (val ?? "—")}</td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {sorted.length > pageSize && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          color: tokens.text2, fontSize: 12,
        }}>
          <span>
            Mostrando {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} de {sorted.length}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={pageBtn(tokens, page === 0)}
            >Anterior</button>
            <span style={{ padding: "6px 12px", color: tokens.text2 }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={pageBtn(tokens, page >= totalPages - 1)}
            >Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}

function pageBtn(tokens: ThemeTokens, disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    background: tokens.bgElev,
    color: disabled ? tokens.text3 : tokens.text,
    border: `1px solid ${tokens.border}`,
    borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
