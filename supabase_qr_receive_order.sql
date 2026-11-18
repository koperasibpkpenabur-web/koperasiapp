-- ==============================================================================
-- SISTEM KOPERASI BPK PENABUR (AKSARA)
-- MIGRATION: QR CODE PROOF OF DELIVERY (PENERIMAAN BARANG VIA SCAN SURAT JALAN)
-- ==============================================================================

-- 1. Fungsi Publik Aman untuk Mengambil Ringkasan Pesanan berdasarkan ID
CREATE OR REPLACE FUNCTION public.get_order_for_qr_receive(
  p_order_id text,
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order RECORD;
  v_total_items int := 0;
  v_pin text;
BEGIN
  -- Cari pesanan
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan.');
  END IF;

  -- Hitung total kuantiti barang
  SELECT COALESCE(SUM(quantity), 0) INTO v_total_items 
  FROM public.order_items 
  WHERE order_id = p_order_id;

  -- Ambil PIN sekolah jika tersimpan di app_settings
  BEGIN
    SELECT value->>v_order.school_name INTO v_pin
    FROM public.app_settings
    WHERE key = 'school_receive_pins';
  EXCEPTION WHEN OTHERS THEN
    v_pin := NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_order.id,
    'school_name', v_order.school_name,
    'academic_year', v_order.academic_year,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'shipping_info', v_order.shipping_info,
    'receive_info', v_order.receive_info,
    'total_items', v_total_items,
    'has_custom_pin', (v_pin IS NOT NULL AND trim(v_pin) <> '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_for_qr_receive(text, text) TO anon, authenticated, service_role;


-- 2. Fungsi Publik Aman untuk Konfirmasi Terima Pesanan via QR Scan
CREATE OR REPLACE FUNCTION public.receive_order_via_qr(
  p_order_id text,
  p_token text,
  p_recipient_name text,
  p_notes text,
  p_school_pin text DEFAULT NULL
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
  v_receive_info jsonb;
  v_saved_pin text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan.');
  END IF;

  -- Cegah dobel terima
  IF v_order.status = 'received' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'already_received', true,
      'error', 'Pesanan ini sudah diterima sebelumnya.',
      'receive_info', v_order.receive_info
    );
  END IF;

  -- Validasi status pengiriman
  IF v_order.status <> 'shipped' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum berstatus dalam pengiriman (shipped).');
  END IF;

  -- Validasi PIN sekolah jika Koperasi mengatur PIN khusus di app_settings
  BEGIN
    SELECT value->>v_order.school_name INTO v_saved_pin
    FROM public.app_settings
    WHERE key = 'school_receive_pins';
  EXCEPTION WHEN OTHERS THEN
    v_saved_pin := NULL;
  END;

  IF v_saved_pin IS NOT NULL AND trim(v_saved_pin) <> '' THEN
    IF trim(COALESCE(p_school_pin, '')) <> trim(v_saved_pin) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Kode Verifikasi / PIN Sekolah salah. Silakan tanyakan ke PIC Sekolah Anda.');
    END IF;
  END IF;

  -- Bentuk JSON receive_info
  v_receive_info := jsonb_build_object(
    'receivedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'receivedBy', trim(p_recipient_name),
    'receivedVia', 'qr_scan_surat_jalan',
    'isChecked', true,
    'notes', NULLIF(trim(p_notes), '')
  );

  -- Update status pesanan
  UPDATE public.orders
  SET status = 'received',
      receive_info = v_receive_info
  WHERE id = p_order_id;

  -- Sinkronisasi 3-Way Matching ke vendor_payables (sama dengan receive_order_atomic)
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

      v_vendor_qty := 0;
      IF v_shipped_it IS NOT NULL THEN
        v_vendor_qty := COALESCE((v_shipped_it ->> 'vendorQty')::int, 0);
      ELSIF v_shipping ->> 'source' = 'vendor' THEN
        v_vendor_qty := v_item.quantity;
      END IF;

      IF v_vendor_qty > 0 THEN
        v_total_vendor_hpp := v_total_vendor_hpp + (v_item.price_kopkar * v_vendor_qty);
        SELECT supplier_name INTO v_supplier FROM public.products WHERE id = v_item.product_id;
        IF v_supplier IS NOT NULL AND trim(v_supplier) <> '' THEN
          v_vendor_name := v_supplier;
        END IF;
      END IF;
    END LOOP;

    IF v_total_vendor_hpp > 0 THEN
      INSERT INTO public.vendor_payables (
        vendor_name,
        order_id,
        invoice_amount,
        payment_status,
        academic_year
      ) VALUES (
        v_vendor_name,
        p_order_id,
        v_total_vendor_hpp,
        'unpaid',
        v_order.academic_year
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Konfirmasi penerimaan barang berhasil disimpan.',
    'receive_info', v_receive_info
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_order_via_qr(text, text, text, text, text) TO anon, authenticated, service_role;
