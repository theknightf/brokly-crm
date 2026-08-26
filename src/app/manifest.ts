import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Brokly — Real Estate CRM for Modern Brokerages',
    short_name: 'Brokly',
    description:
      'Brokly is a production-ready real estate CRM for modern brokerages — leads, pipeline, follow-ups, teams, reports and productivity analytics.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#84cc16',
    categories: ['business', 'productivity', 'finance'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      {
        src: '/icons/icon-192-v2.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-v2.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512-v2.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        url: '/',
        icons: [{ src: '/icons/icon-192-v2.png', sizes: '192x192' }],
      },
      {
        name: 'Leads',
        short_name: 'Leads',
        url: '/leads-management',
        icons: [{ src: '/icons/icon-192-v2.png', sizes: '192x192' }],
      },
      {
        name: 'Customers',
        short_name: 'Customers',
        url: '/customers',
        icons: [{ src: '/icons/icon-192-v2.png', sizes: '192x192' }],
      },
    ],
  };
}
