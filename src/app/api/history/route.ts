import { NextResponse } from 'next/server';
import { listRecentAnalyses } from '@/lib/db';

export async function GET() {
  const analyses = listRecentAnalyses(20).map(a => ({
    domain: a.domain,
    title: a.title,
    createdAt: a.created_at,
  }));
  return NextResponse.json({ analyses });
}
