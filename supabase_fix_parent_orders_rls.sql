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
  ADD COLUMN IF NOT EXISTS school_notes text,
  ADD COLUMN IF NOT EXISTS delivery_method text DEFAULT 'koperasi';

-- 2. Lepas dan perbarui check constraint agar mendukung status bertahap
ALTER TABLE public.parent_orders 
  DROP CONSTRAINT IF EXISTS parent_orders_status_check;

ALTER TABLE public.parent_orders 
  ADD CONSTRAINT parent_orders_status_check 
  CHECK (status IN ('submitted', 'processing', 'ready_for_pickup', 'completed', 'cancelled'));

ALTER TABLE public.parent_orders 
  DROP CONSTRAINT IF EXISTS parent_orders_payment_status_check;

ALTER TABLE public.parent_orders 
  ADD CONSTRAINT parent_orders_payment_status_check 
  CHECK (payment_status IN ('unpaid', 'pending_verification', 'paid', 'verified', 'rejected'));

-- 3. Pastikan izin UPDATE (RLS) terbuka untuk parent_orders
ALTER TABLE public.parent_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_orders_update_all" ON public.parent_orders;
CREATE POLICY "parent_orders_update_all" ON public.parent_orders
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Pastikan izin UPDATE untuk parent_order_items
ALTER TABLE public.parent_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_order_items_update_all" ON public.parent_order_items;
CREATE POLICY "parent_order_items_update_all" ON public.parent_order_items
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Pastikan izin DELETE (RLS) terbuka untuk parent_orders dan parent_order_items (Khusus Admin / Pembersihan Data Testing)
DROP POLICY IF EXISTS "parent_orders_delete_all" ON public.parent_orders;
CREATE POLICY "parent_orders_delete_all" ON public.parent_orders
  FOR DELETE TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "parent_order_items_delete_all" ON public.parent_order_items;
CREATE POLICY "parent_order_items_delete_all" ON public.parent_order_items
  FOR DELETE TO anon, authenticated
  USING (true);

-- 6. Index performa tinggi untuk pencarian pesanan berdasarkan sekolah dan status
CREATE INDEX IF NOT EXISTS idx_parent_orders_school_status 
  ON public.parent_orders (school_name, status);

CREATE INDEX IF NOT EXISTS idx_parent_orders_created_at 
  ON public.parent_orders (created_at DESC);
