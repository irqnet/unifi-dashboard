import type { Metadata, Viewport } from 'next';
import { THEME_INIT_SCRIPT } from '@/components/ui/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'UniFi Network Status',
  description: 'Echtzeit-Status- und Monitoring-Dashboard für UniFi-Netzwerke',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d12' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Klasse dark/light setzt das Inline-Skript vor dem ersten Zeichnen (gespeicherte Wahl oder System)
    <html lang="de" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
