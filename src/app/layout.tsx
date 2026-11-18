import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UniFi Network Status',
  description: 'Echtzeit-Status- und Monitoring-Dashboard für UniFi-Netzwerke',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0a0d12',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
