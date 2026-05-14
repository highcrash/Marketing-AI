/**
 * Local file uploads for FB photo + Reels publishing.
 *
 * We accept image/video binaries from the browser, write them under
 * /public/uploads/<sha>.<ext>, and return a URL the FB Graph API can
 * fetch from. The file's SHA-256 is its name so re-uploading the same
 * asset is idempotent and we never burn disk on duplicates.
 *
 * Important constraint: Graph fetches the URL from FB's servers, so
 * the URL must be reachable from the public internet. In local dev
 * that means the platform's PUBLIC_BASE_URL env var has to point at a
 * tunnel (ngrok / cloudflared / Vercel preview). When unset we still
 * accept the upload — the user can then either run a tunnel or paste
 * a remote URL manually.
 */

import { createHash } from 'crypto';
import { mkdir, writeFile, stat } from 'fs/promises';
import path from 'path';

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const VIDEO_EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB — comfortable for FB photo posts
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB — Reels limit is higher but local-dev tunnels usually choke past this

export interface SavedUpload {
  /// SHA-256 of the file contents — also the filename stem.
  sha: string;
  /// Extension chosen from the MIME type (jpg / png / mp4 / …).
  ext: string;
  /// Bytes written.
  size: number;
  /// Path relative to /public — what the browser would request.
  /// Example: /uploads/abc123.jpg
  publicPath: string;
  /// Absolute URL Graph can fetch. Built from PUBLIC_BASE_URL when set;
  /// otherwise the relative public path (caller must combine with a
  /// real origin before sending to FB).
  absoluteUrl: string | null;
  kind: 'image' | 'video';
}

export async function saveUpload(file: File): Promise<SavedUpload> {
  const mime = file.type.toLowerCase();
  const imageExt = IMAGE_EXT_BY_MIME[mime];
  const videoExt = VIDEO_EXT_BY_MIME[mime];
  if (!imageExt && !videoExt) {
    throw new Error(`Unsupported MIME type: ${mime || '(empty)'}`);
  }
  const kind: 'image' | 'video' = imageExt ? 'image' : 'video';
  const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > maxBytes) {
    throw new Error(
      `${kind} too large: ${file.size} bytes (max ${maxBytes})`,
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex').slice(0, 32);
  const ext = (imageExt ?? videoExt) as string;
  await mkdir(UPLOAD_ROOT, { recursive: true });
  const dest = path.join(UPLOAD_ROOT, `${sha}.${ext}`);
  try {
    const existing = await stat(dest);
    if (existing.size === buf.length) {
      // Same content already on disk — skip re-writing.
      return buildResult(sha, ext, buf.length, kind);
    }
  } catch {
    // file doesn't exist — proceed to write
  }
  await writeFile(dest, buf);
  return buildResult(sha, ext, buf.length, kind);
}

function buildResult(
  sha: string,
  ext: string,
  size: number,
  kind: 'image' | 'video',
): SavedUpload {
  const publicPath = `/uploads/${sha}.${ext}`;
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  const absoluteUrl = base ? `${base}${publicPath}` : null;
  return { sha, ext, size, publicPath, absoluteUrl, kind };
}
