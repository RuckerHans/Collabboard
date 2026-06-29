import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/src/components/layout/Providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'Collabboard',
    template: '%s · Collabboard',
  },
  description: 'Real-time collaborative sticky-note boards.',
    applicationName: 'Collabboard',
    icons: {
      icon: '/icon.png',
    },
  };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} bg-slate-50 text-ink antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
