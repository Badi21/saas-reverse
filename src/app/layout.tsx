import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'saas-reverse — Reverse any SaaS into a build blueprint',
  description: 'Enter any SaaS domain. Get a structured prompt with features, tech stack, user flows, and everything you need to build something similar.',
  openGraph: {
    title: 'saas-reverse',
    description: 'Reverse-engineer any SaaS. Get the build blueprint.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
