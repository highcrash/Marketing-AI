import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/// shadcn's `cn` helper: merges class names AND resolves Tailwind
/// conflicts. Use this in every component instead of raw template
/// strings so variant + override classes work predictably.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
