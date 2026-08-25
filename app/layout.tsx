import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
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
