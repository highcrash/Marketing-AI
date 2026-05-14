/// Local Facebook glyph. lucide-react removed brand logos in recent
/// versions for trademark reasons, so we ship our own minimal SVG that
/// follows the same `size` / `className` API used elsewhere.
export function FacebookIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 12a10 10 0 1 0-11.563 9.875v-6.987H7.898V12h2.539V9.797c0-2.506 1.493-3.89 3.776-3.89 1.094 0 2.238.195 2.238.195v2.461h-1.26c-1.243 0-1.63.771-1.63 1.563V12h2.773l-.443 2.888h-2.33v6.987A10.002 10.002 0 0 0 22 12z" />
    </svg>
  );
}
