#!/usr/bin/env bash
set -e
ENV=/opt/marketing-ai/.env
ensure() {
  local k=$1
  local v=$2
  if grep -q "^${k}=" "$ENV"; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENV"
    echo "updated $k"
  else
    echo "${k}=${v}" >> "$ENV"
    echo "added $k"
  fi
}
ensure AUTH_TRUST_HOST true
ensure NEXTAUTH_URL https://ai.eatrobd.com
systemctl restart marketing-ai.service
sleep 2
systemctl is-active marketing-ai.service
