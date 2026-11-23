#!/bin/sh
# Nightly copy of the booking database, kept 30 days in nk/backups (outside the web folder). Run by a scheduled job on the hosting.
# Restore one:  gunzip -c backups/nk-YYYYMMDD-HHMM.sql.gz | mysql --defaults-extra-file=nk.cnf u892030622_nk
cd "$(dirname "$0")/.." || exit 1
umask 077
mkdir -p backups
f="backups/nk-$(date +%Y%m%d-%H%M).sql"
if mysqldump --defaults-extra-file=nk.cnf --single-transaction --no-tablespaces --default-character-set=utf8mb4 u892030622_nk > "$f" && [ -s "$f" ] && tail -1 "$f" | grep -q 'Dump completed'; then
  gzip -f "$f"
  find backups -name 'nk-*.sql.gz' -mtime +30 -delete
  echo "backup ok: $f.gz"
else
  rm -f "$f"; echo "backup FAILED" >&2; exit 1
fi
