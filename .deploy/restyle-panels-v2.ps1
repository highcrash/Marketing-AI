# Second restyle pass — catches the residual zinc/blue-mix classes
# the first script's regex order didn't reach.

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

$replacements = @(
  # The active toggle in CompletionsView filter chip
  @('bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900', 'bg-foreground text-background'),
  # "text-primary dark:text-red-400" left over — neon-blue handles both
  @('text-primary dark:text-red-400', 'text-destructive'),
  # Residual zinc text colours
  @('text-zinc-800 dark:text-zinc-200', 'text-foreground'),
  @('text-zinc-600 dark:text-zinc-300', 'text-foreground/80'),
  @('text-zinc-600 dark:text-zinc-200', 'text-foreground/80'),
  @('hover:text-zinc-800 dark:hover:text-zinc-200', 'hover:text-foreground'),
  @('dark:hover:text-zinc-200', ''),
  @('hover:text-zinc-600', 'hover:text-foreground'),
  @('hover:text-zinc-700 dark:hover:text-zinc-300', 'hover:text-foreground'),
  # Old hover states on connection picker
  @('hover:bg-blue-50 dark:hover:bg-blue-950/40', 'hover:bg-primary/10'),
  @('hover:bg-zinc-100 dark:hover:bg-zinc-900', 'hover:bg-muted'),
  @('hover:bg-zinc-50/50', 'hover:bg-secondary/40'),
  # CompletionsView SOURCE_BADGE — neutral light/dark mash
  @('bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', 'bg-emerald-950/40 text-emerald-300'),
  @('bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', 'bg-primary/15 text-primary'),
  @('bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', 'bg-amber-950/40 text-amber-300'),
  @('bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', 'bg-destructive/15 text-destructive'),
  @('bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300', 'bg-muted text-foreground'),
  @('bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400', 'bg-muted text-muted-foreground'),
  # Disabled button states
  @('disabled:bg-zinc-300 disabled:text-zinc-500', 'disabled:bg-muted disabled:text-muted-foreground'),
  # Stray
  @('text-muted-foreground hover:text-zinc-600', 'text-muted-foreground hover:text-foreground')
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
    Write-Host "v2 patched $file"
  }
}
