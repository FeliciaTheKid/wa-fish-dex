import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'eFish: Washington Archive',
    short_name: 'eFish',
    description: 'A gamified fishing quest log for Washington State.',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  }
}