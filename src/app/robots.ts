import type { MetadataRoute } from 'next';

// Wildcard already allows everyone, including AI crawlers. Listing the
// major ones explicitly is a clearer signal for GEO purposes (AI Overviews,
// ChatGPT search, Perplexity, Bing Copilot) than relying on the wildcard alone.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
    ],
    sitemap: 'https://saas-reverse.com/sitemap.xml',
  };
}
