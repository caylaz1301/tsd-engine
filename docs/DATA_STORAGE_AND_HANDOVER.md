# Penyimpanan Data dan Handover TSD Engine

Dokumen ini menjelaskan kondisi implementasi yang berjalan setelah fitur
multi-bank dan pengelolaan sumber melalui web ditambahkan.

## 1. Komponen Penyimpanan

TSD Engine tidak terhubung ke SQL Server bank. File DOCX dan `.sql` adalah
sumber yang dibaca oleh parser. Hasil parsing disimpan ke indeks SQLite FTS5
agar pencarian cepat.

| Data | Lokasi di container | Persistensi |
| --- | --- | --- |
| DOCX dan SQL lama SCB | `/app/samples` | volume `tsd_samples` |
| DOCX/SQL DBS dan SMBCI | `/app/storage/banks/<BANK>/` | volume `tsd_storage` |
| Indeks pencarian | `/app/storage/tsd_index.db` | volume `tsd_storage` |
| Registry, hasil checker, diagram, PDF | `/app/storage/` | volume `tsd_storage` |
| Model AI lokal | `/root/.ollama` | volume `ollama_data` |
| Data ONLYOFFICE | direktori layanan ONLYOFFICE | volume `onlyoffice_data` |

Upload melalui web masuk ke Docker volume. File tersebut tidak masuk ke Git
dan tidak hilang ketika container dibuat ulang selama volume tidak dihapus.

## 2. Isolasi Bank

Bank yang didukung adalah `SCB`, `DBS`, dan `SMBCI`.

- Pilihan bank di header menjadi konteks seluruh aplikasi.
- DOCX, SQL, registry, hasil parsing, dan PDF bank baru memiliki direktori bank.
- Setiap record SQLite memiliki kolom `bank`.
- Kunci stored procedure memakai namespace internal `<bank>::<nama_sp>`.
- Nama file atau nama SP yang sama pada dua bank tidak saling mengganti.
- DBS dan SMBCI tetap kosong sampai sumbernya diunggah melalui web.

SCB mempertahankan lokasi volume lama untuk kompatibilitas. Identitas SCB tetap
ditambahkan pada indeks sehingga kueri dan relasinya terisolasi secara logis.

## 3. Alur Data

### Dokumen TSD

1. Pengelola memilih bank pada header.
2. Buka **Kelola sumber > Dokumen TSD**.
3. Pilih beberapa DOCX.
4. Sistem memvalidasi format dan ukuran setiap file tanpa menjalankan quality checker.
5. DOCX langsung disimpan ke sumber aktif bank terpilih, diparse, lalu indeks dibangun
   ulang secara atomik dari semua sumber aktif.
6. Gunakan quality checker di Repository bila dokumen perlu diperiksa terhadap
   standar isi; hasil checker tidak menjadi syarat upload admin.

### Skrip SQL

1. Pengelola memilih bank pada header.
2. Buka **Kelola sumber > Skrip SQL**.
3. Pilih beberapa file `.sql`.
4. Parser memvalidasi encoding dan membaca `CREATE/ALTER PROCEDURE`, tabel
   sumber, tabel tujuan, parameter, dan salinan arsip.
5. Skrip tidak pernah dieksekusi ke SQL Server.
6. Sumber yang valid disimpan pada bank terpilih dan indeks diperbarui.

## 4. Backup Wajib

Backup minimum untuk handover:

- `tsd_samples`
- `tsd_storage`
- `ollama_data` bila model tidak ingin diunduh ulang
- `onlyoffice_data` bila konfigurasi editor perlu dipertahankan

Jalankan backup ketika tidak ada upload atau proses edit aktif. Untuk snapshot
yang konsisten, hentikan layanan aplikasi terlebih dahulu:

```bash
docker compose stop frontend backend documentserver ollama
```

Gunakan prosedur backup volume pada Installation Guide, kemudian hidupkan lagi:

```bash
docker compose start ollama documentserver backend frontend
```

Jangan hanya menyalin `tsd_index.db`. Database tersebut adalah indeks turunan;
sumber DOCX, SQL, registry, serta hasil checker tetap diperlukan untuk restore
dan pembangunan ulang.

## 5. Batasan Operasional

SQLite sesuai untuk satu instalasi internal dengan jumlah pengelola terbatas.
Jika aplikasi dibuka untuk banyak pengguna bersamaan, pindahkan metadata,
antrean pekerjaan, audit log, dan autentikasi ke PostgreSQL. File sumber tetap
lebih tepat disimpan di object storage atau file storage perusahaan, sedangkan
PostgreSQL menyimpan metadata dan statusnya.

Implementasi saat ini menyediakan satu akun pengelola dari `.env`, sesi cookie
HTTP-only bertanda tangan, dan masa sesi delapan jam. Sebelum akses diperluas ke
jaringan kantor, integrasikan login perusahaan dan dua peran: pembaca serta
pengelola. Login lokal belum menyediakan SSO, manajemen banyak pengguna, maupun
audit trail. Jangan membuka port backend langsung ke jaringan publik.

## 6. Checklist Serah Terima

- Repository Git dapat di-clone dan image Docker dapat ditarik.
- Backup volume terbaru berhasil direstore pada mesin uji.
- Halaman SCB menampilkan data lama.
- DBS dan SMBCI kosong sebelum upload.
- Upload DOCX valid melalui Kelola Sumber muncul di repository bank yang benar.
- Quality checker tetap menghasilkan laporan dan hanya menawarkan aktivasi pada skor 100%.
- Upload SQL memengaruhi pencarian bank yang benar saja.
- Nama file dan nama SP yang sama diuji pada dua bank tanpa bentrok.
- Backup setelah uji upload berhasil dibuat dan direstore.
