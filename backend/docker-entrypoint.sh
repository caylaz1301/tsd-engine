#!/bin/sh
set -eu

mkdir -p \
  /app/samples \
  /app/storage/images \
  /app/storage/parsed/sql \
  /app/storage/documents/inactive \
  /app/storage/documents/pdf \
  /app/storage/quality/reports \
  /app/storage/quality/staging

# Import sumber lokal hanya pada volume baru. Dokumen yang kemudian dihapus
# lewat aplikasi tidak akan muncul kembali saat container dimulai ulang.
if [ ! -f /app/storage/.docker-initialized ]; then
  if [ -d /seed ]; then
    find /seed -maxdepth 1 -type f \( -name '*.docx' -o -name '*.sql' \) \
      -exec cp -n '{}' /app/samples/ \;
  fi

  if find /app/samples -maxdepth 1 -type f -name '*.docx' | grep -q .; then
    python app/parsers/docx_parser.py samples
  fi
  if find /app/samples -maxdepth 1 -type f -name '*.sql' | grep -q .; then
    python app/parsers/sql_parser.py samples
  fi
  if find /app/storage/parsed -type f -name '*.json' | grep -q .; then
    python app/indexer/build_index.py
  fi
  touch /app/storage/.docker-initialized
fi

# Indeks lama pada volume persisten belum memiliki status diagram per TSD.
# Parse ulang sumber aktif satu kali setelah versi aplikasi ini terpasang.
if [ ! -f /app/storage/.diagram-status-v1 ]; then
  if [ -f /app/storage/.docker-initialized ] && \
     find /app/samples -maxdepth 1 -type f -name '*.docx' | grep -q .; then
    python app/parsers/docx_parser.py samples
  fi
  if find /app/storage/parsed -type f -name '*.json' | grep -q .; then
    python app/indexer/build_index.py
  fi
  touch /app/storage/.diagram-status-v1
fi

exec "$@"
