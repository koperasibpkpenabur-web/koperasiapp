-- ==============================================================================
-- KANVAS PENABUR & AKSARA: PERBAIKAN RLS & SINKRONISASI STATUS PESANAN ORANG TUA
-- Jalankan skrip ini langsung di Supabase SQL Editor (fxyssksvbuxnbthfrpzy)
-- ==============================================================================

-- 1. Tambahkan kolom pelacakan status serah terima di tabel public.parent_orders
ALTER TABLE public.parent_orders 
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_by text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by text,
  ADD COLUMN IF NOT EXISTS pickup_notes text,
  ADD COLUMN IF NOT EXISTS school_notes text;

-- 2. Pastikan izin UPDATE (RLS) terbuka untuk parent_orders
-- Ini memungkinkan staf sekolah di Aksara mengupdate status ('processing', 'ready_for_pickup', 'completed')
ALTER TABLE public.parent_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_orders_update_all" ON public.parent_orders;
CREATE POLICY "parent_orders_update_all" ON public.parent_orders
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Pastikan izin UPDATE untuk parent_order_items jika sewaktu-waktu ada penyesuaian item
ALTER TABLE public.parent_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_order_items_update_all" ON public.parent_order_items;
CREATE POLICY "parent_order_items_update_all" ON public.parent_order_items
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Index performa tinggi untuk pencarian pesanan berdasarkan sekolah dan status
CREATE INDEX IF NOT EXISTS idx_parent_orders_school_status 
  ON public.parent_orders (school_name, status);

CREATE INDEX IF NOT EXISTS idx_parent_orders_created_at 
  ON public.parent_orders (created_at DESC);

-- 5. Verifikasi izin RLS pada parent_orders
SELECT 
  tablename, 
  policyname, 
  cmd, 
  roles 
FROM pg_policies 
WHERE tablename IN ('parent_orders', 'parent_order_items');
