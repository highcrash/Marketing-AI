import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Marketing AI",
  description:
    "AI marketing analyst — pulls business data from a connected POS endpoint and produces grounded, prioritized recommendations.",
};

// System font stack — was Geist via next/font/google, but the
// build-time fetch to fonts.googleapis.com is flaky from some
// networks and was blocking deploys. The CSS variables keep the same
// names so the rest of the app (tailwind theme + .geist_mono utility
// usage) doesn't need a change.
const fontVariables = {
  '--font-geist-sans':
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  '--font-geist-mono':
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
} as React.CSSProperties;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased" style={fontVariables}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
