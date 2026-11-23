-- ==============================================================================
-- KANVAS PENABUR & AKSARA - FIX WORKFLOW, SSOT PRODUK & LOGIN GOOGLE
-- Jalankan skrip ini langsung di Supabase SQL Editor (fxyssksvbuxnbthfrpzy)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABEL KHUSUS AKUN WALI MURID (public.parent_accounts)
-- Memisahkan profil orang tua & siswa dari tabel transaksi pesanan (parent_orders)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  phone text,
  full_name text NOT NULL,
  students jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_student_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index pada email (case-insensitive) agar aman di-upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_accounts_email_lower 
  ON public.parent_accounts (lower(trim(email))) 
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_parent_accounts_phone 
  ON public.parent_accounts (phone);

-- RLS untuk parent_accounts: Izinkan akses public & authenticated
ALTER TABLE public.parent_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_accounts_select_all" ON public.parent_accounts;
CREATE POLICY "parent_accounts_select_all" ON public.parent_accounts
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "parent_accounts_insert_all" ON public.parent_accounts;
CREATE POLICY "parent_accounts_insert_all" ON public.parent_accounts
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "parent_accounts_update_all" ON public.parent_accounts;
CREATE POLICY "parent_accounts_update_all" ON public.parent_accounts
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Daftarkan akun Google Pak Agung (stephanus.agung21@gmail.com) jika belum ada
INSERT INTO public.parent_accounts (
  email,
  phone,
  full_name,
  active_student_id,
  students
)
VALUES (
  'stephanus.agung21@gmail.com',
  '081234567890',
  'Stephanus Agung',
  'std-1',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'std-1',
      'name', 'Siswa BPK PENABUR',
      'school', 'SMPK 1 PENABUR',
      'level', 'SMP',
      'grade', 'Kelas 7',
      'studentType', 'luar'
    )
  )
)
ON CONFLICT ((lower(trim(email)))) WHERE email IS NOT NULL AND email <> ''
DO UPDATE SET
  full_name = EXCLUDED.full_name,
  updated_at = now();

-- ------------------------------------------------------------------------------
-- 2. PERBAIKI TABEL NOTIFIKASI & TRIGGER PESANAN (Menghindari Gagal Checkout)
-- Menambahkan kolom role, school_name, type, is_read ke public.notifications
-- ------------------------------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS school_name text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

-- Perbaiki fungsi trigger notify_school_on_parent_order agar aman dan tidak membatalkan checkout
CREATE OR REPLACE FUNCTION public.notify_school_on_parent_order()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO public.notifications (
      role,
      school_name,
      title,
      message,
      type,
      is_read,
      created_at
    ) VALUES (
      'sekolah',
      NEW.school_name,
      'Pesanan Seragam Baru Masuk',
      'Pesanan baru #' || NEW.id || ' dari wali murid ' || COALESCE(NEW.parent_name, 'Orang Tua') || ' untuk siswa ' || COALESCE(NEW.student_name, '-') || ' (' || COALESCE(NEW.school_name, '-') || ').',
      'parent_order',
      false,
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Safeguard: jangan biarkan kendala notifikasi menggagalkan checkout pesanan orang tua
    RAISE WARNING 'Gagal membuat notifikasi otomatis: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 3. BUKA AKSES SSOT PRODUK UNTUK KATALOG KANVAS PENABUR
-- Izinkan role anon membaca produk & tandai seragam aktif di Kanvas
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "products_select_public" ON public.products;
CREATE POLICY "products_select_public" ON public.products
  FOR SELECT TO anon, authenticated
  USING (true);

-- Aktifkan semua seragam agar terbaca oleh Kanvas PENABUR
UPDATE public.products
SET is_kanvas_active = true
WHERE is_kanvas_active IS NULL OR is_kanvas_active = false;

-- ------------------------------------------------------------------------------
-- 4. BUKA AKSES TRANSAKSI PESANAN ORANG TUA (parent_orders & parent_order_items)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "parent_orders_insert_public" ON public.parent_orders;
CREATE POLICY "parent_orders_insert_public" ON public.parent_orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "parent_orders_select_public" ON public.parent_orders;
CREATE POLICY "parent_orders_select_public" ON public.parent_orders
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "parent_order_items_insert_public" ON public.parent_order_items;
CREATE POLICY "parent_order_items_insert_public" ON public.parent_order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "parent_order_items_select_public" ON public.parent_order_items;
CREATE POLICY "parent_order_items_select_public" ON public.parent_order_items
  FOR SELECT TO anon, authenticated
  USING (true);

-- ------------------------------------------------------------------------------
-- 5. BUKA AKSES DAFTAR SEKOLAH (school_whitelist) UNTUK DROPDOWN REGISTRASI
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "school_whitelist_select_public" ON public.school_whitelist;
CREATE POLICY "school_whitelist_select_public" ON public.school_whitelist
  FOR SELECT TO anon, authenticated
  USING (true);
