# TSD Engine REGLA

TSD Engine adalah mesin pencarian stored procedure dan pemeriksa kualitas
dokumen Technical Specification Document (TSD). Aplikasi menggabungkan isi
DOCX, script SQL, diagram hasil ekstraksi, lineage tabel, serta ringkasan AI
lokal melalui Ollama.

## Menjalankan dengan Docker

Prasyarat: Docker Desktop (macOS/Windows) atau Docker Engine dengan Compose
Plugin (Linux), RAM minimal 8 GB, dan ruang kosong minimal 10 GB.

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec ollama ollama pull llama3.2:3b
```

Buka alamat sesuai `APP_PORT` pada `.env` (konfigurasi proyek saat ini memakai
<http://localhost:3001>). API Swagger mengikuti `API_PORT`.

Halaman pertama adalah login. Kredensial pengelola dibaca dari
`TSD_AUTH_USERNAME` dan `TSD_AUTH_PASSWORD` pada `.env`; rahasia penandatanganan
sesi berada di `TSD_SESSION_SECRET`. Ganti ketiganya sebelum handover atau
deployment, dan gunakan `TSD_COOKIE_SECURE=true` bila aplikasi dilayani melalui
HTTPS.

Pada startup pertama, file `.docx` dan `.sql` di `backend/samples/` disalin ke
volume Docker lalu diparsing. Startup pertama dapat membutuhkan beberapa menit.
Setelah itu, pilih bank di header dan gunakan menu **Kelola sumber** untuk
mengunggah beberapa DOCX atau skrip SQL tanpa membuka source code. Upload admin
langsung memvalidasi format file, menyimpan sumber aktif, dan memperbarui indeks.
Quality checker tetap tersedia di Repository sebagai pemeriksaan terpisah; skrip
SQL hanya diparsing dan tidak pernah dijalankan ke server database bank.

Panduan lengkap:

- [Installation Guide](docs/INSTALLATION_GUIDE.md)
- [User Guide](docs/USER_GUIDE.md)
- [Arsitektur dan Data](docs/ARCHITECTURE.md)
- [Penyimpanan Data dan Handover](docs/DATA_STORAGE_AND_HANDOVER.md)
- [Arsitektur Multi-Bank](docs/MULTI_BANK_HANDOVER_ARCHITECTURE.md)

## Perintah Harian

```bash
docker compose up -d
docker compose ps
docker compose logs -f backend
docker compose stop
```

Untuk membangun ulang seluruh indeks setelah menambahkan script SQL ke volume:

```bash
sh scripts/docker-reindex.sh
```

Jangan menjalankan `docker compose down -v` pada lingkungan yang memiliki data
penting karena opsi `-v` menghapus seluruh volume persisten.
