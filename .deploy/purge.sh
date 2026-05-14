#!/usr/bin/env bash
# Reclaim disk per user direction: remove chromium snap (+ its
# GNOME/mesa/gtk theme dependencies) and the unused /opt/wa-bot
# install. Keeps sms-gateway, mysql, apache untouched.

set -e

echo '=== before ==='
df -h /

echo
echo '=== removing chromium + GUI snaps that only existed for it ==='
for snap in chromium cups gnome-46-2404 mesa-2404 gtk-common-themes; do
  if snap list "$snap" >/dev/null 2>&1; then
    echo "removing $snap"
    snap remove --purge "$snap" 2>&1 | tail -2 || true
  fi
done

echo
echo '=== removing /opt/wa-bot (user authorized) ==='
if [ -d /opt/wa-bot ]; then
  du -sh /opt/wa-bot 2>/dev/null || true
  rm -rf /opt/wa-bot
fi

echo
echo '=== after ==='
df -h /
free -h
