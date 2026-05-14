#!/usr/bin/env bash
# Install a nightly cron that snapshots /opt/marketing-ai/prisma/dev.db
# under /root/backups/marketing-ai/ with date-stamped filenames, retains
# the last 14 snapshots, and uses SQLite's .backup so writers aren't
# blocked. Idempotent — re-running just refreshes the cron + script.

set -euo pipefail

BACKUP_DIR=/root/backups/marketing-ai
BACKUP_SCRIPT=/usr/local/bin/marketing-ai-backup
DB_PATH=/opt/marketing-ai/prisma/dev.db
RETAIN=14

mkdir -p "$BACKUP_DIR"
chmod 700 /root/backups "$BACKUP_DIR"

# Make sure sqlite3 cli is available — it's what runs the online backup.
if ! command -v sqlite3 >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y sqlite3
fi

cat > "$BACKUP_SCRIPT" <<BACKUP
#!/usr/bin/env bash
# Online backup of the Marketing AI SQLite DB.
#
# Uses 'sqlite3 .backup' rather than cp so concurrent writers (the
# Next.js process) don't see a half-written snapshot. The output file
# is the same SQLite format as dev.db so restore is a simple cp.
set -euo pipefail
SRC=$DB_PATH
DEST_DIR=$BACKUP_DIR
RETAIN=$RETAIN
TS=\$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "\$DEST_DIR"
if [ ! -f "\$SRC" ]; then
  echo "[backup] source DB missing: \$SRC" >&2
  exit 1
fi
sqlite3 "\$SRC" ".backup '\$DEST_DIR/dev-\$TS.db'"
# Compress so 14 days fits comfortably even on tight disks.
gzip -f "\$DEST_DIR/dev-\$TS.db"
# Retention: keep the newest \$RETAIN .db.gz files; remove older ones.
ls -1t "\$DEST_DIR"/dev-*.db.gz 2>/dev/null | tail -n +\$((RETAIN + 1)) | xargs -r rm -f
BACKUP
chmod +x "$BACKUP_SCRIPT"

# Install cron at 02:30 UTC = 08:30 Asia/Dhaka (off-peak for a BD restaurant).
CRON_FILE=/etc/cron.d/marketing-ai-backup
cat > "$CRON_FILE" <<CRON
# Marketing AI nightly SQLite backup — runs as root, logs to syslog.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * root $BACKUP_SCRIPT >/dev/null 2>&1
CRON
chmod 644 "$CRON_FILE"

# Run once now so we have something on disk immediately.
"$BACKUP_SCRIPT"

echo '=== installed ==='
ls -la "$BACKUP_DIR"
echo
echo "Next scheduled fire: 02:30 UTC daily (cat $CRON_FILE)."
