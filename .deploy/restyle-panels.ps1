# Restyle the four big panel files to the new shadcn token palette.
# Source files are large and structurally correct; only the class
# tokens need swapping. This keeps the diff small and the risk low.

$ErrorActionPreference = 'Stop'

$files = @(
  'D:\Marketing AI\web\src\components\DraftView.tsx',
  'D:\Marketing AI\web\src\components\SegmentBlastPanel.tsx',
  'D:\Marketing AI\web\src\components\SchedulePanel.tsx',
  'D:\Marketing AI\web\src\components\FacebookPostPanel.tsx',
  'D:\Marketing AI\web\src\components\SchedulesView.tsx',
  'D:\Marketing AI\web\src\components\CompletionsView.tsx',
  'D:\Marketing AI\web\src\components\ConnectionsView.tsx',
  'D:\Marketing AI\web\src\components\HealthView.tsx'
)

# Ordered tuple list. Each pair = (search regex, replacement).
# Most-specific patterns FIRST so they don't get clobbered by broader
# ones later.
$replacements = @(
  # Cards / sections / containers
  @('bg-white dark:bg-zinc-950', 'bg-card'),
  @('bg-zinc-50 dark:bg-zinc-900', 'bg-secondary'),
  @('bg-zinc-50/40 dark:bg-zinc-900/30', 'bg-secondary/30'),
  @('bg-zinc-50/60 dark:bg-zinc-900/30', 'bg-secondary/40'),
  @('bg-zinc-100 dark:bg-zinc-900', 'bg-muted'),
  @('bg-zinc-200 dark:bg-zinc-800', 'bg-muted'),
  @('bg-zinc-100 dark:bg-zinc-800', 'bg-muted'),

  # Borders
  @('border-zinc-200 dark:border-zinc-800', 'border-border'),
  @('border-zinc-100 dark:border-zinc-900', 'border-border/60'),
  @('border-zinc-300 dark:border-zinc-700', 'border-border'),
  @('border-zinc-300 dark:border-zinc-800', 'border-border'),
  @('divide-zinc-100 dark:divide-zinc-900', 'divide-border'),

  # Text
  @('text-zinc-800 dark:text-zinc-200', 'text-foreground'),
  @('text-zinc-900 dark:text-zinc-100', 'text-foreground'),
  @('text-zinc-600 dark:text-zinc-400', 'text-muted-foreground'),
  @('text-zinc-700 dark:text-zinc-300', 'text-foreground/90'),
  @('text-zinc-500', 'text-muted-foreground'),
  @('text-zinc-400', 'text-muted-foreground/70'),
  @('placeholder:text-zinc-400', 'placeholder:text-muted-foreground/70'),

  # Brand red -> neon-blue primary
  @('bg-red-600 hover:bg-red-700', 'bg-primary hover:bg-accent'),
  @('bg-red-600', 'bg-primary'),
  @('text-red-600 hover:text-red-700', 'text-primary hover:text-accent'),
  @('hover:text-red-600', 'hover:text-primary'),
  @('hover:border-red-600', 'hover:border-primary'),
  @('focus:border-red-600', 'focus:border-primary'),
  @('text-red-600', 'text-primary'),
  @('border-red-300 dark:border-red-900', 'border-primary/40'),
  @('border-red-300 dark:border-red-800', 'border-primary/40'),
  @('bg-red-50/40 dark:bg-red-950/20', 'bg-primary/5'),
  @('bg-red-50 dark:bg-red-950', 'bg-destructive/10'),
  @('bg-red-50/40', 'bg-primary/5'),
  @('border-red-300', 'border-primary/40'),
  @('border-l-red-300 dark:border-l-red-800', 'border-l-primary/40'),
  @('text-red-700 dark:text-red-300', 'text-destructive'),
  @('text-red-600 dark:text-red-400', 'text-destructive'),
  @('disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800', 'disabled:bg-muted disabled:text-muted-foreground'),

  # Emerald accents (success)
  @('bg-emerald-600 hover:bg-emerald-700', 'bg-emerald-600 hover:bg-emerald-500'),
  @('bg-emerald-700 hover:bg-emerald-800', 'bg-emerald-700 hover:bg-emerald-600'),
  @('text-emerald-700 dark:text-emerald-300', 'text-emerald-400'),
  @('text-emerald-600 dark:text-emerald-400', 'text-emerald-400'),
  @('text-emerald-700 dark:text-emerald-400', 'text-emerald-400'),
  @('border-emerald-200 dark:border-emerald-900', 'border-emerald-900/60'),
  @('border-emerald-300 dark:border-emerald-900', 'border-emerald-900/60'),
  @('border-emerald-100 dark:border-emerald-950', 'border-emerald-950'),
  @('bg-emerald-50 dark:bg-emerald-950/40', 'bg-emerald-950/30'),
  @('bg-emerald-50/40 dark:bg-emerald-950/20', 'bg-emerald-950/20'),
  @('bg-emerald-50 dark:bg-emerald-950/30', 'bg-emerald-950/30'),
  @('bg-emerald-100 dark:bg-emerald-950', 'bg-emerald-950/40'),

  # Blue accents (info) — many already match neon blue but some need fixing
  @('bg-blue-600 hover:bg-blue-700', 'bg-primary hover:bg-accent'),
  @('hover:border-blue-600', 'hover:border-primary'),
  @('hover:text-blue-600', 'hover:text-primary'),
  @('text-blue-700 dark:text-blue-300', 'text-primary'),
  @('text-blue-700 dark:text-blue-400', 'text-primary'),
  @('text-blue-600 dark:text-blue-400', 'text-primary'),
  @('text-blue-600', 'text-primary'),
  @('border-blue-200 dark:border-blue-900', 'border-primary/40'),
  @('border-blue-100 dark:border-blue-950', 'border-primary/30'),
  @('bg-blue-50 dark:bg-blue-950/40', 'bg-primary/10'),
  @('bg-blue-50/40 dark:bg-blue-950/20', 'bg-primary/5'),
  @('bg-blue-100 dark:bg-blue-950', 'bg-primary/15'),

  # Amber (warning)
  @('text-amber-700 dark:text-amber-300', 'text-amber-300'),
  @('text-amber-700 dark:text-amber-400', 'text-amber-300'),
  @('text-amber-600 dark:text-amber-400', 'text-amber-400'),
  @('text-amber-600 dark:text-amber-500', 'text-amber-400'),
  @('border-amber-200 dark:border-amber-900', 'border-amber-900/60'),
  @('border-amber-300 dark:border-amber-800', 'border-amber-800'),
  @('bg-amber-50 dark:bg-amber-950/40', 'bg-amber-950/30'),
  @('bg-amber-50 dark:bg-amber-950', 'bg-amber-950/30'),
  @('bg-amber-100 dark:bg-amber-950', 'bg-amber-950/40')
)

foreach ($file in $files) {
  if (-not (Test-Path $file)) { continue }
  $orig = Get-Content $file -Raw
  $current = $orig
  foreach ($pair in $replacements) {
    $current = $current.Replace($pair[0], $pair[1])
  }
  if ($current -ne $orig) {
    Set-Content -Path $file -Value $current -NoNewline
    Write-Host "patched $file"
  } else {
    Write-Host "no-op  $file"
  }
}
