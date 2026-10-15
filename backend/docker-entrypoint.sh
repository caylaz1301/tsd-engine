#!/bin/sh
set -eu

mkdir -p \
  /app/samples \
  /app/storage/images \
  /app/storage/parsed/sql \
  /app/storage/documents/inactive \
  /app/storage/documents/pdf \
  /app/storage/quality/reports \
  /app/storage/quality/staging \
  /app/storage/banks/DBS/documents/active \
  /app/storage/banks/DBS/documents/inactive \
  /app/storage/banks/DBS/sql/active \
  /app/storage/banks/DBS/parsed/documents \
  /app/storage/banks/DBS/parsed/sql \
  /app/storage/banks/SMBCI/documents/active \
  /app/storage/banks/SMBCI/documents/inactive \
  /app/storage/banks/SMBCI/sql/active \
  /app/storage/banks/SMBCI/parsed/documents \
  /app/storage/banks/SMBCI/parsed/sql

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
    python -m app.indexer.build_index
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
    python -m app.indexer.build_index
  fi
  touch /app/storage/.diagram-status-v1
fi

# Tambahkan metadata bank ke indeks lama tanpa menghapus dokumen atau laporan.
if [ ! -f /app/storage/.bank-metadata-v1 ]; then
  if find /app/storage/parsed -type f -name '*.json' | grep -q .; then
    python -m app.indexer.build_index
  fi
  touch /app/storage/.bank-metadata-v1
fi

# Sumber yang sudah ada pada instalasi ini berasal dari SCB.
if [ ! -f /app/storage/.bank-scb-v1 ]; then
  python -m app.indexer.migrate_legacy_scb
  if find /app/storage/parsed -maxdepth 1 -type f -name '*.json' | grep -q .; then
    python -m app.indexer.build_index
  fi
  touch /app/storage/.bank-scb-v1
fi

# Skema v2 memberi namespace bank pada dokumen, SQL, dan stored procedure.
# File sumber tidak dipindahkan; indeks turunan aman untuk dibangun ulang.
if [ ! -f /app/storage/.multi-bank-index-v2 ]; then
  if find /app/storage/parsed /app/storage/banks -type f -name '*.json' 2>/dev/null | grep -q .; then
    python -m app.indexer.build_index
  fi
  touch /app/storage/.multi-bank-index-v2
fi

exec "$@"
