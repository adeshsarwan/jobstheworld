import type { MetadataRoute } from 'next';

import { featuredCompanies } from '../config/featuredCompanies';

const baseUrl = 'https://jobsthe.world';

const routes = [
  '',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/find/work',
  '/find/location',
  '/find/schedule',
  '/find/experience',
  '/find/results',
  '/chat'
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticRoutes = routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified
  }));

  const companyRoutes = featuredCompanies.map((company) => ({
    url: `${baseUrl}/companies/${company.slug}`,
    lastModified
  }));

  return [...staticRoutes, ...companyRoutes];
}
