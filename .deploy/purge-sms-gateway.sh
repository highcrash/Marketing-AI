#!/usr/bin/env bash
# Remove the Android SMS Gateway (services + binary) per user request.
# Frees port 3000 for the Marketing AI app and ~47 MB of disk.

set -e

echo '=== stopping services ==='
for svc in sms-gateway sms-gateway-worker; do
  systemctl stop "$svc" 2>/dev/null || true
  systemctl disable "$svc" 2>/dev/null || true
done

echo '=== removing unit files ==='
rm -f /etc/systemd/system/sms-gateway.service \
      /etc/systemd/system/sms-gateway-worker.service \
      /etc/systemd/system/multi-user.target.wants/sms-gateway.service \
      /etc/systemd/system/multi-user.target.wants/sms-gateway-worker.service

systemctl daemon-reload

echo '=== removing /opt/sms-gateway ==='
if [ -d /opt/sms-gateway ]; then
  du -sh /opt/sms-gateway 2>/dev/null || true
  rm -rf /opt/sms-gateway
fi

echo '=== :3000 should be free now ==='
ss -tlnp 'sport = :3000' || true
echo
df -h /
