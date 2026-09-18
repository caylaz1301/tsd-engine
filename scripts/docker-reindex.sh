#!/bin/sh
set -eu

docker compose exec backend python app/parsers/docx_parser.py samples
docker compose exec backend python app/parsers/sql_parser.py samples
docker compose exec backend python app/indexer/build_index.py

echo "Indeks selesai dibangun ulang."
