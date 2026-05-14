#!/usr/bin/env bash
# Provision the droplet for Marketing AI:
# - Ensure /opt/marketing-ai exists with the right perms
# - Install missing apache modules + certbot's apache plugin
# - Enable apache mod_proxy / mod_proxy_http / mod_ssl
# - Write the apache vhost (will be HTTP only; certbot --apache then
#   bolts the TLS variant on)
# - Write the systemd service for the Next standalone server
#
# Idempotent: re-running fixes config without re-installing things.

set -euo pipefail

APP_DIR=/opt/marketing-ai
SERVER_NAME=ai.eatrobd.com

echo "=== ensuring app dir ==="
mkdir -p "$APP_DIR" "$APP_DIR/public" "$APP_DIR/prisma" "$APP_DIR/public/uploads"

echo "=== installing certbot apache plugin if missing ==="
if ! dpkg -s python3-certbot-apache >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y python3-certbot-apache
fi

echo "=== enabling apache modules ==="
a2enmod proxy proxy_http headers rewrite ssl >/dev/null

echo "=== writing apache vhost ==="
cat > /etc/apache2/sites-available/marketing-ai.conf <<APACHE
# Marketing AI — reverse proxy to Next.js standalone server on :3000
# certbot --apache adds the corresponding :443 vhost when SSL is issued.
<VirtualHost *:80>
    ServerName ${SERVER_NAME}
    ServerAdmin replyasik@gmail.com

    ProxyPreserveHost On
    ProxyRequests Off
    ProxyTimeout 120

    # Anything not handled by Apache locally proxies to the Next server.
    ProxyPass        /  http://127.0.0.1:3000/  retry=0
    ProxyPassReverse /  http://127.0.0.1:3000/

    # Larger client bodies for FB image / reel uploads (default is 1M).
    LimitRequestBody 209715200

    ErrorLog \${APACHE_LOG_DIR}/marketing-ai-error.log
    CustomLog \${APACHE_LOG_DIR}/marketing-ai-access.log combined
</VirtualHost>
APACHE

a2ensite marketing-ai.conf >/dev/null
apachectl configtest
systemctl reload apache2

echo "=== writing systemd unit ==="
cat > /etc/systemd/system/marketing-ai.service <<UNIT
[Unit]
Description=Marketing AI (Next.js standalone server)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable marketing-ai.service >/dev/null

echo "=== done ==="
echo "Next: scp the standalone tarball + .env, then systemctl start marketing-ai"
