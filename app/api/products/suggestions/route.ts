import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const CATEGORIES = ['Electronics', 'Clothing', 'Furniture', 'Books', 'Toys', 'Sports', 'Collectibles', 'Other'];

function addSuggestion(
  scores: Map<string, number>,
  value: string | null | undefined,
  normalizedQuery: string,
  weight: number,
) {
  const trimmed = value?.trim();
  if (!trimmed) return;

  const normalizedValue = trimmed.toLowerCase();
  if (!normalizedValue.includes(normalizedQuery)) return;

  const score = weight + (normalizedValue.startsWith(normalizedQuery) ? 100 : 0);
  const existing = scores.get(trimmed);
  if (existing === undefined || score > existing) {
    scores.set(trimmed, score);
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const normalizedQuery = query.toLowerCase();

  if (!normalizedQuery) {
    return NextResponse.json([]);
  }

  if (normalizedQuery.length < 2) {
    return NextResponse.json(
      CATEGORIES.filter((category) => category.toLowerCase().startsWith(normalizedQuery)).slice(0, 5),
    );
  }

  const products = await prisma.product.findMany({
    where: {
      status: 'APPROVED',
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
        { pickupCity: { contains: query, mode: 'insensitive' } },
        { pickupState: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      title: true,
      category: true,
      pickupCity: true,
      pickupState: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  const scores = new Map<string, number>();
  CATEGORIES.forEach((category) => addSuggestion(scores, category, normalizedQuery, 25));

  products.forEach((product, index) => {
    const weight = Math.max(1, 12 - index);
    addSuggestion(scores, product.title, normalizedQuery, 40 + weight);
    addSuggestion(scores, product.category, normalizedQuery, 20 + weight);
    addSuggestion(
      scores,
      [product.pickupCity, product.pickupState].filter(Boolean).join(', '),
      normalizedQuery,
      10 + weight,
    );
  });

  const suggestions = [...scores.entries()]
    .sort((entryA, entryB) => entryB[1] - entryA[1] || entryA[0].localeCompare(entryB[0]))
    .slice(0, 8)
    .map(([value]) => value);

  return NextResponse.json(suggestions);
}
