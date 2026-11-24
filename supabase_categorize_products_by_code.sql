-- =========================================================================
-- SQL MIGRATION: KATEGORISASI DAN TIPE PRODUK BERDASARKAN KODE SSOT BPK PENABUR
-- =========================================================================
-- Standar Kode BPK PENABUR:
-- A-SRG  -> Tipe: SRG, Kategori: Seragam      (Total: 1.407 produk)
-- B-KAK  -> Tipe: KAK, Kategori: Kaos Kaki    (Total:    62 produk)
-- C-PLK  -> Tipe: PLK, Kategori: Perlengkapan (Total:    39 produk)
-- D-TP   -> Tipe: TP,  Kategori: Topi         (Total:    17 produk)
-- E-BK   -> Tipe: BK,  Kategori: Buku         (Total:     9 produk)
-- Total Terkualifikasi: 1.534 Produk (100% Sesuai)
-- =========================================================================

-- 1. Tambahkan kolom type jika belum ada
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS type text;

-- 2. Update Tipe dan Kategori: Seragam (SRG)
UPDATE public.products
SET type = 'SRG', category = 'Seragam'
WHERE code LIKE '%SRG%' OR code LIKE 'A-%';

-- 3. Update Tipe dan Kategori: Kaos Kaki (KAK)
UPDATE public.products
SET type = 'KAK', category = 'Kaos Kaki'
WHERE code LIKE '%KAK%' OR code LIKE 'B-%';

-- 4. Update Tipe dan Kategori: Perlengkapan (PLK)
UPDATE public.products
SET type = 'PLK', category = 'Perlengkapan'
WHERE code LIKE '%PLK%' OR code LIKE 'C-%';

-- 5. Update Tipe dan Kategori: Topi (TP)
UPDATE public.products
SET type = 'TP', category = 'Topi'
WHERE code LIKE '%TP%' OR code LIKE 'D-%';

-- 6. Update Tipe dan Kategori: Buku (BK)
UPDATE public.products
SET type = 'BK', category = 'Buku'
WHERE code LIKE '%BK%' OR code LIKE 'E-%';

-- 7. Verifikasi Rekapitulasi Hasil Update
SELECT 
  COALESCE(type, '-') AS type,
  COALESCE(category, '-') AS category,
  COUNT(*) AS total_produk,
  MIN(code) AS contoh_kode_min,
  MAX(code) AS contoh_kode_max
FROM public.products
GROUP BY type, category
ORDER BY total_produk DESC;
