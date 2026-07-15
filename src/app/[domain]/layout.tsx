import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain: rawDomain } = await params;
  const domain = decodeURIComponent(rawDomain);
  const title = `${domain} build blueprint`;
  const description = `Reverse-engineered breakdown of ${domain}: features, pricing, moat analysis, churn vectors, tech stack, and a build prompt ready to paste into an AI coding assistant.`;
  const url = `https://saas-reverse.com/${domain}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function DomainLayout({ children }: { children: React.ReactNode }) {
  return children;
}
