import { NextResponse } from 'next/server';

import { saveUpload } from '@/lib/uploads';

export const dynamic = 'force-dynamic';
// File body — keep the route at the Node runtime, not Edge.
export const runtime = 'nodejs';

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'multipart/form-data with a "file" field expected' },
      { status: 400 },
    );
  }
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'bad_request', message: 'file field missing or not a File' },
      { status: 400 },
    );
  }
  try {
    const saved = await saveUpload(file);
    return NextResponse.json({ upload: saved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'upload_failed', message }, { status: 400 });
  }
}
