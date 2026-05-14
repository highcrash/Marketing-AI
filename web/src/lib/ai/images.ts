/**
 * Image generation provider abstraction.
 *
 * Different image-gen APIs (OpenAI gpt-image-1, Replicate, fal.ai
 * Flux, Stability) have wildly different request shapes, but the
 * platform only needs one thing from them: take a text prompt, return
 * an image we can save under /public/uploads/ and pass to Facebook.
 *
 * Adding a new provider means implementing `ImageProvider.generate`
 * and adding it to `pickProvider`.
 *
 * Currently implemented:
 *   - openai (set OPENAI_API_KEY)
 *
 * To add later:
 *   - replicate, fal, stability, etc.
 */

import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export interface ImageProviderResult {
  /// Public path (/uploads/<sha>.png).
  publicPath: string;
  absoluteUrl: string | null;
  size: number;
  /// Provider that fulfilled the request, surfaced for cost tracking.
  provider: string;
  /// Provider-side model id (e.g. 'gpt-image-1', 'flux-pro-1.1') for
  /// audit + future cost estimation.
  model: string;
}

export interface ImageGenerationParams {
  prompt: string;
  /// Optional aspect-ratio hint. Providers map this to their nearest
  /// supported dimension. Unspecified = the provider's default.
  aspectRatio?: 'square' | 'portrait' | 'landscape';
}

export interface ImageProvider {
  name: string;
  isConfigured(): boolean;
  generate(params: ImageGenerationParams): Promise<ImageProviderResult>;
}

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');

async function saveImage(provider: string, model: string, bytes: Buffer): Promise<ImageProviderResult> {
  const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  const ext = 'png';
  await mkdir(UPLOAD_ROOT, { recursive: true });
  const dest = path.join(UPLOAD_ROOT, `${sha}.${ext}`);
  await writeFile(dest, bytes);
  const publicPath = `/uploads/${sha}.${ext}`;
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  return {
    publicPath,
    absoluteUrl: base ? `${base}${publicPath}` : null,
    size: bytes.length,
    provider,
    model,
  };
}

class OpenAIProvider implements ImageProvider {
  name = 'openai';
  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }
  async generate(params: ImageGenerationParams): Promise<ImageProviderResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');
    const model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';
    const size =
      params.aspectRatio === 'portrait'
        ? '1024x1536'
        : params.aspectRatio === 'landscape'
        ? '1536x1024'
        : '1024x1024';
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: params.prompt,
        size,
        n: 1,
      }),
    });
    const body = (await res.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string };
    };
    if (!res.ok || body.error) {
      throw new Error(body.error?.message ?? `OpenAI HTTP ${res.status}`);
    }
    const first = body.data?.[0];
    if (!first) throw new Error('OpenAI response had no images');
    let bytes: Buffer;
    if (first.b64_json) {
      bytes = Buffer.from(first.b64_json, 'base64');
    } else if (first.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) throw new Error(`Image fetch failed: HTTP ${imgRes.status}`);
      bytes = Buffer.from(await imgRes.arrayBuffer());
    } else {
      throw new Error('OpenAI response had no b64_json or url field');
    }
    return saveImage(this.name, model, bytes);
  }
}

const PROVIDERS: ImageProvider[] = [new OpenAIProvider()];

/// Pick the first configured provider, with optional override via the
/// IMAGE_PROVIDER env var (e.g. 'openai').
export function pickProvider(): ImageProvider | null {
  const preferred = process.env.IMAGE_PROVIDER;
  if (preferred) {
    const found = PROVIDERS.find((p) => p.name === preferred);
    if (found && found.isConfigured()) return found;
  }
  for (const p of PROVIDERS) {
    if (p.isConfigured()) return p;
  }
  return null;
}

export function listConfiguredProviders(): string[] {
  return PROVIDERS.filter((p) => p.isConfigured()).map((p) => p.name);
}
