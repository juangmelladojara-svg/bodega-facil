"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react";
import { isOccupied } from "@/lib/warehouses";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const COLUMNS = [
  { key: "code", label: "Código" },
  { key: "name", label: "Nombre" },
  { key: "gate_id", label: "Patio" },
  { key: "size_m3", label: "m³" },
  { key: "monthly_amount", label: "Mensual" },
  { key: "occupied", label: "Arriendo" },
];

const STATUS_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "occupied", label: "Ocupada" },
  { key: "free", label: "Libre" },
];

function sortValue(warehouse, key) {
  if (key === "occupied") return warehouse.occupied ? 1 : 0;
  const value = warehouse[key];
  if (value == null) return key === "size_m3" ? -Infinity : "";
  return value;
}

export default function BodegasTable({ warehouses }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState("asc");

  const rows = useMemo(
    () =>
      warehouses.map((w) => ({
        ...w,
        occupied: isOccupied(w),
      })),
    [warehouses]
  );

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = rows.filter((w) => {
      if (statusFilter === "occupied" && !w.occupied) return false;
      if (statusFilter === "free" && w.occupied) return false;
      if (!query) return true;
      return (
        w.code?.toLowerCase().includes(query) ||
        w.name?.toLowerCase().includes(query) ||
        String(w.gate_id ?? "").toLowerCase().includes(query)
      );
    });

    filtered = [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      let cmp;
      if (typeof av === "string" || typeof bv === "string") {
        cmp = String(av).localeCompare(String(bv), "es");
      } else {
        cmp = av - bv;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [rows, search, statusFilter, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, nombre o patio..."
            className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                statusFilter === f.key
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              {COLUMNS.map((col) => {
                const isActive = sortKey === col.key;
                const Icon = isActive ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={col.key} className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className={`flex items-center gap-1.5 transition hover:text-text ${
                        isActive ? "text-text" : ""
                      }`}
                    >
                      {col.label}
                      <Icon className={`size-3.5 ${isActive ? "text-accent-2" : "text-text-muted"}`} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((warehouse) => (
              <tr key={warehouse.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-text">
                  <Link href={`/admin/bodegas/${warehouse.id}`} className="hover:text-accent-2 hover:underline">
                    {warehouse.code}
                  </Link>
                </td>
                <td className="px-4 py-3 text-text">{warehouse.name}</td>
                <td className="px-4 py-3 text-text-muted">{warehouse.gate_id}</td>
                <td className="px-4 py-3 text-text-muted">{warehouse.size_m3 ?? "—"}</td>
                <td className="px-4 py-3 text-text-muted">{clp.format(warehouse.monthly_amount)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      warehouse.occupied
                        ? "bg-accent-2/15 text-accent-2"
                        : "bg-emerald-500/15 text-emerald-600"
                    }`}
                  >
                    {warehouse.occupied ? "Ocupada" : "Libre"}
                  </span>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  {warehouses.length === 0
                    ? "No hay bodegas registradas todavía."
                    : "Ninguna bodega coincide con el filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
