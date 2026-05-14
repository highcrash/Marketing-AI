'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface GenerationResult {
  publicPath: string;
  absoluteUrl: string | null;
  size: number;
  provider: string;
  model: string;
}

type AspectRatio = 'square' | 'portrait' | 'landscape';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Suggested-prompt seed — usually the draft piece's body text.
  /// The user is free to ignore / rewrite it.
  promptSeed?: string;
  /// What the user's planning to use the image for. Drives the
  /// default aspect ratio (reel = portrait, photo = square).
  intent?: 'photo' | 'reel';
  /// Called once with the FB-ready URL when the user clicks "Use this image".
  onPick: (url: string, publicPath: string) => void;
}

/// Wraps /api/images/generate. Returns 503 with a friendly message
/// when no provider is configured — we surface that here so the user
/// knows to set OPENAI_API_KEY (or similar) in the platform .env.
export function ImageGenerationDialog({ open, onOpenChange, promptSeed, intent = 'photo', onPick }: Props) {
  const [prompt, setPrompt] = useState(promptSeed ?? '');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    intent === 'reel' ? 'portrait' : 'square',
  );
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = prompt.trim();
    if (trimmed.length < 8) {
      setError('Prompt must be at least 8 characters');
      return;
    }
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed, aspectRatio }),
      });
      const body = (await res.json()) as
        | { image: GenerationResult }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setResult(body.image);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setGenerating(false);
    }
  }

  function pick() {
    if (!result) return;
    const url = result.absoluteUrl ?? result.publicPath;
    onPick(url, result.publicPath);
    onOpenChange(false);
    // Reset for next open
    setResult(null);
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Generate image with AI
          </DialogTitle>
          <DialogDescription>
            Describe the image you want. The result lands in /uploads/ and gets handed to
            Facebook&apos;s Graph fetcher when you click <span className="text-foreground">Use this image</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="img-prompt">Prompt</Label>
            <Textarea
              id="img-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              maxLength={4000}
              disabled={generating}
              placeholder="e.g. Photo of a cheesy meatbox on a wooden table at a dimly-lit restaurant, top-down view, warm lighting, food photography"
            />
            <p className="text-[10px] text-muted-foreground text-right">{prompt.length}/4000</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="img-ar">Aspect ratio</Label>
            <Select value={aspectRatio} onValueChange={(v: AspectRatio) => setAspectRatio(v)}>
              <SelectTrigger id="img-ar" disabled={generating}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="square">Square · 1024×1024 (Facebook post)</SelectItem>
                <SelectItem value="portrait">Portrait · 1024×1536 (Reels / Stories)</SelectItem>
                <SelectItem value="landscape">Landscape · 1536×1024 (link card)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <Alert variant={error.includes('No image-generation provider') ? 'warning' : 'destructive'}>
              <AlertTitle>
                {error.includes('No image-generation provider')
                  ? 'No provider configured'
                  : 'Generation failed'}
              </AlertTitle>
              <AlertDescription className="font-mono break-all text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="border border-border bg-card p-3 space-y-2">
              <img
                src={result.publicPath}
                alt="Generated"
                className="w-full max-h-96 object-contain bg-black"
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="font-mono">
                  {result.provider} · {result.model} · {(result.size / 1024).toFixed(0)} KB
                </span>
                {result.absoluteUrl && (
                  <a
                    href={result.absoluteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-accent"
                  >
                    <ExternalLink className="h-3 w-3" />
                    full size
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          {!result ? (
            <Button onClick={submit} disabled={generating || prompt.trim().length < 8}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          ) : (
            <Button onClick={pick}>Use this image</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
