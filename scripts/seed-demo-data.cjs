// Seed de datos de demo: 15 bodegas nuevas, 11 arrendatarios, arriendos en
// todos los estados posibles, y ~6 meses de historial de pagos + sync ISAPI.
// Corre contra la base real usando service_role (no toca lo que ya existe).

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const crypto = require("crypto");

fs.readFileSync(".env.local", "utf8").split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── RUT válido (mismo algoritmo que lib/rut.js) ─────────────────────────
function rutCheckDigit(body) {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  return remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
}
function makeRut(bodyNum) {
  const body = String(bodyNum);
  return `${body}-${rutCheckDigit(body)}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n) {
  return daysAgo(-n);
}
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
const iso = (d) => d.toISOString();
const uuid = () => crypto.randomUUID();

const NAMES = [
  "Carla Fuentes Reyes", "Mauricio Soto Vidal", "Javiera Muñoz Contreras", "Patricio Alarcón Bravo",
  "Fernanda Ojeda Rojas", "Cristóbal Vera Toledo", "Daniela Sepúlveda Lagos", "Rodrigo Cáceres Miranda",
  "Valentina Poblete Aravena", "Ignacio Riquelme Gómez", "Camila Torres Escobar",
];

// ── 15 bodegas nuevas (códigos B-101..B-115, sin chocar con B-014 existente) ──
const WAREHOUSES = [
  { code: "B-101", size: 18, gate: 1 },
  { code: "B-102", size: 18, gate: 1 },
  { code: "B-103", size: 20, gate: 1 },
  { code: "B-104", size: 22, gate: 2 },
  { code: "B-105", size: 33, gate: 1 },
  { code: "B-106", size: 40, gate: 2 },
  { code: "B-107", size: 50, gate: 1 },
  { code: "B-108", size: 65, gate: 2 },
  { code: "B-109", size: 100, gate: 1 },
  { code: "B-110", size: 81, gate: 2 },
  { code: "B-111", size: 180, gate: 1 },
  { code: "B-112", size: 250, gate: 2 },
  { code: "B-113", size: 405, gate: 1 },
  { code: "B-114", size: 650, gate: 2 },
  { code: "B-115", size: 36, gate: 1 },
];
const PRICE_BY_SIZE = {
  18: 83300, 20: 83300, 22: 90000, 33: 172550, 36: 178000, 40: 184550,
  50: 220000, 65: 280000, 81: 327500, 100: 380000, 180: 416500, 250: 480000,
  405: 595000, 650: 1071000,
};

// ── Historia de cada arriendo ocupado (4 bodegas quedan libres: B-110/113/114/115) ──
// months: cuántos pagos mensuales tiene, startMonthsAgo: hace cuántos meses partió
const RENTAL_PLANS = [
  { code: "B-101", status: "active", startMonthsAgo: 6, payments: 6, method: "webpay" },
  { code: "B-102", status: "active", startMonthsAgo: 4, payments: 4, method: "mixed" },
  { code: "B-105", status: "active", startMonthsAgo: 5, payments: 5, method: "webpay", dueInDays: 3 }, // próximo a vencer
  { code: "B-106", status: "active", startMonthsAgo: 3, payments: 3, method: "mixed", pendingSync: true },
  { code: "B-108", status: "active", startMonthsAgo: 2, payments: 2, method: "webpay" },
  { code: "B-111", status: "active", startMonthsAgo: 6, payments: 6, method: "webpay" },
  { code: "B-103", status: "overdue", startMonthsAgo: 5, payments: 4, method: "webpay", overdueDays: 45 },
  { code: "B-107", status: "overdue", startMonthsAgo: 4, payments: 3, method: "manual", overdueDays: 10 },
  { code: "B-112", status: "overdue", startMonthsAgo: 6, payments: 5, method: "mixed", overdueDays: 20 },
  { code: "B-104", status: "suspended", startMonthsAgo: 4, payments: 3, method: "manual" },
  { code: "B-109", status: "inactive", startMonthsAgo: 0, payments: 0, method: "webpay" },
];

async function main() {
  console.log("1/5 — Insertando 15 bodegas...");
  const warehouseRows = WAREHOUSES.map((w) => ({
    id: uuid(),
    code: w.code,
    name: `Bodega ${w.code.replace("B-", "")} · ${w.size} m³`,
    gate_id: w.gate,
    size_m3: w.size,
    monthly_amount: PRICE_BY_SIZE[w.size],
  }));
  const { error: whErr } = await supabase.from("warehouses").insert(warehouseRows);
  if (whErr) throw whErr;
  const warehouseByCode = Object.fromEntries(warehouseRows.map((w) => [w.code, w]));

  console.log("2/5 — Insertando 11 arrendatarios...");
  const tenantRows = RENTAL_PLANS.map((plan, i) => ({
    id: uuid(),
    rut: makeRut(19000000 + i * 137), // cuerpos distintos, DV calculado real
    full_name: NAMES[i],
    phone: `+56 9 ${String(6000 + i * 111).padStart(4, "0")} ${String(1000 + i * 77).padStart(4, "0")}`,
    email: `${NAMES[i].split(" ")[0].toLowerCase()}.${NAMES[i].split(" ")[1].toLowerCase()}@example.com`,
  }));
  const { error: tErr } = await supabase.from("tenants").insert(tenantRows);
  if (tErr) throw tErr;

  console.log("3/5 — Insertando arriendos (todos los estados)...");
  const rentalRows = RENTAL_PLANS.map((plan, i) => {
    const warehouse = warehouseByCode[plan.code];
    return {
      id: uuid(),
      tenant_id: tenantRows[i].id,
      warehouse_id: warehouse.id,
      card_uid: `EM${String(1000000 + i * 91).padStart(8, "0")}`,
      controller_person_id: plan.payments > 0 ? null : null, // se completa más abajo
      monthly_amount: warehouse.monthly_amount,
      status: "inactive", // se corrige al final según el resultado real
      valid_until: null,
    };
  });
  const { error: rErr } = await supabase.from("rentals").insert(rentalRows);
  if (rErr) throw rErr;
  const rentalByCode = Object.fromEntries(RENTAL_PLANS.map((p, i) => [p.code, { plan: p, row: rentalRows[i], warehouse: warehouseByCode[p.code] }]));

  console.log("4/5 — Insertando historial de pagos + auditoría de acceso...");
  const paymentRows = [];
  const logRows = [];
  const rentalUpdates = [];

  for (const plan of RENTAL_PLANS) {
    const { row: rental, warehouse } = rentalByCode[plan.code];
    if (plan.payments === 0) {
      rentalUpdates.push({ id: rental.id, status: "inactive", valid_until: null, controller_person_id: null });
      continue;
    }

    let validUntil = null;
    let firstPayment = true;
    const startDate = addMonths(new Date(), -plan.startMonthsAgo);

    for (let m = 0; m < plan.payments; m++) {
      const paymentDate = addMonths(startDate, m);
      const method = plan.method === "mixed" ? (m % 2 === 0 ? "webpay" : "manual") : plan.method;
      const periodStart = validUntil && validUntil > paymentDate ? validUntil : paymentDate;
      const periodEnd = addMonths(periodStart, 1);
      validUntil = periodEnd;

      const isLastPayment = m === plan.payments - 1;
      const skipSync = plan.pendingSync && isLastPayment;

      const paymentId = uuid();
      paymentRows.push({
        id: paymentId,
        rental_id: rental.id,
        method,
        webpay_token: method === "webpay" ? crypto.randomBytes(32).toString("hex").slice(0, 64) : null,
        buy_order: method === "webpay" ? `bf-demo-${paymentId.slice(0, 12)}` : null,
        session_id: method === "webpay" ? crypto.randomBytes(16).toString("hex") : null,
        amount: warehouse.monthly_amount,
        status: "confirmed",
        authorization_code: method === "webpay" ? String(100000 + Math.floor(Math.random() * 899999)) : null,
        transaction_date: iso(paymentDate),
        period_start: iso(periodStart),
        period_end: iso(periodEnd),
        synced_at: skipSync ? null : iso(new Date(paymentDate.getTime() + 5000)),
        registered_by: method === "manual" ? "juangmelladojara@gmail.com" : null,
        notes: method === "manual" ? "efectivo (demo)" : null,
        created_at: iso(paymentDate),
      });

      if (!skipSync) {
        logRows.push({
          id: uuid(),
          rental_id: rental.id,
          payment_id: paymentId,
          action: firstPayment ? "create_person" : "extend_validity",
          request_payload: { rentalId: rental.id, newValidUntil: iso(periodEnd) },
          response_payload: { mock: true, statusCode: 1, statusString: "OK" },
          success: true,
          error_message: null,
          created_at: iso(new Date(paymentDate.getTime() + 5000)),
        });
      } else {
        logRows.push({
          id: uuid(),
          rental_id: rental.id,
          payment_id: paymentId,
          action: "extend_validity",
          request_payload: { rentalId: rental.id, newValidUntil: iso(periodEnd) },
          response_payload: null,
          success: false,
          error_message: "Timeout esperando respuesta del controlador (demo).",
          created_at: iso(new Date(paymentDate.getTime() + 5000)),
        });
      }
      firstPayment = false;
    }

    // Ajustar valid_until final según el escenario pedido
    let finalValidUntil = validUntil;
    let finalStatus = plan.status;
    if (plan.status === "active" && plan.dueInDays != null) {
      finalValidUntil = daysFromNow(plan.dueInDays);
    } else if (plan.status === "overdue" && plan.overdueDays != null) {
      finalValidUntil = daysAgo(plan.overdueDays);
    } else if (plan.status === "suspended") {
      finalValidUntil = daysAgo(15);
      logRows.push({
        id: uuid(),
        rental_id: rental.id,
        payment_id: null,
        action: "revoke_access",
        request_payload: { rentalId: rental.id, revokedBy: "juangmelladojara@gmail.com" },
        response_payload: { mock: true, statusCode: 1, statusString: "OK" },
        success: true,
        error_message: null,
        created_at: iso(daysAgo(15)),
      });
    }

    rentalUpdates.push({
      id: rental.id,
      status: finalStatus,
      valid_until: iso(finalValidUntil),
      controller_person_id: rental.id,
    });
  }

  const { error: pErr } = await supabase.from("payments").insert(paymentRows);
  if (pErr) throw pErr;
  const { error: lErr } = await supabase.from("access_control_log").insert(logRows);
  if (lErr) throw lErr;

  console.log("5/5 — Fijando estado final de cada arriendo...");
  for (const u of rentalUpdates) {
    const { error } = await supabase
      .from("rentals")
      .update({ status: u.status, valid_until: u.valid_until, controller_person_id: u.controller_person_id })
      .eq("id", u.id);
    if (error) throw error;
  }

  console.log("\nOK ✅");
  console.log(`Bodegas: ${warehouseRows.length} nuevas (+1 ya existente = 16 total)`);
  console.log(`Arrendatarios: ${tenantRows.length} nuevos`);
  console.log(`Pagos insertados: ${paymentRows.length}`);
  console.log(`Eventos de auditoría: ${logRows.length}`);
  console.log("\nRUTs generados (para probar /checkout):");
  RENTAL_PLANS.forEach((p, i) => console.log(`  ${tenantRows[i].rut}  ${NAMES[i]}  →  ${p.code} (${p.status})`));
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
