// Sliding-window rate limiter, in-memory. One process only — fine for a
// single Next.js instance, resets on redeploy. Swap for Upstash/Redis if
// this ever runs across multiple serverless instances.

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 8;

const hits = new Map<string, number[]>();

// Occasional sweep so the map doesn't grow forever with stale IPs.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, timestamps] of hits) {
    const fresh = timestamps.filter(t => now - t < WINDOW_MS);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const timestamps = (hits.get(key) || []).filter(t => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfterMs = WINDOW_MS - (now - timestamps[0]);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return { allowed: true, remaining: MAX_REQUESTS - timestamps.length, retryAfterSeconds: 0 };
}

// Best-effort client identifier behind a proxy/CDN.
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}
