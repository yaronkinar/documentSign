#!/bin/sh
set -eu

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required (e.g. s3://my-bucket/docflow)}"
: "${RETENTION_DAYS:=14}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="/tmp/docflow-${timestamp}.archive.gz"

echo "[$(date -u)] Dumping ${MONGODB_URI%%@*}@... -> ${archive}"
mongodump --uri="${MONGODB_URI}" --archive="${archive}" --gzip

aws_args=""
if [ -n "${S3_ENDPOINT:-}" ]; then
  aws_args="--endpoint-url=${S3_ENDPOINT}"
fi

echo "[$(date -u)] Uploading to ${BACKUP_BUCKET}/${timestamp}.archive.gz"
aws s3 cp "${archive}" "${BACKUP_BUCKET}/${timestamp}.archive.gz" ${aws_args}

rm -f "${archive}"

echo "[$(date -u)] Pruning backups older than ${RETENTION_DAYS} days"
cutoff="$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%dT%H%M%SZ)"
aws s3 ls "${BACKUP_BUCKET}/" ${aws_args} | awk '{print $4}' | grep -E '^[0-9]{8}T[0-9]{6}Z\.archive\.gz$' | while read -r name; do
  stamp="${name%%.archive.gz}"
  if [ "${stamp}" \< "${cutoff}" ]; then
    echo "[$(date -u)] Deleting old backup ${name}"
    aws s3 rm "${BACKUP_BUCKET}/${name}" ${aws_args}
  fi
done

echo "[$(date -u)] Backup complete."
