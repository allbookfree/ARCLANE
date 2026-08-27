import type { Metadata } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? (process.env.NEXT_PUBLIC_SITE_URL.startsWith('http')
      ? process.env.NEXT_PUBLIC_SITE_URL
      : `https://${process.env.NEXT_PUBLIC_SITE_URL}`)
  : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Arclane — Make better content. Grow a stronger channel.',
  description:
    'Clear channel strategy, content systems, and growth direction for ambitious YouTubers and digital creators.',
  openGraph: {
    title: 'Arclane — Make better content. Grow a stronger channel.',
    description:
      'Channel strategy, creative direction, and growth systems for ambitious YouTubers and digital creators.',
    images: [{ url: '/og.png', width: 1672, height: 941 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arclane — Make better content. Grow a stronger channel.',
    description:
      'Channel strategy, creative direction, and growth systems for ambitious YouTubers and digital creators.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
