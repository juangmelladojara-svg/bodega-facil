import {
  WebpayPlus,
  Options,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
  Environment,
} from "transbank-sdk";

/**
 * TRANSBANK_ENVIRONMENT=production requiere TRANSBANK_COMMERCE_CODE y
 * TRANSBANK_API_KEY reales (afiliación de comercio). Por defecto usa las
 * credenciales públicas de integración del SDK — no requiere configuración
 * y nunca mueve dinero real.
 */
function buildOptions() {
  const isProduction = process.env.TRANSBANK_ENVIRONMENT === "production";

  if (!isProduction) {
    return new Options(
      IntegrationCommerceCodes.WEBPAY_PLUS,
      IntegrationApiKeys.WEBPAY,
      Environment.Integration
    );
  }

  const commerceCode = process.env.TRANSBANK_COMMERCE_CODE;
  const apiKey = process.env.TRANSBANK_API_KEY;

  if (!commerceCode || !apiKey) {
    throw new Error(
      "TRANSBANK_ENVIRONMENT=production requiere TRANSBANK_COMMERCE_CODE y TRANSBANK_API_KEY."
    );
  }

  return new Options(commerceCode, apiKey, Environment.Production);
}

function getTransaction() {
  return new WebpayPlus.Transaction(buildOptions());
}

/**
 * Crea la transacción en Webpay Plus. Retorna { token, url } — el frontend
 * debe hacer un POST form a `url` con el campo `token_ws=token`.
 */
export async function createWebpayTransaction({ buyOrder, sessionId, amount, returnUrl }) {
  const transaction = getTransaction();
  return transaction.create(buyOrder, sessionId, amount, returnUrl);
}

/**
 * Confirma (commit) una transacción a partir del token que Webpay devuelve
 * en el POST de retorno. Idempotente del lado de Transbank: llamar commit
 * más de una vez sobre un token ya confirmado devuelve el mismo resultado.
 */
export async function commitWebpayTransaction(token) {
  const transaction = getTransaction();
  return transaction.commit(token);
}
