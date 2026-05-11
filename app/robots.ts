import { MetadataRoute } from 'next';

const BASE_URL = 'https://www.flupflap.com';

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
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
