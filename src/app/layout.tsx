import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

const SITE_URL = 'https://saas-reverse.com';
// Keyword phrase first ("reverse engineer any saas" is what people actually
// type), brand last. A brand-new domain has zero brand-search volume yet,
// so the title's job is matching what someone would search, not recall.
const TITLE = 'Reverse Engineer Any SaaS: AI Build Blueprint | saas-reverse';
const DESCRIPTION =
  'Enter any SaaS domain and get its features, pricing, tech stack, and moat analyzed instantly, plus a build prompt ready for Claude Code or Cursor.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s | saas-reverse' },
  description: DESCRIPTION,
  keywords: [
    'reverse engineer saas',
    'saas build blueprint',
    'ai coding prompt generator',
    'competitor analysis tool',
    'saas tech stack detector',
    'build prompt generator',
  ],
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'saas-reverse',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'saas-reverse',
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
