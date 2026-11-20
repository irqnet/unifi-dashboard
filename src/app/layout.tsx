import type { Metadata, Viewport } from 'next';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { THEME_INIT_SCRIPT } from '@/components/ui/theme';
import { getLocale, getT } from '@/lib/i18n/server';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: 'UniFi Network Status',
    description: t('meta.description'),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d12' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    // The inline script sets the dark/light class before first paint (saved choice or system)
    <html lang={locale} className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
