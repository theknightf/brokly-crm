import React from 'react';
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { PWAProvider } from '@/components/PWAProvider';
import { MobileTableLabeler } from '@/components/MobileTableLabeler';
import '../styles/tailwind.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#051424',
};

export const metadata: Metadata = {
  title: 'Brokly — Real Estate CRM for Modern Brokerages',
  description:
    'Brokly helps real estate brokerages capture leads, track follow-ups, and close more deals from one clean dashboard.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Brokly',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Brokly',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={GeistSans.className}>
        <AuthProvider>
          <LanguageProvider>
            {children}
            <Toaster position="bottom-right" richColors closeButton theme="dark" />
          </LanguageProvider>
        </AuthProvider>
        <PWAProvider />
        <MobileTableLabeler />

        <script
          type="module"
          async
          src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Frealtyflow2204back.builtwithrocket.new&_be=https%3A%2F%2Fappanalytics.rocket.new&_v=0.1.20"
        />
        <script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.2" />
      </body>
    </html>
  );
}
