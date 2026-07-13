/**
 * Rate limit best-effort, en memoria del proceso. NO es perfecto en un
 * entorno serverless multi-instancia (cada instancia fría tiene su propio
 * contador) — pero sí frena scripts básicos golpeando la misma instancia
 * calentada, que es el caso típico de un scraper barriendo RUTs. Si esto
 * necesita ser una barrera real, migrar a Upstash Ratelimit (Redis) u otro
 * store compartido.
 */
const buckets = new Map(); // key -> { count, resetAt }

// Evita que `buckets` crezca sin límite si llegan muchas IPs distintas.
const MAX_BUCKETS = 5000;

export function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true };
}

export function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
