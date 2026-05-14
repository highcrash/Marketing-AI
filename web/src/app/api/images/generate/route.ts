import { NextResponse } from 'next/server';

import { listConfiguredProviders, pickProvider, type ImageGenerationParams } from '@/lib/ai/images';

export const dynamic = 'force-dynamic';
// Image generation can take 10-40s depending on model + size.
export const maxDuration = 120;

const VALID_AR: ReadonlySet<NonNullable<ImageGenerationParams['aspectRatio']>> = new Set([
  'square',
  'portrait',
  'landscape',
]);

interface PostBody {
  prompt?: unknown;
  aspectRatio?: unknown;
}

/// Discover whether any image provider is configured. Used by future
/// UI to grey out the "Generate image" button when no provider key
/// has been set yet.
export async function GET() {
  const providers = listConfiguredProviders();
  return NextResponse.json({
    configured: providers.length > 0,
    providers,
  });
}

export async function POST(req: Request) {
  const provider = pickProvider();
  if (!provider) {
    return NextResponse.json(
      {
        error: 'no_provider',
        message:
          'No image-generation provider configured. Set OPENAI_API_KEY (or another supported provider key) in the platform .env to enable.',
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 8) {
    return NextResponse.json(
      { error: 'bad_request', message: 'prompt must be at least 8 characters' },
      { status: 400 },
    );
  }
  if (prompt.length > 4000) {
    return NextResponse.json(
      { error: 'bad_request', message: 'prompt must be at most 4000 characters' },
      { status: 400 },
    );
  }
  const aspectRatio =
    typeof body.aspectRatio === 'string' && VALID_AR.has(body.aspectRatio as never)
      ? (body.aspectRatio as ImageGenerationParams['aspectRatio'])
      : undefined;

  try {
    const result = await provider.generate({ prompt, aspectRatio });
    return NextResponse.json({ image: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
