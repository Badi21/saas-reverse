import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import dns from 'dns';
import { checkRateLimit, clientKeyFromHeaders } from '@/lib/rate-limit';
import { getCachedAnalysis, saveAnalysis } from '@/lib/db';
import { verifySeenClaims } from '@/lib/verify-claims';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_CONTENT_PER_PAGE = 4000;
const FETCH_TIMEOUT_MS = 7000;
const MAX_REDIRECTS = 3;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// Reject RFC-1918, loopback, link-local, CGNAT, and other non-public ranges.
function isPrivateIP(ip: string): boolean {
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true; // fc00::/7 unique-local

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||       // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) ||                  // 169.254.0.0/16 link-local / AWS metadata
    (a === 172 && b >= 16 && b <= 31) ||         // 172.16.0.0/12
    (a === 192 && b === 0 && c === 0) ||          // 192.0.0.0/24
    (a === 192 && b === 0 && c === 2) ||          // 192.0.2.0/24 TEST-NET-1
    (a === 192 && b === 168) ||                  // 192.168.0.0/16
    (a === 198 && b >= 18 && b <= 19) ||         // 198.18.0.0/15 benchmark
    (a === 198 && b === 51 && c === 100) ||       // 198.51.100.0/24 TEST-NET-2
    (a === 203 && b === 0 && c === 113) ||        // 203.0.113.0/24 TEST-NET-3
    a >= 224                                     // multicast + reserved
  );
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
]);

// Validate hostname via DNS and reject private/internal IP targets.
async function assertHostSafe(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/\.$/, '');

  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error(`Hostname not allowed: ${host}`);
  }
  // Reject bare IPv4 literals that are private.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIP(host)) throw new Error('IP address targets are not allowed.');
    return;
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new Error(`Cannot resolve host: ${host}`);
  }
  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      throw new Error(`Domain resolves to a private address.`);
    }
  }
}

const RESOLVE_TLDS = ['.com', '.app', '.so', '.co', '.ai', '.io', '.dev', '.net', '.org'];

// Bare name like "notion" → probe TLDs in parallel, return first that resolves safely.
async function resolveSaaSName(name: string): Promise<string> {
  const clean = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!clean) throw new Error('Invalid name.');

  try {
    const host = await Promise.any(
      RESOLVE_TLDS.map(async tld => {
        const h = `${clean}${tld}`;
        const addrs = await dns.promises.lookup(h, { all: true });
        for (const { address } of addrs) {
          if (isPrivateIP(address)) throw new Error('private');
        }
        return h;
      })
    );
    return `https://${host}`;
  } catch {
    throw new Error(`Could not find a SaaS for "${name}". Try the full domain, e.g. ${name}.com`);
  }
}

// Parse and validate input: bare name, domain, or full URL — all safe.
async function validateInput(input: string): Promise<string> {
  const raw = input.trim();

  // Bare name with no dot → auto-resolve TLD
  const stripped = raw.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0];
  if (!stripped.includes('.')) {
    return resolveSaaSName(stripped);
  }

  const withScheme =
    raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('Invalid domain format.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS domains are supported.');
  }

  await assertHostSafe(parsed.hostname);
  return `https://${parsed.hostname.toLowerCase().replace(/\.$/, '')}${parsed.port ? `:${parsed.port}` : ''}`;
}

// Fetch with manual redirect tracking — re-validates each hop.
async function safeFetch(url: string, hops = 0): Promise<Response | null> {
  if (hops > MAX_REDIRECTS) return null;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });
  } catch {
    return null;
  }

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (!location) return null;
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      return null;
    }
    if (next.protocol !== 'https:') return null;
    try {
      await assertHostSafe(next.hostname);
    } catch {
      return null;
    }
    return safeFetch(next.toString(), hops + 1);
  }

  return res.ok ? res : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMeta(html: string): { title: string; description: string } {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
  const descMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const description = descMatch?.[1]?.trim() || '';
  return { title, description };
}

async function fetchPage(url: string): Promise<string | null> {
  const res = await safeFetch(url);
  if (!res) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
}

// Apify RAG web browser — used as fallback when direct fetch is blocked.
async function scrapeViaApify(base: string): Promise<string | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return null;

  const paths = ['', '/pricing', '/features', '/about'];
  const results: string[] = [];

  for (const path of paths) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/apify~rag-web-browser/run-sync-get-dataset-items?token=${token}&timeout=30`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: url, maxResults: 1 }),
          signal: AbortSignal.timeout(35000),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const markdown = data?.[0]?.markdown || data?.[0]?.text || '';
      if (markdown.length > 200) {
        results.push(`[Page: ${path || '/'}]\n${markdown.slice(0, 4000)}`);
      }
    } catch {
      continue;
    }
  }

  return results.length ? results.join('\n\n---\n\n') : null;
}

async function scrapeSaaS(base: string): Promise<{ content: string; meta: { title: string; description: string } }> {
  const paths = ['', '/pricing', '/features', '/product', '/about', '/solutions', '/enterprise', '/customers', '/changelog', '/blog'];

  const results = await Promise.allSettled(paths.map(p => fetchPage(`${base}${p}`)));

  let meta = { title: '', description: '' };
  const sections: string[] = [];

  results.forEach((result, i) => {
    if (result.status !== 'fulfilled' || !result.value) return;
    const html = result.value;
    if (i === 0) meta = extractMeta(html);
    const text = stripHtml(html).slice(0, MAX_CONTENT_PER_PAGE);
    if (text.length > 100) {
      sections.push(`[Page: ${paths[i] || '/'}]\n${text}`);
    }
  });

  let content = sections.join('\n\n---\n\n').slice(0, 14000);

  // Fallback: if direct scrape got too little (blocked by bot protection), try Apify
  if (content.length < 500) {
    const apifyContent = await scrapeViaApify(base);
    if (apifyContent) content = apifyContent;
  }

  return { content, meta };
}

const SYSTEM_PROMPT = `You are a venture-analyst who reverse-engineers SaaS products for builders who want to recreate or compete with them.

Rules:
- Specific over vague. Never say "a platform that helps users." Say "project management for async remote teams at $8/seat/month."
- Use real numbers from the content when visible.
- Distinguish what you saw ([SEEN]) from what you inferred ([INFERRED]).
- Moat analysis must be honest — most SaaS have weak moats. Say so.
- Churn vectors must come from real signals in the content, not generic guesses.
- Build prompt must be complete enough to paste directly into an AI coding assistant and start building.`;

function buildUserPrompt(domain: string, meta: { title: string; description: string }, content: string): string {
  return `Analyze this SaaS and output a venture-analyst-grade build blueprint.

Domain: ${domain}
${meta.title ? `Title: ${meta.title}` : ''}
${meta.description ? `Meta description: ${meta.description}` : ''}

Scraped content:
${content}

---

Output the blueprint using these exact sections in order:

## What it does
2-3 specific sentences. Actual product behavior, not taglines. Include price if visible.

## Target users
Role + company size + trigger moment (when does someone first need this?). Example: "Engineering managers at 10-50 person startups who've outgrown GitHub Issues. Trigger: team grows past 8 engineers."

## Core features
10-18 features as a markdown table:
| Feature | Type | Description |
|---------|------|-------------|
Type = Core / Differentiator / Table stakes

## Business model
- Free tier: what's included and the hard limit
- Paid tiers: name + price + what unlocks (use [SEEN] if on the page, [INFERRED] if guessed)
- Upgrade gate: the exact friction that converts free to paid
- Trial mechanics: days, card required?
- Enterprise signals: SSO, audit logs, SLA?

## Moat analysis
For each: Strong / Moderate / Weak / None + one-line evidence
- Network effects:
- Switching costs:
- Data advantage:
- Brand/community:
- Integrations:

## Churn vectors
Top 3 reasons users would leave — infer from feature gaps, pricing structure, or missing capabilities visible in the content. Label each [SEEN] or [INFERRED].

## Tech stack
Markdown table with Layer / Stack / Confidence ([SEEN] in HTML/headers, [INFERRED] from patterns):
Frontend, Backend, Database, Auth, Payments, Infrastructure, Analytics

## Build complexity
Estimate in days for a 2-person team:
- Data model + migrations: X days
- Auth + team/org structure: X days
- Core feature loop: X days
- Payments/billing: X days
- **MVP total: X weeks**

## Differentiation angle
If building a competitor:
- Underserved segment the incumbent ignores
- One feature that would win switchers
- Pricing angle that works in a niche
- What the incumbent will never build (and why)

## Pages to build
All pages including app views, not just marketing pages.

## Core user flows
Three numbered flows:
1. Onboarding (include drop-off risks)
2. Daily core action (the habit loop)
3. Upgrade moment (exact trigger)

## Build prompt
Complete prompt to paste into Claude Code or Cursor. Must include: product description, target user, full feature list with behaviors, data models as TypeScript types, all pages, three user flows, business rules (free tier limits, upgrade gates), and tech stack. Start with: "Build a [type] SaaS..."`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured.' }, { status: 500 });
  }

  const clientKey = clientKeyFromHeaders(req.headers);
  const rateLimit = checkRateLimit(clientKey);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many analyses from this IP. Try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  let rawDomain: string;
  let force = false;
  try {
    const body = await req.json();
    rawDomain = body.domain?.trim();
    force = body.force === true;
    if (!rawDomain) throw new Error('Missing domain');
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let safeBase: string;
  try {
    safeBase = await validateInput(rawDomain);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid domain.' },
      { status: 400 }
    );
  }

  const domain = new URL(safeBase).hostname;

  if (!force) {
    const cached = getCachedAnalysis(domain, CACHE_TTL_MS);
    if (cached) {
      return new Response(cached.content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Resolved-Domain': domain,
          'X-Cache': 'HIT',
        },
      });
    }
  }

  // Scrape the SaaS
  const { content, meta } = await scrapeSaaS(safeBase);

  if (!content || content.length < 100) {
    return NextResponse.json(
      { error: `Could not fetch content from ${domain}. The site may block scrapers or be unavailable.` },
      { status: 422 }
    );
  }

  const groq = new Groq({ apiKey });

  const stream = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(domain, meta, content) },
    ],
    temperature: 0.3,
    max_tokens: 4500,
    stream: true,
  });

  const encoder = new TextEncoder();
  let fullOutput = '';
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            fullOutput += text;
            controller.enqueue(encoder.encode(text));
          }
        }

        const checks = verifySeenClaims(fullOutput, content);
        const failed = checks.filter(c => !c.verified);
        if (failed.length > 0) {
          const footer = `\n\n---\n*Verification: ${failed.length} of ${checks.length} [SEEN] figures could not be found in the scraped source (${failed.map(c => c.claim).join(', ')}). Treat those as unconfirmed.*`;
          controller.enqueue(encoder.encode(footer));
          fullOutput += footer;
        }
      } finally {
        controller.close();
        if (fullOutput.length > 100) {
          saveAnalysis({ domain, title: meta.title, description: meta.description, content: fullOutput });
        }
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'X-Resolved-Domain': domain,
      'X-Cache': 'MISS',
    },
  });
}
