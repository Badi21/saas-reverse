import type { MetadataRoute } from 'next';
import { listRecentAnalyses } from '@/lib/db';

export const revalidate = 3600; // regenerate at most once an hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const analyses = await listRecentAnalyses(500);

  return [
    { url: 'https://saas-reverse.com', changeFrequency: 'daily', priority: 1 },
    ...analyses.map(a => ({
      url: `https://saas-reverse.com/${a.domain}`,
      lastModified: new Date(a.created_at),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
