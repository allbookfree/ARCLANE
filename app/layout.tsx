import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arclane — Digital experiences built to lead',
  description:
    'Arclane is an independent digital studio building high-performing brands and digital products for ambitious companies.',
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
