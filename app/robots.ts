import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/api/',
          '/account',
          '/orders',
          '/checkout',
          '/cart',
          '/messages',
          '/offers',
          '/notifications',
          '/seller/new',
          '/seller/edit',
          '/seller/promote',
          '/seller/dashboard',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
