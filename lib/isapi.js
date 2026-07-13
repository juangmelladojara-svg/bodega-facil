import DigestFetch from "digest-fetch";

/**
 * Cliente ISAPI para el controlador Hikvision DS-K2602T.
 *
 * ⚠️ Los nombres de campo (`UserInfo`, `Valid.beginTime/endTime`, `CardInfo`, etc.)
 * siguen el "Intelligent Security API — Access Control Device Developer Guide"
 * público de Hikvision, que es consistente entre gran parte de la familia
 * DS-K2xxx. NO ESTÁ VALIDADO contra el firmware real instalado en terreno.
 * Antes de producción: confirmar payloads exactos contra la cuenta aprobada
 * en tpp.hikvision.com y contra respuestas reales del DS-K2602T (ver
 * CONTEXTO.md, sección 9.4). Todas las llamadas quedan de todas formas
 * registradas en `access_control_log` para poder diagnosticar diferencias.
 *
 * Modo mock: SOLO con ISAPI_MOCK="true" (explícito). Si la variable falta o
 * tiene un valor distinto, se intenta la llamada real — si además faltan
 * ISAPI_BASE_URL/USERNAME/PASSWORD, `getConfig()` lanza un error claro. Es
 * intencional: preferimos que producción falle ruidosamente a que simule
 * éxito en silencio porque alguien olvidó una variable de entorno.
 */

const ISAPI_TIMEOUT_MS = 8000;

const mockStore = new Map(); // employeeNo -> { cards: [], validFrom, validUntil, enabled }

function isMockMode() {
  return process.env.ISAPI_MOCK === "true";
}

function getConfig() {
  const baseUrl = process.env.ISAPI_BASE_URL;
  const username = process.env.ISAPI_USERNAME;
  const password = process.env.ISAPI_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new Error(
      "Faltan ISAPI_BASE_URL / ISAPI_USERNAME / ISAPI_PASSWORD en las variables de entorno."
    );
  }

  return { baseUrl, username, password };
}

let digestClient;
let digestClientKey;

function getDigestClient() {
  const { username, password } = getConfig();
  const key = `${username}:${password}`;
  if (!digestClient || digestClientKey !== key) {
    digestClient = new DigestFetch(username, password);
    digestClientKey = key;
  }
  return digestClient;
}

/**
 * POST/PUT genérico contra el controlador, con autenticación Digest y timeout
 * (un túnel colgado no debe dejar la función esperando hasta el límite de Vercel).
 * Lanza si la respuesta HTTP no es 2xx o si `statusCode` del body ISAPI != 1.
 */
async function isapiRequest(path, { method = "POST", body } = {}) {
  const { baseUrl } = getConfig();
  const client = getDigestClient();
  const url = `${baseUrl}${path}`;

  const response = await client.fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(ISAPI_TIMEOUT_MS),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`ISAPI ${method} ${path} → HTTP ${response.status}`);
    error.response = parsed;
    throw error;
  }

  return parsed;
}

/**
 * Formatea una fecha en hora LOCAL DE CHILE (America/Santiago), sin offset,
 * porque el controlador la interpreta con `timeType: "local"` — mandar UTC
 * ahí corre la vigencia real 3-4 horas (según horario de verano).
 */
function toChileLocalISO(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * Enrola una persona nueva en el controlador (una vez por tarjeta física).
 * Guarda `employeeNo` (== rentals.controller_person_id) para futuras llamadas.
 */
export async function createPerson({ employeeNo, name, validFrom, validUntil, doorNo }) {
  const payload = {
    UserInfo: {
      employeeNo: String(employeeNo),
      name,
      userType: "normal",
      Valid: {
        enable: true,
        beginTime: toChileLocalISO(validFrom),
        endTime: toChileLocalISO(validUntil),
        timeType: "local",
      },
      doorRight: String(doorNo),
      RightPlan: [{ doorNo, planTemplateNo: "1" }],
    },
  };

  if (isMockMode()) {
    mockStore.set(employeeNo, {
      cards: [],
      validFrom,
      validUntil,
      enabled: true,
    });
    return { mock: true, statusCode: 1, statusString: "OK", request: payload };
  }

  return isapiRequest("/ISAPI/AccessControl/UserInfo/Record?format=json", {
    method: "POST",
    body: payload,
  });
}

/**
 * Asocia una tarjeta física (UID) a una persona ya enrolada.
 */
export async function addCardToPerson({ employeeNo, cardNo }) {
  const payload = {
    CardInfo: {
      employeeNo: String(employeeNo),
      cardNo: String(cardNo),
      cardType: "normalCard",
    },
  };

  if (isMockMode()) {
    const person = mockStore.get(employeeNo);
    if (person) person.cards.push(cardNo);
    return { mock: true, statusCode: 1, statusString: "OK", request: payload };
  }

  return isapiRequest("/ISAPI/AccessControl/CardInfo/Record?format=json", {
    method: "POST",
    body: payload,
  });
}

/**
 * Llamada central del flujo de pago: extiende la vigencia de la tarjeta
 * (persona) hasta `validUntil`. El controlador deniega acceso solo al
 * vencer esta fecha, sin que el backend esté vigilando en tiempo real.
 */
export async function extendCardValidity({ employeeNo, validFrom, validUntil, doorNo }) {
  const payload = {
    UserInfo: {
      employeeNo: String(employeeNo),
      Valid: {
        enable: true,
        beginTime: toChileLocalISO(validFrom),
        endTime: toChileLocalISO(validUntil),
        timeType: "local",
      },
      ...(doorNo ? { doorRight: String(doorNo), RightPlan: [{ doorNo, planTemplateNo: "1" }] } : {}),
    },
  };

  if (isMockMode()) {
    const person = mockStore.get(employeeNo) ?? { cards: [], enabled: true };
    person.validFrom = validFrom;
    person.validUntil = validUntil;
    mockStore.set(employeeNo, person);
    return { mock: true, statusCode: 1, statusString: "OK", request: payload };
  }

  return isapiRequest("/ISAPI/AccessControl/UserInfo/Modify?format=json", {
    method: "PUT",
    body: payload,
  });
}

/**
 * Revoca el acceso de inmediato (uso administrativo manual, no forma parte
 * del flujo automático de pago). Deshabilita la persona en vez de borrarla,
 * para no perder el enrolamiento de la tarjeta.
 */
export async function revokeAccess({ employeeNo }) {
  const payload = {
    UserInfo: {
      employeeNo: String(employeeNo),
      Valid: { enable: false },
    },
  };

  if (isMockMode()) {
    const person = mockStore.get(employeeNo);
    if (person) person.enabled = false;
    return { mock: true, statusCode: 1, statusString: "OK", request: payload };
  }

  return isapiRequest("/ISAPI/AccessControl/UserInfo/Modify?format=json", {
    method: "PUT",
    body: payload,
  });
}
