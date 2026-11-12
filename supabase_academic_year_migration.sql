-- ============================================================================
-- MIGRASI KLASIFIKASI TAHUN AJARAN (ACADEMIC YEAR)
-- Jalankan di Supabase SQL Editor (https://supabase.com/dashboard/project/fxyssksvbuxnbthfrpzy/sql/new)
-- Idempotent: aman dijalankan ulang tanpa menghilangkan data transaksi yang ada.
--
-- Catatan Arsitektur:
-- 1. Data Berkelanjutan (TIDAK dipisah per Tahun Ajaran):
--    - products (Master Barang & Stok Gudang)
--    - vendor_stocks (Stok Penjahit)
--    - kalkulator_size_charts (Data Model & Size Chart Kalkulator Kain)
--    - stock_mutations (Buku besar mutasi stok fisik berkelanjutan)
-- 2. Data Terklasifikasi per Tahun Ajaran (`academic_year`):
--    - app_settings (active_academic_year default '2026/2027', academic_years_list)
--    - orders (Pesanan Sekolah Tahap 1/2/Tambahan & Guru OTS)
--    - returns (Retur Barang, menyimpan Tahun Ajaran Asal Barang yang dipilih user)
--    - parent_orders (Pesanan Orang Tua Kanvas)
--    - vendor_school_assignments (Plotting vendor bisa berubah tiap TA, e.g. 2028/2029)
--    - vendor_payables (Tagihan vendor mengikuti academic_year pesanan terkait)
-- ============================================================================

-- 1. Seed Default Pengaturan Tahun Ajaran di app_settings
INSERT INTO public.app_settings (key, value)
VALUES
  ('active_academic_year', '2026/2027'),
  ('academic_years_list', '["2026/2027","2027/2028","2028/2029","2029/2030"]')
ON CONFLICT (key) DO NOTHING;

-- 2. Tambah kolom academic_year + indeks pada tabel transaksi & perencanaan tahunan
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT '2026/2027';

ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT '2026/2027';

ALTER TABLE public.parent_orders
  ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT '2026/2027';

ALTER TABLE public.vendor_school_assignments
  ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT '2026/2027';

ALTER TABLE public.vendor_payables
  ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT '2026/2027';

-- Sinkronkan academic_year vendor_payables dengan orders terkait (jika sudah ada data)
UPDATE public.vendor_payables vp
SET academic_year = COALESCE(o.academic_year, '2026/2027')
FROM public.orders o
WHERE vp.order_id = o.id
  AND vp.academic_year IS DISTINCT FROM COALESCE(o.academic_year, '2026/2027');

CREATE INDEX IF NOT EXISTS idx_orders_academic_year
  ON public.orders (academic_year, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_school_phase_academic_year
  ON public.orders (school_user_id, academic_year, order_phase);

CREATE INDEX IF NOT EXISTS idx_returns_academic_year
  ON public.returns (academic_year, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parent_orders_academic_year
  ON public.parent_orders (academic_year, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_assignments_academic_year
  ON public.vendor_school_assignments (academic_year, vendor_id, school_user_id);

CREATE INDEX IF NOT EXISTS idx_vendor_payables_academic_year
  ON public.vendor_payables (academic_year, created_at DESC);

-- 3. Ubah Unique Constraint pada vendor_school_assignments:
--    dari (vendor_id, school_user_id) -> menjadi (vendor_id, school_user_id, academic_year)
DO $$
DECLARE
  v_con record;
  v_idx record;
BEGIN
  -- Hapus constraint unique lama yang hanya mencakup (vendor_id, school_user_id)
  FOR v_con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'vendor_school_assignments'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      ) = ARRAY['school_user_id', 'vendor_id']
  LOOP
    EXECUTE format('ALTER TABLE public.vendor_school_assignments DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;

  -- Hapus unique index standalone lama (jika ada) yang hanya mencakup (vendor_id, school_user_id)
  FOR v_idx IN
    SELECT i.relname AS idxname
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'vendor_school_assignments'
      AND ix.indisunique = true
      AND NOT ix.indisprimary
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid)
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(ix.indkey::int2[]) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      ) = ARRAY['school_user_id', 'vendor_id']
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', v_idx.idxname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'vendor_school_assignments'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      ) = ARRAY['academic_year', 'school_user_id', 'vendor_id']
  ) THEN
    ALTER TABLE public.vendor_school_assignments
      ADD CONSTRAINT vendor_school_assignments_vendor_school_year_key
      UNIQUE (vendor_id, school_user_id, academic_year);
  END IF;
END $$;

-- 4. Perbarui Helper Resolusi Vendor agar menghormati Tahun Ajaran pesanan
DROP FUNCTION IF EXISTS public._resolve_vendor_for_school(uuid, text);
DROP FUNCTION IF EXISTS public._resolve_vendor_for_school(uuid, text, text);

CREATE OR REPLACE FUNCTION public._resolve_vendor_for_school(
  p_school_user_id uuid,
  p_item_name text,
  p_academic_year text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_year text;
  v_vendor_id uuid;
BEGIN
  v_target_year := COALESCE(
    NULLIF(trim(p_academic_year), ''),
    NULLIF(trim(both ' "' from (SELECT value::text FROM public.app_settings WHERE key = 'active_academic_year' LIMIT 1)), ''),
    '2026/2027'
  );

  SELECT vendor_id INTO v_vendor_id
  FROM public.vendor_school_assignments
  WHERE school_user_id = p_school_user_id
    AND academic_year = v_target_year
  ORDER BY
    CASE
      WHEN clothing_type IS NOT NULL
       AND lower(trim(clothing_type)) = lower(trim(COALESCE(p_item_name, '')))
      THEN 0
      ELSE 1
    END,
    created_at ASC
  LIMIT 1;

  RETURN v_vendor_id;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_vendor_for_school(uuid, text, text) FROM PUBLIC, anon;

-- 5. Perbarui RPC create_ots_order_atomic (drop overload lama agar bebas error PGRST203)
DROP FUNCTION IF EXISTS public.create_ots_order_atomic(uuid, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.create_ots_order_atomic(uuid, text, text, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.create_ots_order_atomic(
  p_school_user_id uuid,
  p_school_name text,
  p_school_level text,
  p_order_phase text,
  p_notes text,
  p_items jsonb,
  p_academic_year text DEFAULT '2026/2027'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_role text;
  v_caller_app_id uuid;
  v_order_id text;
  v_now timestamptz := now();
  v_academic_year text;
  v_item jsonb;
  v_req RECORD;
  v_prod RECORD;
  v_total_kopkar numeric := 0;
  v_total_fee numeric := 0;
  v_total_student numeric := 0;
  v_missing text[] := ARRAY[]::text[];
  v_qty int;
  v_new_stock int;
  v_unit text;
BEGIN
  v_role := public.current_app_role();
  v_caller_app_id := public.current_app_user_id();

  IF NOT (v_role IN ('admin', 'kopkar', 'guru_ots') OR auth.role() = 'service_role') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak untuk membuat pesanan OTS.');
  END IF;

  IF v_role = 'guru_ots' AND p_school_user_id <> v_caller_app_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'ID akun Guru OTS tidak sesuai.');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Daftar item pesanan tidak boleh kosong.');
  END IF;

  v_academic_year := COALESCE(
    NULLIF(trim(p_academic_year), ''),
    NULLIF(trim(both ' "' from (SELECT value::text FROM public.app_settings WHERE key = 'active_academic_year' LIMIT 1)), ''),
    '2026/2027'
  );

  FOR v_req IN
    SELECT
      trim(elem ->> 'productId') AS product_id,
      SUM((elem ->> 'quantity')::int) AS total_qty,
      MIN(elem ->> 'name') AS item_name,
      MIN(elem ->> 'size') AS item_size
    FROM jsonb_array_elements(p_items) elem
    GROUP BY trim(elem ->> 'productId')
    ORDER BY trim(elem ->> 'productId')
  LOOP
    IF v_req.product_id IS NULL OR v_req.product_id = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Item OTS harus terhubung ke Master Produk (productId wajib ada).');
    END IF;

    IF v_req.total_qty IS NULL OR v_req.total_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Kuantitas barang harus lebih dari 0.');
    END IF;

    SELECT id, name, size, stock INTO v_prod
    FROM public.products
    WHERE id = v_req.product_id
    FOR UPDATE;

    IF v_prod.id IS NULL THEN
      v_missing := array_append(v_missing, format('• %s (produk tidak ditemukan di Master Barang)', COALESCE(v_req.item_name, v_req.product_id)));
    ELSIF COALESCE(v_prod.stock, 0) < v_req.total_qty THEN
      v_missing := array_append(
        v_missing,
        format(
          '• %s%s (Diminta: %s, Stok Gudang Tersedia: %s)',
          v_prod.name,
          CASE WHEN COALESCE(v_prod.size, '') <> '' THEN ' [' || v_prod.size || ']' ELSE '' END,
          v_req.total_qty,
          COALESCE(v_prod.stock, 0)
        )
      );
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      E'Pesanan On The Spot tidak dapat diproses karena stok gudang kurang:\n' || array_to_string(v_missing, E'\n') || E'\n\nHarap tunggu restock barang tersedia sebelum membuat pesanan.'
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item ->> 'quantity')::int, 0);
    v_total_kopkar := v_total_kopkar + COALESCE((v_item ->> 'priceKopkar')::numeric, 0) * v_qty;
    v_total_fee := v_total_fee + COALESCE((v_item ->> 'feeSchool')::numeric, 0) * v_qty;
    v_total_student := v_total_student + COALESCE(
      NULLIF((v_item ->> 'priceStudent')::numeric, 0),
      COALESCE((v_item ->> 'priceKopkar')::numeric, 0) + COALESCE((v_item ->> 'feeSchool')::numeric, 0)
    ) * v_qty;
  END LOOP;

  v_order_id := public.generate_order_id();

  INSERT INTO public.orders (
    id, school_user_id, school_name, school_level, order_phase, academic_year,
    status, notes, total_price_kopkar, total_fee_school, total_price_student,
    payment_status, fee_status, receive_info, created_at
  ) VALUES (
    v_order_id,
    p_school_user_id,
    p_school_name,
    p_school_level,
    COALESCE(NULLIF(trim(p_order_phase), ''), 'On The Spot'),
    v_academic_year,
    'received',
    p_notes,
    v_total_kopkar,
    v_total_fee,
    v_total_student,
    'unpaid',
    'locked',
    jsonb_build_object(
      'receivedBy', COALESCE(NULLIF(trim(p_school_name), ''), 'Petugas / Guru OTS'),
      'isChecked', true,
      'receivedAt', v_now,
      'notes', 'Barang langsung diambil di Koperasi (On The Spot)'
    ),
    v_now
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item ->> 'quantity')::int;
    v_unit := COALESCE(
      NULLIF(trim(v_item ->> 'unit'), ''),
      CASE WHEN (v_item ->> 'type') = 'buku' THEN 'pack' ELSE 'pcs' END
    );

    INSERT INTO public.order_items (
      order_id, product_id, code, name, type, quantity,
      price_kopkar, fee_school, price_student, size, unit
    ) VALUES (
      v_order_id,
      v_item ->> 'productId',
      v_item ->> 'code',
      v_item ->> 'name',
      v_item ->> 'type',
      v_qty,
      COALESCE((v_item ->> 'priceKopkar')::numeric, 0),
      COALESCE((v_item ->> 'feeSchool')::numeric, 0),
      COALESCE((v_item ->> 'priceStudent')::numeric, 0),
      v_item ->> 'size',
      v_unit
    );
  END LOOP;

  FOR v_req IN
    SELECT
      trim(elem ->> 'productId') AS product_id,
      SUM((elem ->> 'quantity')::int) AS total_qty
    FROM jsonb_array_elements(p_items) elem
    GROUP BY trim(elem ->> 'productId')
    ORDER BY trim(elem ->> 'productId')
  LOOP
    UPDATE public.products
    SET stock = COALESCE(stock, 0) - v_req.total_qty
    WHERE id = v_req.product_id
    RETURNING stock INTO v_new_stock;

    INSERT INTO public.stock_mutations (
      product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
    ) VALUES (
      v_req.product_id, 'gudang', -v_req.total_qty, v_new_stock, 'order_ots', v_order_id, v_caller_app_id, p_school_name, 'Pemesanan OTS langsung ambil'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'academic_year', v_academic_year);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_ots_order_atomic(uuid, text, text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ots_order_atomic(uuid, text, text, text, text, jsonb, text) TO authenticated, service_role;

-- 6. Perbarui ship_order_atomic, ship_remaining_order_atomic, cancel_shipment_atomic
--    agar memakai plotting vendor sesuai v_order.academic_year
CREATE OR REPLACE FUNCTION public.ship_order_atomic(
  p_order_id text,
  p_shipping_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_shipped_it jsonb;
  v_kopkar_qty int;
  v_vendor_qty int;
  v_vendor_id uuid;
  v_missing text[] := ARRAY[]::text[];
  v_prod RECORD;
  v_vstock RECORD;
  v_new_stock int;
  v_caller_app_id uuid;
  v_final_shipping jsonb;
  v_history_entry jsonb;
BEGIN
  IF NOT public.is_kopkar_or_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak: hanya Staf Koperasi atau Admin yang dapat mengirim pesanan.');
  END IF;

  v_caller_app_id := public.current_app_user_id();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tidak ada rincian barang dalam pesanan ini.');
  END IF;

  FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id ORDER BY product_id NULLS LAST LOOP
    IF v_item.product_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT elem INTO v_shipped_it
    FROM jsonb_array_elements(COALESCE(p_shipping_data -> 'shippedItems', '[]'::jsonb)) elem
    WHERE (
      NULLIF(trim(elem ->> 'productId'), '') IS NOT NULL
      AND trim(elem ->> 'productId') = v_item.product_id
    ) OR (
      NULLIF(trim(elem ->> 'productId'), '') IS NULL
      AND lower(trim(COALESCE(elem ->> 'name', ''))) = lower(trim(COALESCE(v_item.name, '')))
      AND lower(trim(COALESCE(elem ->> 'type', ''))) = lower(trim(COALESCE(v_item.type, '')))
      AND lower(trim(COALESCE(elem ->> 'size', ''))) = lower(trim(COALESCE(v_item.size, '')))
    )
    LIMIT 1;

    IF v_shipped_it IS NOT NULL THEN
      v_kopkar_qty := COALESCE((v_shipped_it ->> 'kopkarQty')::int, 0);
      v_vendor_qty := COALESCE((v_shipped_it ->> 'vendorQty')::int, 0);
    ELSIF COALESCE(p_shipping_data ->> 'source', '') = 'vendor' THEN
      v_kopkar_qty := 0;
      v_vendor_qty := v_item.quantity;
    ELSE
      v_kopkar_qty := v_item.quantity;
      v_vendor_qty := 0;
    END IF;

    IF v_kopkar_qty > 0 THEN
      SELECT id, name, size, stock INTO v_prod FROM public.products WHERE id = v_item.product_id FOR UPDATE;
      IF COALESCE(v_prod.stock, 0) < v_kopkar_qty THEN
        v_missing := array_append(
          v_missing,
          format('• %s%s (Butuh Gudang: %s, Tersedia: %s)', v_item.name, CASE WHEN COALESCE(v_item.size, '') <> '' THEN ' [' || v_item.size || ']' ELSE '' END, v_kopkar_qty, COALESCE(v_prod.stock, 0))
        );
      END IF;
    END IF;

    IF v_vendor_qty > 0 THEN
      v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_item.name, v_order.academic_year);
      IF v_vendor_id IS NULL THEN
        v_missing := array_append(
          v_missing,
          format('• %s%s (Sekolah belum di-plotting ke Vendor untuk TA %s)', v_item.name, CASE WHEN COALESCE(v_item.size, '') <> '' THEN ' [' || v_item.size || ']' ELSE '' END, COALESCE(v_order.academic_year, '2026/2027'))
        );
      ELSE
        SELECT id, quantity INTO v_vstock
        FROM public.vendor_stocks
        WHERE vendor_id = v_vendor_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF v_vstock.id IS NULL OR COALESCE(v_vstock.quantity, 0) < v_vendor_qty THEN
          v_missing := array_append(
            v_missing,
            format('• %s%s (Butuh Vendor: %s, Stok Penjahit Tersedia: %s)', v_item.name, CASE WHEN COALESCE(v_item.size, '') <> '' THEN ' [' || v_item.size || ']' ELSE '' END, v_vendor_qty, COALESCE(v_vstock.quantity, 0))
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      E'Pengiriman tidak dapat dilakukan karena stok tidak mencukupi:\n\n' || array_to_string(v_missing, E'\n')
    );
  END IF;

  FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id ORDER BY product_id NULLS LAST LOOP
    IF v_item.product_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT elem INTO v_shipped_it
    FROM jsonb_array_elements(COALESCE(p_shipping_data -> 'shippedItems', '[]'::jsonb)) elem
    WHERE (
      NULLIF(trim(elem ->> 'productId'), '') IS NOT NULL
      AND trim(elem ->> 'productId') = v_item.product_id
    ) OR (
      NULLIF(trim(elem ->> 'productId'), '') IS NULL
      AND lower(trim(COALESCE(elem ->> 'name', ''))) = lower(trim(COALESCE(v_item.name, '')))
      AND lower(trim(COALESCE(elem ->> 'type', ''))) = lower(trim(COALESCE(v_item.type, '')))
      AND lower(trim(COALESCE(elem ->> 'size', ''))) = lower(trim(COALESCE(v_item.size, '')))
    )
    LIMIT 1;

    IF v_shipped_it IS NOT NULL THEN
      v_kopkar_qty := COALESCE((v_shipped_it ->> 'kopkarQty')::int, 0);
      v_vendor_qty := COALESCE((v_shipped_it ->> 'vendorQty')::int, 0);
    ELSIF COALESCE(p_shipping_data ->> 'source', '') = 'vendor' THEN
      v_kopkar_qty := 0;
      v_vendor_qty := v_item.quantity;
    ELSE
      v_kopkar_qty := v_item.quantity;
      v_vendor_qty := 0;
    END IF;

    IF v_kopkar_qty > 0 THEN
      UPDATE public.products
      SET stock = COALESCE(stock, 0) - v_kopkar_qty
      WHERE id = v_item.product_id
      RETURNING stock INTO v_new_stock;

      INSERT INTO public.stock_mutations (
        product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
      ) VALUES (
        v_item.product_id, 'gudang', -v_kopkar_qty, v_new_stock, 'ship', p_order_id, v_caller_app_id, p_shipping_data ->> 'shippedBy', 'Pengiriman Gudang Kopkar'
      );
    END IF;

    IF v_vendor_qty > 0 THEN
      v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_item.name, v_order.academic_year);
      IF v_vendor_id IS NOT NULL THEN
        UPDATE public.vendor_stocks
        SET quantity = COALESCE(quantity, 0) - v_vendor_qty, last_updated = now()
        WHERE vendor_id = v_vendor_id AND product_id = v_item.product_id
        RETURNING quantity INTO v_new_stock;

        INSERT INTO public.stock_mutations (
          product_id, vendor_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
        ) VALUES (
          v_item.product_id, v_vendor_id, 'vendor', -v_vendor_qty, v_new_stock, 'ship', p_order_id, v_caller_app_id, p_shipping_data ->> 'shippedBy', 'Pengiriman Dropship Vendor'
        );
      END IF;
    END IF;
  END LOOP;

  v_history_entry := p_shipping_data - 'shippingHistory';
  v_final_shipping := p_shipping_data || jsonb_build_object('shippingHistory', jsonb_build_array(v_history_entry));

  UPDATE public.orders
  SET status = 'shipped',
      shipping_info = v_final_shipping
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'shipping_info', v_final_shipping);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.ship_remaining_order_atomic(
  p_order_id text,
  p_additional_shipping_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order RECORD;
  v_new_it jsonb;
  v_order_it RECORD;
  v_kopkar_qty int;
  v_vendor_qty int;
  v_vendor_id uuid;
  v_missing text[] := ARRAY[]::text[];
  v_prod RECORD;
  v_vstock RECORD;
  v_new_stock int;
  v_caller_app_id uuid;
  v_old_shipping jsonb;
  v_merged_items jsonb;
  v_old_it jsonb;
  v_found_idx int;
  v_old_history jsonb;
  v_new_history_entry jsonb;
  v_new_shipping jsonb;
  v_new_receive jsonb;
  v_i int;
BEGIN
  IF NOT public.is_kopkar_or_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak.');
  END IF;

  v_caller_app_id := public.current_app_user_id();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.shipping_info IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan atau riwayat Surat Jalan awal tidak ditemukan.');
  END IF;

  FOR v_new_it IN SELECT * FROM jsonb_array_elements(COALESCE(p_additional_shipping_data -> 'shippedItems', '[]'::jsonb)) LOOP
    v_kopkar_qty := COALESCE((v_new_it ->> 'kopkarQty')::int, 0);
    v_vendor_qty := COALESCE((v_new_it ->> 'vendorQty')::int, 0);
    IF v_kopkar_qty <= 0 AND v_vendor_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_order_it
    FROM public.order_items
    WHERE order_id = p_order_id
      AND (
        (NULLIF(trim(v_new_it ->> 'productId'), '') IS NOT NULL AND product_id = trim(v_new_it ->> 'productId'))
        OR (
          lower(trim(COALESCE(name, ''))) = lower(trim(COALESCE(v_new_it ->> 'name', '')))
          AND lower(trim(COALESCE(type, ''))) = lower(trim(COALESCE(v_new_it ->> 'type', '')))
          AND lower(trim(COALESCE(size, ''))) = lower(trim(COALESCE(v_new_it ->> 'size', '')))
        )
      )
    LIMIT 1;

    IF v_order_it.product_id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_kopkar_qty > 0 THEN
      SELECT id, stock INTO v_prod FROM public.products WHERE id = v_order_it.product_id FOR UPDATE;
      IF COALESCE(v_prod.stock, 0) < v_kopkar_qty THEN
        v_missing := array_append(
          v_missing,
          format('• %s%s (Butuh Gudang: %s, Tersedia: %s)', v_order_it.name, CASE WHEN COALESCE(v_order_it.size, '') <> '' THEN ' [' || v_order_it.size || ']' ELSE '' END, v_kopkar_qty, COALESCE(v_prod.stock, 0))
        );
      END IF;
    END IF;

    IF v_vendor_qty > 0 THEN
      v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_order_it.name, v_order.academic_year);
      IF v_vendor_id IS NULL THEN
        v_missing := array_append(
          v_missing,
          format('• %s%s (Sekolah belum di-plotting ke Vendor untuk TA %s)', v_order_it.name, CASE WHEN COALESCE(v_order_it.size, '') <> '' THEN ' [' || v_order_it.size || ']' ELSE '' END, COALESCE(v_order.academic_year, '2026/2027'))
        );
      ELSE
        SELECT id, quantity INTO v_vstock
        FROM public.vendor_stocks
        WHERE vendor_id = v_vendor_id AND product_id = v_order_it.product_id
        FOR UPDATE;

        IF v_vstock.id IS NULL OR COALESCE(v_vstock.quantity, 0) < v_vendor_qty THEN
          v_missing := array_append(
            v_missing,
            format('• %s%s (Butuh Vendor: %s, Stok Penjahit Tersedia: %s)', v_order_it.name, CASE WHEN COALESCE(v_order_it.size, '') <> '' THEN ' [' || v_order_it.size || ']' ELSE '' END, v_vendor_qty, COALESCE(v_vstock.quantity, 0))
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      E'Pengiriman susulan tidak dapat dilakukan karena stok tidak mencukupi:\n\n' || array_to_string(v_missing, E'\n')
    );
  END IF;

  FOR v_new_it IN SELECT * FROM jsonb_array_elements(COALESCE(p_additional_shipping_data -> 'shippedItems', '[]'::jsonb)) LOOP
    v_kopkar_qty := COALESCE((v_new_it ->> 'kopkarQty')::int, 0);
    v_vendor_qty := COALESCE((v_new_it ->> 'vendorQty')::int, 0);
    IF v_kopkar_qty <= 0 AND v_vendor_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_order_it
    FROM public.order_items
    WHERE order_id = p_order_id
      AND (
        (NULLIF(trim(v_new_it ->> 'productId'), '') IS NOT NULL AND product_id = trim(v_new_it ->> 'productId'))
        OR (
          lower(trim(COALESCE(name, ''))) = lower(trim(COALESCE(v_new_it ->> 'name', '')))
          AND lower(trim(COALESCE(type, ''))) = lower(trim(COALESCE(v_new_it ->> 'type', '')))
          AND lower(trim(COALESCE(size, ''))) = lower(trim(COALESCE(v_new_it ->> 'size', '')))
        )
      )
    LIMIT 1;

    IF v_order_it.product_id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_kopkar_qty > 0 THEN
      UPDATE public.products
      SET stock = COALESCE(stock, 0) - v_kopkar_qty
      WHERE id = v_order_it.product_id
      RETURNING stock INTO v_new_stock;

      INSERT INTO public.stock_mutations (
        product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
      ) VALUES (
        v_order_it.product_id, 'gudang', -v_kopkar_qty, v_new_stock, 'ship_remaining', p_order_id, v_caller_app_id, p_additional_shipping_data ->> 'shippedBy', 'Pengiriman Susulan Gudang'
      );
    END IF;

    IF v_vendor_qty > 0 THEN
      v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_order_it.name, v_order.academic_year);
      IF v_vendor_id IS NOT NULL THEN
        UPDATE public.vendor_stocks
        SET quantity = COALESCE(quantity, 0) - v_vendor_qty, last_updated = now()
        WHERE vendor_id = v_vendor_id AND product_id = v_order_it.product_id
        RETURNING quantity INTO v_new_stock;

        INSERT INTO public.stock_mutations (
          product_id, vendor_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
        ) VALUES (
          v_order_it.product_id, v_vendor_id, 'vendor', -v_vendor_qty, v_new_stock, 'ship_remaining', p_order_id, v_caller_app_id, p_additional_shipping_data ->> 'shippedBy', 'Pengiriman Susulan Vendor'
        );
      END IF;
    END IF;
  END LOOP;

  v_old_shipping := v_order.shipping_info;
  v_merged_items := COALESCE(v_old_shipping -> 'shippedItems', '[]'::jsonb);

  FOR v_new_it IN SELECT * FROM jsonb_array_elements(COALESCE(p_additional_shipping_data -> 'shippedItems', '[]'::jsonb)) LOOP
    v_found_idx := NULL;
    FOR v_i IN 0 .. jsonb_array_length(v_merged_items) - 1 LOOP
      v_old_it := v_merged_items -> v_i;
      IF (
        NULLIF(trim(v_new_it ->> 'productId'), '') IS NOT NULL
        AND NULLIF(trim(v_old_it ->> 'productId'), '') IS NOT NULL
        AND trim(v_new_it ->> 'productId') = trim(v_old_it ->> 'productId')
      ) OR (
        lower(trim(COALESCE(v_old_it ->> 'name', ''))) = lower(trim(COALESCE(v_new_it ->> 'name', '')))
        AND lower(trim(COALESCE(v_old_it ->> 'type', ''))) = lower(trim(COALESCE(v_new_it ->> 'type', '')))
        AND lower(trim(COALESCE(v_old_it ->> 'size', ''))) = lower(trim(COALESCE(v_new_it ->> 'size', '')))
      ) THEN
        v_found_idx := v_i;
        EXIT;
      END IF;
    END LOOP;

    IF v_found_idx IS NOT NULL THEN
      v_old_it := v_merged_items -> v_found_idx;
      v_old_it := v_old_it || jsonb_build_object(
        'productId', COALESCE(NULLIF(trim(v_old_it ->> 'productId'), ''), NULLIF(trim(v_new_it ->> 'productId'), '')),
        'shippedQty', COALESCE((v_old_it ->> 'shippedQty')::int, 0) + COALESCE((v_new_it ->> 'shippedQty')::int, 0),
        'kopkarQty', COALESCE((v_old_it ->> 'kopkarQty')::int, 0) + COALESCE((v_new_it ->> 'kopkarQty')::int, 0),
        'vendorQty', COALESCE((v_old_it ->> 'vendorQty')::int, 0) + COALESCE((v_new_it ->> 'vendorQty')::int, 0)
      );
      v_merged_items := jsonb_set(v_merged_items, ARRAY[v_found_idx::text], v_old_it, false);
    ELSE
      v_merged_items := v_merged_items || jsonb_build_array(v_new_it);
    END IF;
  END LOOP;

  v_old_history := COALESCE(
    v_old_shipping -> 'shippingHistory',
    jsonb_build_array(v_old_shipping - 'shippingHistory')
  );
  v_new_history_entry := (p_additional_shipping_data - 'shippingHistory') || jsonb_build_object('isSusulan', true);
  v_old_history := v_old_history || jsonb_build_array(v_new_history_entry);

  v_new_shipping := p_additional_shipping_data || jsonb_build_object(
    'shippedItems', v_merged_items,
    'shippingHistory', v_old_history
  );

  v_new_receive := COALESCE(v_order.receive_info, '{}'::jsonb) || jsonb_build_object(
    'isPartial', false,
    'isSusulan', true
  );

  UPDATE public.orders
  SET shipping_info = v_new_shipping,
      receive_info = v_new_receive
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'shipping_info', v_new_shipping,
    'receive_info', v_new_receive
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_shipment_atomic(
  p_order_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_shipping jsonb;
  v_shipped_it jsonb;
  v_kopkar_qty int;
  v_vendor_qty int;
  v_vendor_id uuid;
  v_new_stock int;
  v_caller_app_id uuid;
BEGIN
  IF NOT public.is_kopkar_or_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak.');
  END IF;

  v_caller_app_id := public.current_app_user_id();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan.');
  END IF;

  v_shipping := v_order.shipping_info;
  IF v_shipping IS NOT NULL THEN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id ORDER BY product_id NULLS LAST LOOP
      IF v_item.product_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT elem INTO v_shipped_it
      FROM jsonb_array_elements(COALESCE(v_shipping -> 'shippedItems', '[]'::jsonb)) elem
      WHERE (
        NULLIF(trim(elem ->> 'productId'), '') IS NOT NULL
        AND trim(elem ->> 'productId') = v_item.product_id
      ) OR (
        lower(trim(COALESCE(elem ->> 'name', ''))) = lower(trim(COALESCE(v_item.name, '')))
        AND lower(trim(COALESCE(elem ->> 'type', ''))) = lower(trim(COALESCE(v_item.type, '')))
        AND lower(trim(COALESCE(elem ->> 'size', ''))) = lower(trim(COALESCE(v_item.size, '')))
      )
      LIMIT 1;

      v_kopkar_qty := COALESCE((v_shipped_it ->> 'kopkarQty')::int, 0);
      v_vendor_qty := COALESCE((v_shipped_it ->> 'vendorQty')::int, 0);

      IF v_kopkar_qty = 0 AND v_vendor_qty = 0 AND COALESCE(v_shipping ->> 'source', '') <> '' THEN
        IF (v_shipping ->> 'source') = 'vendor' THEN
          v_vendor_qty := v_item.quantity;
        ELSE
          v_kopkar_qty := v_item.quantity;
        END IF;
      END IF;

      IF v_kopkar_qty > 0 THEN
        UPDATE public.products
        SET stock = COALESCE(stock, 0) + v_kopkar_qty
        WHERE id = v_item.product_id
        RETURNING stock INTO v_new_stock;

        INSERT INTO public.stock_mutations (
          product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, notes
        ) VALUES (
          v_item.product_id, 'gudang', v_kopkar_qty, v_new_stock, 'cancel_ship', p_order_id, v_caller_app_id, 'Batal kirim (revert ke gudang)'
        );
      END IF;

      IF v_vendor_qty > 0 THEN
        v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_item.name, v_order.academic_year);
        IF v_vendor_id IS NOT NULL THEN
          UPDATE public.vendor_stocks
          SET quantity = COALESCE(quantity, 0) + v_vendor_qty, last_updated = now()
          WHERE vendor_id = v_vendor_id AND product_id = v_item.product_id
          RETURNING quantity INTO v_new_stock;

          IF v_new_stock IS NOT NULL THEN
            INSERT INTO public.stock_mutations (
              product_id, vendor_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, notes
            ) VALUES (
              v_item.product_id, v_vendor_id, 'vendor', v_vendor_qty, v_new_stock, 'cancel_ship', p_order_id, v_caller_app_id, 'Batal kirim (revert ke vendor)'
            );
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders
  SET status = 'approved',
      shipping_info = NULL,
      receive_info = NULL
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 7. Perbarui receive_order_atomic agar menyalin academic_year ke vendor_payables
CREATE OR REPLACE FUNCTION public.receive_order_atomic(
  p_order_id text,
  p_receive_info jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_shipped_it jsonb;
  v_shipping jsonb;
  v_vendor_qty int;
  v_total_vendor_hpp numeric := 0;
  v_vendor_name text := 'Unknown Vendor';
  v_supplier text;
  v_caller_app_id uuid;
  v_role text;
BEGIN
  v_caller_app_id := public.current_app_user_id();
  v_role := public.current_app_role();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan.');
  END IF;

  IF NOT (
    public.is_kopkar_or_admin()
    OR (v_role IN ('sekolah', 'guru_ots') AND v_order.school_user_id = v_caller_app_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak untuk mengonfirmasi penerimaan pesanan ini.');
  END IF;

  IF v_order.status = 'received' THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  IF v_order.status <> 'shipped' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum berstatus dikirim.');
  END IF;

  UPDATE public.orders
  SET status = 'received',
      receive_info = p_receive_info
  WHERE id = p_order_id;

  v_shipping := v_order.shipping_info;
  IF v_shipping IS NOT NULL THEN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
      IF v_item.product_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT elem INTO v_shipped_it
      FROM jsonb_array_elements(COALESCE(v_shipping -> 'shippedItems', '[]'::jsonb)) elem
      WHERE (
        NULLIF(trim(elem ->> 'productId'), '') IS NOT NULL
        AND trim(elem ->> 'productId') = v_item.product_id
      ) OR (
        lower(trim(COALESCE(elem ->> 'name', ''))) = lower(trim(COALESCE(v_item.name, '')))
        AND lower(trim(COALESCE(elem ->> 'type', ''))) = lower(trim(COALESCE(v_item.type, '')))
        AND lower(trim(COALESCE(elem ->> 'size', ''))) = lower(trim(COALESCE(v_item.size, '')))
      )
      LIMIT 1;

      IF v_shipped_it IS NOT NULL THEN
        v_vendor_qty := COALESCE((v_shipped_it ->> 'vendorQty')::int, 0);
      ELSIF COALESCE(v_shipping ->> 'source', '') = 'vendor' THEN
        v_vendor_qty := v_item.quantity;
      ELSE
        v_vendor_qty := 0;
      END IF;

      IF v_vendor_qty > 0 THEN
        v_total_vendor_hpp := v_total_vendor_hpp + (COALESCE(v_item.price_kopkar, 0) * v_vendor_qty);
        SELECT supplier_name INTO v_supplier FROM public.products WHERE id = v_item.product_id;
        IF v_supplier IS NOT NULL AND trim(v_supplier) <> '' THEN
          v_vendor_name := v_supplier;
        END IF;
      END IF;
    END LOOP;

    IF v_total_vendor_hpp > 0 AND NOT EXISTS (SELECT 1 FROM public.vendor_payables WHERE order_id = p_order_id) THEN
      INSERT INTO public.vendor_payables (
        vendor_name, order_id, school_name, academic_year, total_amount, status
      ) VALUES (
        v_vendor_name, p_order_id, v_order.school_name, COALESCE(v_order.academic_year, '2026/2027'), v_total_vendor_hpp, 'pending'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 8. Jaga kolom academic_year agar sekolah/guru_ots tidak dapat mengubahnya via UPDATE langsung
CREATE OR REPLACE FUNCTION public.guard_order_update_by_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF public.is_kopkar_or_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.school_user_id IS DISTINCT FROM OLD.school_user_id
     OR NEW.academic_year IS DISTINCT FROM OLD.academic_year
     OR NEW.total_price_kopkar IS DISTINCT FROM OLD.total_price_kopkar
     OR NEW.total_fee_school IS DISTINCT FROM OLD.total_fee_school
     OR NEW.total_price_student IS DISTINCT FROM OLD.total_price_student
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.fee_status IS DISTINCT FROM OLD.fee_status
     OR NEW.fee_disbursed_at IS DISTINCT FROM OLD.fee_disbursed_at
     OR NEW.fee_disbursed_by IS DISTINCT FROM OLD.fee_disbursed_by
     OR NEW.fee_disbursed_notes IS DISTINCT FROM OLD.fee_disbursed_notes
     OR NEW.processed_by IS DISTINCT FROM OLD.processed_by
     OR NEW.processed_at IS DISTINCT FROM OLD.processed_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.shipping_info IS DISTINCT FROM OLD.shipping_info
  THEN
    RAISE EXCEPTION 'Akses ditolak: Sekolah tidak diperbolehkan mengubah tahun ajaran, nominal finansial, pelunasan, atau data pengiriman.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'shipped' AND NEW.status = 'received')
      OR (OLD.status IN ('pending', 'approved') AND NEW.status = 'cancellation_requested')
    ) THEN
      RAISE EXCEPTION 'Akses ditolak: Transisi status pesanan tidak diizinkan untuk role Sekolah.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_return_update_by_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF public.is_kopkar_or_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.school_user_id IS DISTINCT FROM OLD.school_user_id
     OR NEW.academic_year IS DISTINCT FROM OLD.academic_year
     OR NEW.items IS DISTINCT FROM OLD.items
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.confirmed_by_name IS DISTINCT FROM OLD.confirmed_by_name
     OR NEW.koperasi_diterima_at IS DISTINCT FROM OLD.koperasi_diterima_at
     OR NEW.koperasi_diterima_by_name IS DISTINCT FROM OLD.koperasi_diterima_by_name
     OR NEW.koperasi_diterima_notes IS DISTINCT FROM OLD.koperasi_diterima_notes
     OR NEW.is_restocked IS DISTINCT FROM OLD.is_restocked
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejected_by_name IS DISTINCT FROM OLD.rejected_by_name
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  THEN
    RAISE EXCEPTION 'Akses ditolak: Sekolah tidak dapat mengubah tahun ajaran atau hasil verifikasi Koperasi.';
  END IF;

  RETURN NEW;
END;
$$;
