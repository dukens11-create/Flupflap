import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { applyRateLimitAsync } from '@/lib/security';

// ── Request validation ────────────────────────────────────────────────────────

const requestSchema = z.object({
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).min(1).optional(),
}).refine(
  (data) => data.imageUrl || (data.imageUrls && data.imageUrls.length > 0),
  { message: 'Provide at least one image URL via imageUrl or imageUrls.' },
);

// ── AI response validation ────────────────────────────────────────────────────

const aiResponseSchema = z.object({
  title: z.string().max(200).catch(''),
  shortDescription: z.string().max(500).catch(''),
  detailedDescription: z.string().max(2000).catch(''),
  brand: z.string().max(100).catch('Unknown'),
  category: z.string().max(100).catch(''),
  color: z.string().max(100).catch(''),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'poor']).catch('good'),
  keywords: z.array(z.string().max(50)).max(20).catch([]),
  estimatedWeightLb: z.number().positive().catch(0),
  estimatedLengthIn: z.number().positive().catch(0),
  estimatedWidthIn: z.number().positive().catch(0),
  estimatedHeightIn: z.number().positive().catch(0),
  confidence: z.enum(['high', 'medium', 'low']).catch('low'),
});

export type AiListingResponse = z.infer<typeof aiResponseSchema>;

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a product listing assistant for an online marketplace called FlupFlap.

When given one or more product images, analyze them and return a JSON object with these fields:

- title: A concise, descriptive product title (max 80 characters)
- shortDescription: A brief 1-2 sentence summary of the product (max 150 characters)
- detailedDescription: A detailed product description for buyers (max 500 characters)
- brand: The product brand or manufacturer. If uncertain, use "Unknown"
- category: The most appropriate marketplace category for this product
- color: Primary color(s) of the product
- condition: One of: new, like_new, good, fair, poor (based on visible wear)
- keywords: Array of relevant search keywords (max 10 items)
- estimatedWeightLb: Estimated shipping weight in pounds (number) including packaging materials. Be conservative (round up) to avoid underestimating shipping costs. This is an AI estimate only.
- estimatedLengthIn: Estimated packaged length in inches (number) including box/envelope. Be conservative (round up). This is an AI estimate only.
- estimatedWidthIn: Estimated packaged width in inches (number) including box/envelope. Be conservative (round up). This is an AI estimate only.
- estimatedHeightIn: Estimated packaged height in inches (number) including box/envelope. Be conservative (round up). This is an AI estimate only.
- confidence: "low" if the photo is unclear, low quality, or shows insufficient detail; "medium" for partial clarity; "high" for clear detailed photos

IMPORTANT:
- Return valid JSON only, no markdown, no explanation text
- Weight and dimensions are AI estimates — the seller must verify before publishing
- Do not make up details you cannot see in the image
- If brand is uncertain, return "Unknown"
- If the image is unclear or insufficient, set confidence to "low" and do your best with available info`;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Check for API key before doing anything else
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OpenAI API key is not configured' },
      { status: 503 },
    );
  }

  const session = await getServerSession(authOptions);
  const limit = await applyRateLimitAsync({
    request: req,
    key: 'ai:generate-listing',
    windowMs: 60 * 1000,
    max: 10,
    userId: session?.user?.id,
  });
  if (limit.limited) {
    return NextResponse.json(
      { error: 'Too many AI requests. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
      { status: 400 },
    );
  }

  const { imageUrl, imageUrls } = parsed.data;
  const resolvedUrls: string[] = imageUrls?.length
    ? imageUrls
    : imageUrl
      ? [imageUrl]
      : [];

  if (resolvedUrls.length === 0) {
    return NextResponse.json({ error: 'No valid image URLs provided.' }, { status: 400 });
  }

  // Build vision message content
  const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = resolvedUrls.map((url) => ({
    type: 'image_url',
    image_url: { url, detail: 'high' },
  }));

  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: 'Please analyze this product image and return a JSON object with the listing fields described in your instructions.',
    },
    ...imageContent,
  ];

  let rawAiJson: string;
  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
      temperature: 0.2,
    });

    rawAiJson = completion.choices[0]?.message?.content ?? '{}';
  } catch (err) {
    console.error('[ai/generate-listing] OpenAI error:', err);
    const message =
      err instanceof OpenAI.APIError
        ? `AI service error: ${err.message}`
        : 'Failed to connect to AI service. Please try again.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Parse and validate AI response
  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(rawAiJson);
  } catch {
    console.error('[ai/generate-listing] Failed to parse AI JSON:', rawAiJson);
    return NextResponse.json(
      { error: 'AI returned an unexpected response. Please try again.' },
      { status: 502 },
    );
  }

  // Sanitize with safe defaults via zod .catch()
  const validated = aiResponseSchema.parse(rawParsed);

  return NextResponse.json({ data: validated }, { status: 200 });
}
