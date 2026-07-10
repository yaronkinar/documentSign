#!/bin/sh
set -eu

# cron jobs start with a minimal environment, so persist the container's
# runtime env vars (Railway injects these at startup) for the cron job to source.
printenv | grep -v '^_=' > /app/cron.env

echo "0 3 * * * root . /app/cron.env; /app/backup.sh >> /var/log/backup.log 2>&1" > /etc/cron.d/mongo-backup
chmod 0644 /etc/cron.d/mongo-backup
touch /var/log/backup.log

echo "[$(date -u)] Running initial backup on startup to verify the pipeline..."
/app/backup.sh 2>&1 | tee -a /var/log/backup.log

echo "[$(date -u)] Starting cron — nightly backups at 03:00 UTC"
cron -f &
tail -f /var/log/backup.log
