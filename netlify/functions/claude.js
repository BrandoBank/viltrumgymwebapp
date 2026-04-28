/**
 * Claude API proxy — BeeBuildz
 *
 * Security controls:
 *  1. Method guard — POST only
 *  2. Origin allowlist — rejects requests from unknown origins
 *  3. Input validation — only allowlisted fields forwarded to Anthropic
 *  4. Payload size limit — rejects bodies > 32 KB
 *  5. In-memory rate limiting — max 20 requests / minute per IP
 *  6. API key never exposed to client
 */

// ── Rate limiter (in-memory, per-Lambda-instance) ────────────────────────────
// Each Netlify function instance is isolated; this is best-effort protection
// against bursts within a single warm instance. For production-grade rate
// limiting, use Netlify Edge Functions or an external store (Redis/KV).
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX       = 20;     // requests per window per IP

const rateLimitMap = new Map(); // ip → { count, windowStart }

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

// ── Origin allowlist ──────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://viltrumgymtrainer.netlify.app',
  'https://www.viltrumgymtrainer.netlify.app',
  'https://beebuildz.netlify.app',       // alias / future custom domain
  'https://www.beebuildz.netlify.app',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  // Allow localhost in development
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

// ── Allowlisted request fields forwarded to Anthropic ────────────────────────
const ALLOWED_FIELDS = new Set(['model', 'max_tokens', 'system', 'messages', 'temperature', 'stream']);

// ── Max payload size (32 KB) ──────────────────────────────────────────────────
const MAX_BODY_BYTES = 32_768;

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const origin = event.headers['origin'] || event.headers['Origin'] || '';
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  // Method guard
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Method Not Allowed' } }) };
  }

  // Origin check
  if (!isAllowedOrigin(origin)) {
    return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { message: 'Forbidden' } }) };
  }

  // Rate limit by IP
  const clientIp = event.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers: { ...corsHeaders, 'Retry-After': '60' },
      body: JSON.stringify({ error: { message: 'Too many requests — try again in a minute' } })
    };
  }

  // Payload size guard
  const bodyLength = Buffer.byteLength(event.body || '', 'utf8');
  if (bodyLength > MAX_BODY_BYTES) {
    return { statusCode: 413, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Payload too large' } }) };
  }

  // API key check
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: { message: 'API not configured' } }) };
  }

  try {
    const raw = JSON.parse(event.body);

    // Strip unknown fields — only forward what Anthropic needs
    const sanitized = {};
    for (const field of ALLOWED_FIELDS) {
      if (raw[field] !== undefined) sanitized[field] = raw[field];
    }

    // Enforce model allowlist — only Claude models permitted
    if (sanitized.model && !String(sanitized.model).startsWith('claude-')) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Invalid model' } }) };
    }

    // Enforce sane token ceiling
    if (sanitized.max_tokens && sanitized.max_tokens > 8192) {
      sanitized.max_tokens = 8192;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(sanitized),
    });

    const data = await response.json();
    return { statusCode: response.status, headers: corsHeaders, body: JSON.stringify(data) };

  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Internal server error' } }) };
  }
};
