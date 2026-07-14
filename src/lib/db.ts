import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'analyses.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at);
`);

export interface StoredAnalysis {
  domain: string;
  title: string;
  description: string;
  content: string;
  created_at: number;
}

const getByDomainStmt = db.prepare(
  'SELECT domain, title, description, content, created_at FROM analyses WHERE domain = ?'
);

const upsertStmt = db.prepare(`
  INSERT INTO analyses (domain, title, description, content, created_at)
  VALUES (@domain, @title, @description, @content, @created_at)
  ON CONFLICT(domain) DO UPDATE SET
    title = excluded.title,
    description = excluded.description,
    content = excluded.content,
    created_at = excluded.created_at
`);

const recentStmt = db.prepare(
  'SELECT domain, title, description, content, created_at FROM analyses ORDER BY created_at DESC LIMIT ?'
);

export function getCachedAnalysis(domain: string, maxAgeMs: number): StoredAnalysis | null {
  const row = getByDomainStmt.get(domain) as StoredAnalysis | undefined;
  if (!row) return null;
  if (Date.now() - row.created_at > maxAgeMs) return null;
  return row;
}

export function saveAnalysis(analysis: Omit<StoredAnalysis, 'created_at'>): void {
  upsertStmt.run({ ...analysis, created_at: Date.now() });
}

export function listRecentAnalyses(limit = 20): StoredAnalysis[] {
  return recentStmt.all(limit) as StoredAnalysis[];
}
