"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export default function CargaConsumoPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [consumption, setConsumption] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/public/consumo")
      .then((r) => r.json())
      .then((data) => {
        setWarehouses(data.warehouses ?? []);
        if (data.warehouses?.[0]) setWarehouseId(data.warehouses[0].id);
      });
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/public/consumo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId, consumption: Number(consumption) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo cargar el consumo.");
        return;
      }
      setResult(data);
      setConsumption("");
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#1a1a1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.4rem" }}>
          Carga de consumo
        </h1>
        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1.75rem" }}>
          Registra el consumo de la bodega. Se cobra a ${(300).toLocaleString("es-CL")} por unidad.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              Bodega
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.7rem 0.8rem",
                border: "1px solid #d4d4d4",
                borderRadius: 10,
                fontSize: "0.95rem",
                background: "#fff",
              }}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              Consumo
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={consumption}
              onChange={(e) => setConsumption(e.target.value)}
              required
              placeholder="0"
              style={{
                width: "100%",
                padding: "0.7rem 0.8rem",
                border: "1px solid #d4d4d4",
                borderRadius: 10,
                fontSize: "0.95rem",
              }}
            />
          </div>

          {error && (
            <p style={{ color: "#c0392b", fontSize: "0.85rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <AlertTriangle size={16} />
              {error}
            </p>
          )}
          {result && (
            <p style={{ color: "#1e8e3e", fontSize: "0.85rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <CheckCircle2 size={16} />
              Cargado a {result.warehouseCode}: ${result.amount.toLocaleString("es-CL")}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !warehouseId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.8rem",
              borderRadius: 10,
              border: "none",
              background: "#1a1a1a",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Cargar
          </button>
        </form>
      </div>
    </main>
  );
}
