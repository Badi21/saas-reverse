import { neon, NeonQueryFunction } from '@neondatabase/serverless';

// Lazy on purpose: Next.js imports route modules at build time to collect
// page data, before real env vars exist. Calling neon() at module load
// crashed the build with "no connection string provided".
let sql: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> {
  if (!sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not configured.');
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = getSql();
    schemaReady = (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS analyses (
          id SERIAL PRIMARY KEY,
          domain TEXT NOT NULL UNIQUE,
          title TEXT,
          description TEXT,
          content TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `;
      await db`CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at)`;
    })();
  }
  return schemaReady;
}

export interface StoredAnalysis {
  domain: string;
  title: string;
  description: string;
  content: string;
  created_at: number;
}

// Postgres BIGINT comes back from the driver as a string, to avoid silently
// truncating values past Number.MAX_SAFE_INTEGER. Our timestamps never get
// that large, so it's safe to normalize back to a number here.
function normalizeRow(row: Record<string, unknown>): StoredAnalysis {
  return { ...row, created_at: Number(row.created_at) } as StoredAnalysis;
}

export async function getCachedAnalysis(domain: string, maxAgeMs: number): Promise<StoredAnalysis | null> {
  await ensureSchema();
  const rows = await getSql()`
    SELECT domain, title, description, content, created_at
    FROM analyses WHERE domain = ${domain}
  `;
  if (!rows[0]) return null;
  const row = normalizeRow(rows[0]);
  if (Date.now() - row.created_at > maxAgeMs) return null;
  return row;
}

export async function saveAnalysis(analysis: Omit<StoredAnalysis, 'created_at'>): Promise<void> {
  await ensureSchema();
  const created_at = Date.now();
  await getSql()`
    INSERT INTO analyses (domain, title, description, content, created_at)
    VALUES (${analysis.domain}, ${analysis.title}, ${analysis.description}, ${analysis.content}, ${created_at})
    ON CONFLICT (domain) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      content = excluded.content,
      created_at = excluded.created_at
  `;
}

export async function listRecentAnalyses(limit = 20): Promise<StoredAnalysis[]> {
  await ensureSchema();
  const rows = await getSql()`
    SELECT domain, title, description, content, created_at
    FROM analyses ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows.map(normalizeRow);
}
