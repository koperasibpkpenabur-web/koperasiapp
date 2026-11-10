# PANDUAN STRUKTUR MODUL SISTEM AKSARA
*(Akses Sistem Administrasi Koperasi BPK PENABUR)*

Dokumen ini disusun sebagai **Peta Bagian (System Map)** agar Anda dapat mereferensikan bagian tertentu dengan cepat dan presisi saat ingin melakukan perbaikan atau penambahan fitur, tanpa khawatir merusak bagian sistem lainnya.

---

## 📌 Format Template Saat Mengajukan Perbaikan (Prompt Template)

Saat ada kendala atau perbaikan, Anda cukup memberikan instruksi dengan format seperti ini:

```text
Bagian / Part ID : [Tulis Kode Part, misal: KOPKAR-PESANAN]
Tab / Fitur       : [Contoh: Tab Pesanan Berjalan -> Modal Kirim Barang]
File Terkait      : [Contoh: src/pages/Kopkar/KopkarPesanan.tsx]
Masalah / Bug     : [Jelaskan apa yang salah / perilaku yang diharapkan]
Batasan           : Tolong fokus perbaiki di bagian ini saja, jangan ubah modul lain.
```

Dengan format di atas, AI assistant akan langsung mengunci perbaikan pada file dan logika terkait saja.

---

## 🗺️ Peta Lengkap Part & Modul Sistem

### 1. PONDASI & ROUTING (GATEWAY)
Bagian inti yang mengatur siapa yang boleh masuk dan halaman mana yang dibuka.

| Kode Part | Nama Bagian | File Utama | Deskripsi Singkat |
| :--- | :--- | :--- | :--- |
| **`AUTH-LOGIN`** | Autentikasi & Login | `src/pages/Auth/LoginPage.tsx`<br>`src/context/AuthContext.tsx` | Form login, validasi sesi, proteksi password, dan mode maintenance. |
| **`ROUTER-CORE`** | Jalur URL & Hak Akses | `src/routes/AppRoutes.tsx`<br>`src/components/auth/ProtectedRoute.tsx` | Pendaftaran seluruh rute URL, redirect awal, dan pembatasan akses role. |
| **`LAYOUT-NAV`** | Bingkai & Navigasi | `src/components/layout/Sidebar.tsx`<br>`src/components/layout/Topbar.tsx`<br>`src/components/layout/MainLayout.tsx` | Menu samping (sidebar), logo, header atas, tombol logout, toggle responsive mobile. |

---

### 2. MODUL KARYAWAN KOPERASI (`KOPKAR`)
Modul operasional harian tim koperasi.

| Kode Part | Nama Bagian | File Utama & Komponen | Deskripsi & Sub-Fitur |
| :--- | :--- | :--- | :--- |
| **`KOPKAR-DASHBOARD`** | Beranda Koperasi | `src/pages/Kopkar/KopkarDashboard.tsx` | Ringkasan kartu status: pesanan pending, cancel request, retur masuk. |
| **`KOPKAR-PESANAN`** | Manajemen Pesanan | `src/pages/Kopkar/KopkarPesanan.tsx`<br>↳ `src/pages/Kopkar/SuratJalanPrint.tsx` | **3 Tab Utama:**<br>1. *Pesanan Berjalan*: Setujui pesanan, kirim gudang/dropship vendor, pengiriman sebagian, tolak pesanan, cetak surat jalan.<br>2. *Pesanan Selesai*: Arsip pesanan yang telah diterima sekolah.<br>3. *Permohonan Pembatalan*: Konfirmasi pengajuan batal dari pihak sekolah. |
| **`KOPKAR-PELUNASAN`** | Keuangan & Tagihan | `src/pages/Kopkar/KopkarPelunasan.tsx`<br>↳ `src/pages/Kopkar/KwitansiPrint.tsx` | Cek bukti transfer dari sekolah, tandai lunas/belum lunas, status pencairan fee hak sekolah, cetak kwitansi pelunasan. |
| **`KOPKAR-BARANG`** | Master Barang & Stok | `src/pages/Kopkar/ItemManagement.tsx`<br>↳ `src/pages/Kopkar/ProductCatalog.tsx`<br>↳ `src/pages/Kopkar/StockManagement.tsx` | **2 Tab Utama:**<br>1. *Katalog & Harga*: Atur master barang, HPP Kopkar, Fee Sekolah, Harga Siswa, import Excel.<br>2. *Stok Gudang*: Ketersediaan stok fisik gudang koperasi, batas minimum stok, stok rusak. |
| **`KOPKAR-VENDOR`** | Manajemen Mitra & Produksi | `src/pages/Kopkar/VendorManagement.tsx`<br>↳ `src/pages/Kopkar/KopkarPrediksiProduksi.tsx`<br>↳ `src/pages/Kopkar/KopkarKalkulatorKain.tsx` | **5 Tab Utama:**<br>1. *Daftar Vendor*: Kontak & info penjahit/mitra.<br>2. *Plotting*: Alokasi vendor ke sekolah/jenis pakaian.<br>3. *Stok Vendor*: Stok barang yang ada di pihak penjahit.<br>4. *Prediksi Produksi*: Rencana kuota produksi seragam tahunan (unduh/unggah Excel template).<br>5. *Kalkulator Kain*: Hitung kebutuhan yard bahan kain per size chart. |
| **`KOPKAR-RETUR`** | Retur Barang Masuk | `src/pages/Kopkar/KopkarReturn.tsx`<br>↳ `src/utils/returnPdf.ts` | Konfirmasi pengajuan retur dari sekolah, verifikasi penerimaan fisik retur di gudang (restock atau barang rusak), cetak PDF retur. |
| **`KOPKAR-NOTIFIKASI`** | Pengumuman Sistem | `src/pages/Kopkar/KopkarNotifikasi.tsx`<br>`src/components/NotificationPopup.tsx` | Buat siaran pengumuman atau pesan pop-up ke sekolah (spesifik per jenjang atau per sekolah). |
| **`KOPKAR-REKAP`** | Rekapitulasi Data | `src/pages/Kopkar/KopkarRekap.tsx`<br>`src/utils/excelGenerator.ts` | Rekap omzet, total tagihan, fee sekolah, filter periode/jenjang/fase, ekspor Excel laporan. |

---

### 3. MODUL SEKOLAH & GURU OTS (`SCHOOL`)
Modul yang digunakan oleh pemesan (tata usaha sekolah atau guru).

| Kode Part | Nama Bagian | File Utama | Deskripsi & Sub-Fitur |
| :--- | :--- | :--- | :--- |
| **`SCHOOL-DASHBOARD`** | Beranda Sekolah | `src/pages/School/SchoolDashboard.tsx` | Statistik belanja sekolah, status pesanan aktif, pengumuman pop-up dari koperasi. |
| **`SCHOOL-PEMESANAN`** | Form Pesanan Sekolah | `src/pages/School/SchoolPemesanan.tsx` | Katalog pilih seragam & buku per jenjang/ukuran, pilih tahap pemesanan (Tahap 1, Tahap 2, Tambahan), konfirmasi penerimaan barang (full atau sebagian), ajukan pembatalan pesanan. |
| **`GURU-OTS-PEMESANAN`** | Pemesanan Cepat OTS | `src/pages/GuruOts/GuruOtsPemesanan.tsx` | Halaman khusus akun `guru_ots` untuk pemesanan instan langsung di tempat, input kuantiti cepat, cetak bukti langsung. |
| **`SCHOOL-PELUNASAN`** | Pelunasan Tagihan | `src/pages/School/SchoolPayment.tsx` | Cek tagihan pesanan yang belum lunas, upload bukti transfer pembayaran ke Google Drive Koperasi. |
| **`SCHOOL-RETUR`** | Pengajuan Retur | `src/pages/School/SchoolReturn.tsx` | Formulir retur barang rusak/salah ukuran ke koperasi, update pengiriman armada, cetak form retur PDF. |
| **`SCHOOL-REKAP`** | Rekap Riwayat Sekolah | `src/pages/School/SchoolRekap.tsx` | Arsip seluruh transaksi dan riwayat belanja sekolah yang bersangkutan. |

---

### 4. MODUL SUPER ADMIN (`ADMIN`)
Modul konfigurasi global dan master pengguna.

| Kode Part | Nama Bagian | File Utama | Deskripsi |
| :--- | :--- | :--- | :--- |
| **`ADMIN-DASHBOARD`** | Pengaturan Global | `src/pages/Admin/AdminDashboard.tsx` | Buka/tutup fase pemesanan (Tahap 1 & 2), integrasi Google Apps Script (Drive URL), reset pesanan per sekolah/keseluruhan, toggle maintenance mode. |
| **`ADMIN-USERS`** | Manajemen User | `src/pages/Admin/UserManagement.tsx` | Tambah/edit/hapus akun, reset password, atur role (`admin`, `kopkar`, `sekolah`, `pengurus`, `guru_ots`), atur jenjang sekolah (TK, SD, SMP, SMA, SPK). |

---

### 5. MODUL PENGURUS EKSEKUTIF (`PENGURUS`)
Modul monitoring kinerja bisnis.

| Kode Part | Nama Bagian | File Utama | Deskripsi |
| :--- | :--- | :--- | :--- |
| **`PENGURUS-DASHBOARD`**| Dashboard Eksekutif | `src/pages/Pengurus/PengurusDashboard.tsx` | Visualisasi grafik (Recharts): omzet per jenjang, status pembayaran, proporsi barang seragam vs buku, tren bulanan. |
| **`PENGURUS-VENDOR`** | Monitoring Vendor | `src/pages/Kopkar/VendorManagement.tsx` | Akses view perencanaan produksi dan mitra kerja koperasi. |

---

### 6. LAPISAN DATA & LOGIKA STATE (CONTEXT & DATABASE)
Pusat logika data yang menghubungkan tampilan depan dengan Supabase.

| Kode Part | Nama Bagian | File Utama | Tanggung Jawab |
| :--- | :--- | :--- | :--- |
| **`STATE-ORDER`** | Logika Pesanan | `src/context/OrderContext.tsx` | Fungsi `createOrder`, `approveOrder`, `shipOrder`, `receiveOrder`, `markOrderAsPaid`, dll. |
| **`STATE-PRODUCT`** | Logika Barang & Stok | `src/context/ProductContext.tsx` | Perubahan master barang, harga modal, harga jual, dan stok gudang. |
| **`STATE-RETURN`** | Logika Retur | `src/context/ReturnContext.tsx` | Alur siklus retur dari pengajuan hingga stok masuk gudang. |
| **`STATE-SETTINGS`** | Pengaturan Global | `src/context/SettingsContext.tsx` | Penyimpanan status Fase 1, Fase 2, dan link folder Google Drive. |
| **`DB-SUPABASE`** | Koneksi Database | `src/lib/supabase.ts` | Konfigurasi Supabase Client dan subscription realtime listener. |

---

## 🚀 Strategi Aman Menambahkan Fitur Baru Nanti

Saat Anda siap menambahkan fitur baru:
1. **Landing Page:**
   - Dibuat pada folder tersendiri: `src/pages/Landing/LandingPage.tsx`
   - Rutenya diatur di `AppRoutes.tsx` agar berada di URL `/` tanpa mengganggu alur sistem internal sekolah maupun koperasi.
2. **Fitur Pemesanan Seragam Baru (misal untuk siswa/orang tua/publik):**
   - Dibuat pada folder dan rute mandiri (misalnya `src/pages/UniformOrder/` atau `src/pages/PublicOrder/`).
   - Memakai tabel atau skema pesanan terisolasi atau terhubung ke master barang tanpa mengubah logic pesanan internal sekolah yang sudah ada (`SchoolPemesanan.tsx`).

