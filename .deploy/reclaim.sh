#!/usr/bin/env bash
set -e
echo '=== before ==='
df -h /
echo

# Snap retains old revisions on disk indefinitely by default. Drop
# disabled (= retained-but-unused) revisions and cap future retention
# at 2. This is the same cleanup snap's own "snap-store" recommends
# and doesn't touch any service that's currently active.
echo '--- snap revisions to remove ---'
LANG=C snap list --all 2>/dev/null | awk '/disabled/{print $1, $3}' || true
LANG=C snap list --all 2>/dev/null | awk '/disabled/{print "snap remove", $1, "--revision=" $3}' | bash 2>&1 | tail -20 || true

snap set system refresh.retain=2 2>/dev/null || true

echo
echo '=== after ==='
df -h /
echo
echo '=== memory ==='
free -h
