import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/'
      },
      {
        userAgent: 'Googlebot',
        allow: '/'
      },
      {
        userAgent: 'Mediapartners-Google',
        allow: '/'
      }
    ],
    sitemap: 'https://jobsthe.world/sitemap.xml',
    host: 'https://jobsthe.world'
  };
}
