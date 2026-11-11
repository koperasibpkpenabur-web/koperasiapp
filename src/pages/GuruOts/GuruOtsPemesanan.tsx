import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useProducts } from '../../context/ProductContext';
import { supabase } from '../../lib/supabase';
import type { Order, OrderItem, ProductItem, SchoolLevel } from '../../types';
import { resolveItemUnit } from '../../utils/formatUnit';
import KwitansiPrint from '../Kopkar/KwitansiPrint';
import './guruOts.css';

const formatRupiah = (angka: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(angka);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
};

const LEVEL_LIST: (SchoolLevel | 'SEMUA')[] = [
  'SEMUA',
  'TK',
  'SD',
  'SMP',
  'SMA',
  'SPK-SD',
  'SPK-SMP',
  'SPK-SMA',
];

const SIZE_ORDER = [
  'SS', 'XS', 'S', 'M', 'L',
  'XL', 'XXL', '2XL', '2L',
  '3XL', '3L', '4XL', '4L',
  '5XL', '5L', '6XL', '6L',
  '7XL', '7L', '8XL', '8L',
  '9XL', '9L', '10XL', '10L',
];

function sortBySize(variants: ProductItem[]) {
  return [...variants].sort((a, b) => {
    const aSize = (a.size || '').trim().toUpperCase();
    const bSize = (b.size || '').trim().toUpperCase();
    const ai = SIZE_ORDER.indexOf(aSize);
    const bi = SIZE_ORDER.indexOf(bSize);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return (a.size || '').localeCompare(b.size || '', undefined, { numeric: true });
  });
}

const getMasterStudentPrice = (
  product?: Pick<ProductItem, 'priceStudent' | 'priceKopkar' | 'feeSchool'> | null
) => {
  if (!product) return 0;
  return Number(product.priceStudent || 0) > 0
    ? Number(product.priceStudent)
    : Number(product.priceKopkar || 0) + Number(product.feeSchool || 0);
};

interface ProductGroup {
  key: string;
  name: string;
  category: 'seragam' | 'buku';
  level: SchoolLevel;
  firstCode: string;
  variants: ProductItem[];
}

interface OtsOrderRow {
  rowId: string;
  groupKey: string;
  productId: string;
  quantity: number;
}

const createEmptyRow = (): OtsOrderRow => ({
  rowId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  groupKey: '',
  productId: '',
  quantity: 1,
});

const mapOtsOrderRow = (row: any): Order => ({
  id: row.id,
  schoolUserId: row.school_user_id,
  schoolName: row.school_name,
  schoolLevel: row.school_level,
  orderPhase: row.order_phase,
  items: (row.order_items || []).map((it: any) => ({
    id: it.id,
    productId: it.product_id,
    code: it.code,
    name: it.name,
    type: it.type,
    size: it.size,
    gender: it.gender,
    unit: it.unit || resolveItemUnit(it, it.quantity),
    quantity: it.quantity,
    priceKopkar: Number(it.price_kopkar),
    feeSchool: Number(it.fee_school),
    priceStudent: Number(it.price_student),
  })),
  totalPriceKopkar: Number(row.total_price_kopkar),
  totalFeeSchool: Number(row.total_fee_school),
  totalPriceStudent: Number(row.total_price_student),
  status: row.status,
  paymentStatus: row.payment_status,
  feeStatus: row.fee_status,
  notes: row.notes || '',
  createdAt: row.created_at,
});

async function queryOtsHistory(userId: string, limit: number) {
  const { data, count, error } = await supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .eq('school_user_id', userId)
    .order('created_at', { ascending: false })
    .range(0, limit - 1);

  if (error || !data) return null;
  return {
    total: count ?? data.length,
    orders: data.map(mapOtsOrderRow),
  };
}

const GuruOtsPemesanan = () => {
  const { user } = useAuth();
  const { createOrder } = useOrders();
  const { products } = useProducts();

  // 2 Tabs: 'order' (Buat Pesanan) | 'history' (Riwayat Pesanan)
  const [activeTab, setActiveTab] = useState<'order' | 'history'>('order');

  // Filter Jenjang di atas "Pilih Barang"
  const [selectedLevel, setSelectedLevel] = useState<SchoolLevel | 'SEMUA'>('SEMUA');

  // Baris pemesanan langsung di halaman (model Fase Tambahan Role Sekolah, tanpa pop-up form/keranjang)
  const [orderRows, setOrderRows] = useState<OtsOrderRow[]>(() => [createEmptyRow()]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Pop-up Sukses & Cetak Kwitansi
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);

  // History Orders
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(30);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    if (printingOrder) {
      const timer = setTimeout(() => {
        window.print();
        setPrintingOrder(null);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [printingOrder]);

  const fetchHistory = async (limitOverride?: number) => {
    if (!user?.id) return;
    const effectiveLimit = limitOverride ?? historyLimit;
    setLoadingHistory(true);
    const res = await queryOtsHistory(user.id, effectiveLimit);
    if (res) {
      setHistoryTotal(res.total);
      setHistoryOrders(res.orders);
    }
    setLoadingHistory(false);
  };

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    queryOtsHistory(user.id, 30).then((res) => {
      if (!active || !res) return;
      setHistoryTotal(res.total);
      setHistoryOrders(res.orders);
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Lookup map produk by ID (agar harga & stok selalu live dari Master Data Barang)
  const productById = useMemo(() => {
    const map = new Map<string, ProductItem>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Grouping seluruh produk berdasarkan nama + jenjang + kategori, diurutkan sesuai kode Master Data
  const { allGroups, groupByKey } = useMemo(() => {
    const map = new Map<string, ProductGroup>();
    products.forEach((p) => {
      const key = `${p.name}__${p.level}__${p.category}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          name: p.name,
          category: p.category,
          level: p.level,
          firstCode: p.code || '',
          variants: [p],
        });
      } else {
        existing.variants.push(p);
      }
    });

    const list = Array.from(map.values())
      .map((g) => ({
        ...g,
        variants: sortBySize(g.variants),
      }))
      .sort((a, b) => {
        const codeCmp = a.firstCode.localeCompare(b.firstCode, 'id', {
          numeric: true,
          sensitivity: 'base',
        });
        if (codeCmp !== 0) return codeCmp;
        return a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' });
      });

    const keyMap = new Map<string, ProductGroup>();
    list.forEach((g) => keyMap.set(g.key, g));
    return { allGroups: list, groupByKey: keyMap };
  }, [products]);

  // Katalog terfilter berdasarkan Filter Jenjang di atas tabel
  const filteredGroups = useMemo(() => {
    if (selectedLevel === 'SEMUA') return allGroups;
    return allGroups.filter((g) => g.level === selectedLevel || g.level === 'SEMUA');
  }, [allGroups, selectedLevel]);

  // Hitung total qty yang sudah dialokasikan untuk tiap productId di seluruh baris
  const allocatedQtyByProductId = useMemo(() => {
    const totals = new Map<string, number>();
    orderRows.forEach((r) => {
      if (r.productId && r.quantity > 0) {
        totals.set(r.productId, (totals.get(r.productId) || 0) + r.quantity);
      }
    });
    return totals;
  }, [orderRows]);

  // Ringkasan live dari baris yang sudah memilih barang & ukuran
  const orderSummary = useMemo(() => {
    let totalQty = 0;
    let totalStudent = 0;
    let filledCount = 0;

    orderRows.forEach((row) => {
      const prod = row.productId ? productById.get(row.productId) : undefined;
      if (prod && row.quantity > 0) {
        filledCount += 1;
        totalQty += row.quantity;
        totalStudent += getMasterStudentPrice(prod) * row.quantity;
      }
    });

    return { totalQty, totalStudent, filledCount };
  }, [orderRows, productById]);

  const handleSelectGroup = (rowIndex: number, groupKey: string) => {
    setFormError('');
    if (!groupKey) {
      setOrderRows((prev) =>
        prev.map((row, i) =>
          i === rowIndex ? { ...row, groupKey: '', productId: '', quantity: 1 } : row
        )
      );
      return;
    }

    const group = groupByKey.get(groupKey);
    if (!group) return;

    // Jika barang hanya memiliki 1 ukuran dan stok > 0, otomatis pilih agar lebih praktis
    const singleReadyVariant =
      group.variants.length === 1 && Number(group.variants[0]?.stock || 0) > 0
        ? group.variants[0].id
        : '';

    setOrderRows((prev) =>
      prev.map((row, i) =>
        i === rowIndex
          ? {
              ...row,
              groupKey,
              productId: singleReadyVariant,
              quantity: 1,
            }
          : row
      )
    );
  };

  const handleSelectSize = (rowIndex: number, productId: string) => {
    setFormError('');
    const variant = productId ? productById.get(productId) : undefined;

    if (variant) {
      const liveStock = Number(variant.stock || 0);
      const unitLabel = variant.unit || resolveItemUnit(variant);
      const usedInOtherRows = orderRows.reduce((sum, r, idx) => {
        if (idx !== rowIndex && r.productId === productId) {
          return sum + (r.quantity || 0);
        }
        return sum;
      }, 0);
      const remaining = liveStock - usedInOtherRows;

      if (liveStock <= 0) {
        setFormError(
          `Stok gudang untuk "${variant.name}${variant.size ? ` [${variant.size}]` : ''}" kosong (0 ${unitLabel}). Harap tunggu barang tersedia.`
        );
        return;
      }

      if (remaining <= 0) {
        setFormError(
          `Seluruh stok "${variant.name}${variant.size ? ` [${variant.size}]` : ''}" (${liveStock} ${unitLabel}) sudah dipakai di baris lain.`
        );
        return;
      }
    }

    setOrderRows((prev) =>
      prev.map((row, i) =>
        i === rowIndex
          ? {
              ...row,
              productId,
              quantity: 1,
            }
          : row
      )
    );
  };

  const handleChangeRowQty = (rowIndex: number, nextQtyRaw: number) => {
    setFormError('');
    const targetRow = orderRows[rowIndex];
    if (!targetRow) return;

    if (nextQtyRaw <= 0) {
      setOrderRows((prev) =>
        prev.map((row, i) => (i === rowIndex ? { ...row, quantity: 0 } : row))
      );
      return;
    }

    const cleanQty = Math.max(1, Math.floor(nextQtyRaw));

    if (targetRow.productId) {
      const prod = productById.get(targetRow.productId);
      if (prod) {
        const liveStock = Number(prod.stock || 0);
        const unitLabel = prod.unit || resolveItemUnit(prod);
        const usedInOtherRows = orderRows.reduce((sum, r, idx) => {
          if (idx !== rowIndex && r.productId === targetRow.productId) {
            return sum + (r.quantity || 0);
          }
          return sum;
        }, 0);
        const maxAllowed = Math.max(0, liveStock - usedInOtherRows);

        if (cleanQty > maxAllowed) {
          setFormError(
            `Stok gudang "${prod.name}${prod.size ? ` [${prod.size}]` : ''}" hanya tersisa ${liveStock} ${unitLabel}${usedInOtherRows > 0 ? ` (${usedInOtherRows} sudah ada di baris lain)` : ''}.`
          );
          if (maxAllowed >= 1) {
            setOrderRows((prev) =>
              prev.map((row, i) => (i === rowIndex ? { ...row, quantity: maxAllowed } : row))
            );
          }
          return;
        }
      }
    }

    setOrderRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, quantity: cleanQty } : row))
    );
  };

  const handleAddRow = () => {
    setFormError('');
    setOrderRows((prev) => [...prev, createEmptyRow()]);
  };

  const handleRemoveRow = (rowIndex: number) => {
    setFormError('');
    if (orderRows.length <= 1) {
      setOrderRows([createEmptyRow()]);
      return;
    }
    setOrderRows((prev) => prev.filter((_, i) => i !== rowIndex));
  };

  const handleResetRows = () => {
    setFormError('');
    setOrderRows([createEmptyRow()]);
    setNotes('');
  };

  const handleCheckout = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!user) return;

    // Abaikan baris yang masih benar-benar kosong
    const nonEmptyRows = orderRows.filter((r) => r.groupKey || r.productId);
    if (nonEmptyRows.length === 0) {
      setFormError('Silakan pilih minimal 1 barang dan ukuran terlebih dahulu.');
      return;
    }

    // Pastikan semua baris terisi lengkap memiliki ukuran dan jumlah valid
    for (let i = 0; i < orderRows.length; i += 1) {
      const row = orderRows[i];
      if (!row.groupKey && !row.productId) continue;

      const grp = groupByKey.get(row.groupKey);
      if (!row.productId) {
        setFormError(`Baris ke-${i + 1} (${grp?.name || 'Barang'}): Silakan pilih ukuran terlebih dahulu.`);
        return;
      }
      if (!row.quantity || row.quantity <= 0) {
        setFormError(`Baris ke-${i + 1}: Jumlah pesanan minimal 1.`);
        return;
      }
    }

    // Gabungkan item dengan productId yang sama agar rapi di kwitansi & cek total stok gudang
    const mergedByProductId = new Map<string, OrderItem>();
    for (const row of nonEmptyRows) {
      const prod = productById.get(row.productId);
      if (!prod) {
        setFormError('Terdapat barang yang tidak ditemukan di Master Data. Silakan pilih ulang.');
        return;
      }

      const masterStudentPrice = getMasterStudentPrice(prod);
      const unitLabel = prod.unit || resolveItemUnit(prod);
      const existing = mergedByProductId.get(prod.id);

      if (existing) {
        existing.quantity += row.quantity;
      } else {
        mergedByProductId.set(prod.id, {
          productId: prod.id,
          code: prod.code,
          name: prod.name,
          type: prod.category,
          size: prod.size || '-',
          unit: unitLabel,
          quantity: row.quantity,
          priceKopkar: Number(prod.priceKopkar || 0),
          feeSchool: Number(prod.feeSchool || 0),
          priceStudent: masterStudentPrice,
        });
      }
    }

    const itemsToSubmit = Array.from(mergedByProductId.values());

    // Pre-validasi stok gudang lokal sebelum memanggil transaksi atomic di Supabase
    const insufficientList: string[] = [];
    for (const item of itemsToSubmit) {
      const liveProd = item.productId ? productById.get(item.productId) : undefined;
      const avail = Number(liveProd?.stock ?? 0);
      if (!liveProd || avail < item.quantity) {
        insufficientList.push(
          `${item.name}${item.size && item.size !== '-' ? ` [${item.size}]` : ''} (Butuh: ${item.quantity}, Tersedia: ${avail})`
        );
      }
    }

    if (insufficientList.length > 0) {
      setFormError(
        `Pesanan tidak dapat dibuat karena stok gudang tidak mencukupi: ${insufficientList.join('; ')}. Harap tunggu barang tersedia.`
      );
      return;
    }

    // Tentukan label jenjang pesanan dari item yang dipesan jika filter jenjang = SEMUA
    const distinctLevels = Array.from(
      new Set(
        itemsToSubmit
          .map((it) => (it.productId ? productById.get(it.productId)?.level : undefined))
          .filter((lvl): lvl is SchoolLevel => Boolean(lvl && lvl !== 'SEMUA'))
      )
    );
    const derivedSchoolLevel: SchoolLevel =
      selectedLevel !== 'SEMUA'
        ? selectedLevel
        : distinctLevels.length === 1
          ? distinctLevels[0]
          : user.schoolLevel || 'SEMUA';

    setIsSubmitting(true);

    try {
      const result = await createOrder(
        {
          schoolUserId: user.id,
          schoolName: user.schoolName || user.name || 'Guru on the Spot',
          schoolLevel: derivedSchoolLevel,
          orderPhase: 'On The Spot',
          items: itemsToSubmit,
          notes: notes.trim(),
        },
        'received'
      );

      if (result.success && result.newOrderId) {
        const orderDataForPrint: Order = {
          id: result.newOrderId,
          schoolUserId: user.id,
          schoolName: user.schoolName || user.name || 'Guru on the Spot',
          schoolLevel: derivedSchoolLevel,
          orderPhase: 'On The Spot',
          items: itemsToSubmit,
          status: 'received',
          notes: notes.trim(),
          totalPriceKopkar: itemsToSubmit.reduce(
            (acc, it) => acc + (it.priceKopkar || 0) * it.quantity,
            0
          ),
          totalFeeSchool: itemsToSubmit.reduce(
            (acc, it) => acc + (it.feeSchool || 0) * it.quantity,
            0
          ),
          totalPriceStudent: itemsToSubmit.reduce(
            (acc, it) => acc + (it.priceStudent || 0) * it.quantity,
            0
          ),
          paymentStatus: 'unpaid',
          feeStatus: 'locked',
          createdAt: new Date().toISOString(),
        };

        setSuccessOrder(orderDataForPrint);
        setOrderRows([createEmptyRow()]);
        setNotes('');
        await fetchHistory();
      } else {
        setFormError(result.error || 'Gagal menyimpan pesanan');
      }
    } catch (err: any) {
      setFormError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredHistoryOrders = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return historyOrders;
    return historyOrders.filter(
      (ord) =>
        ord.id.toLowerCase().includes(q) ||
        (ord.notes && ord.notes.toLowerCase().includes(q)) ||
        ord.items.some(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            (it.size && it.size.toLowerCase().includes(q))
        )
    );
  }, [historyOrders, historySearch]);

  return (
    <div className="ots-container">
      {/* Header */}
      <div className="ots-header">
        <div className="ots-title-area">
          <h2>
            <span>🛒</span> Pemesanan On The Spot (Langsung di Koperasi)
          </h2>
          <p className="ots-subtitle">
            Pilih jenjang, pilih barang &amp; ukuran dari Master Data Barang, lalu simpan pesanan untuk cetak kwitansi.
          </p>
        </div>
        <div>
          <span className="ots-badge-role">
            📍 Guru on the Spot • {user?.name || 'Kasir Koperasi'}
          </span>
        </div>
      </div>

      {/* 2 Tabs Navigasi Utama */}
      <div className="ots-main-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'order'}
          className={`ots-main-tab-btn ${activeTab === 'order' ? 'active' : ''}`}
          onClick={() => setActiveTab('order')}
        >
          <span>🛒</span> Pemesanan Barang
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`ots-main-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <span>📋</span> Riwayat Pesanan
          {historyTotal > 0 && <span className="ots-tab-count">{historyTotal}</span>}
        </button>
      </div>

      {/* TAB 1: FORM TABEL PEMESANAN BARANG (MODEL FASE TAMBAHAN, TANPA POP-UP) */}
      {activeTab === 'order' && (
        <form className="ots-order-card" onSubmit={handleCheckout}>
          {/* Filter Jenjang tepat di atas "Pilih Barang" */}
          <div className="ots-level-filter-box">
            <div className="ots-level-filter-header">
              <label className="ots-level-filter-label">🏫 Filter Jenjang Barang:</label>
              <span className="ots-level-filter-count">
                {filteredGroups.length} jenis barang tersedia
              </span>
            </div>
            <div className="ots-level-nav">
              {LEVEL_LIST.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  className={`ots-level-btn ${selectedLevel === lvl ? 'active' : ''}`}
                  onClick={() => setSelectedLevel(lvl)}
                >
                  {lvl === 'SEMUA' ? '🌐 Semua Jenjang' : lvl}
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <div className="ots-error-banner">
              <span>⚠️</span>
              <div>{formError}</div>
            </div>
          )}

          {/* Tabel Pemesanan Sederhana */}
          <div className="ots-table-wrap">
            <table className="ots-simple-table">
              <thead>
                <tr>
                  <th style={{ width: '48px', textAlign: 'center' }}>No.</th>
                  <th>Pilih Barang</th>
                  <th style={{ width: '230px' }}>Ukuran &amp; Stok</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Harga Siswa</th>
                  <th style={{ width: '155px', textAlign: 'center' }}>Jumlah</th>
                  <th style={{ width: '145px', textAlign: 'right' }}>Subtotal</th>
                  <th style={{ width: '56px', textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((row, idx) => {
                  const currentGroup = row.groupKey ? groupByKey.get(row.groupKey) : undefined;
                  const selectedProduct = row.productId ? productById.get(row.productId) : undefined;

                  // Pastikan barang yang sudah terpilih di baris ini tetap ada di opsi walau filter jenjang diganti
                  const optionsForRow =
                    currentGroup && !filteredGroups.some((g) => g.key === currentGroup.key)
                      ? [currentGroup, ...filteredGroups]
                      : filteredGroups;

                  const unitPrice = getMasterStudentPrice(selectedProduct);
                  const liveStock = Number(selectedProduct?.stock || 0);
                  const unitLabel = selectedProduct
                    ? selectedProduct.unit || resolveItemUnit(selectedProduct)
                    : 'pcs';
                  const usedElsewhere = selectedProduct
                    ? (allocatedQtyByProductId.get(selectedProduct.id) || 0) - row.quantity
                    : 0;
                  const maxForThisRow = Math.max(0, liveStock - usedElsewhere);
                  const subtotal = selectedProduct ? unitPrice * row.quantity : 0;

                  return (
                    <tr key={row.rowId} className="ots-simple-row">
                      <td data-label="No." className="ots-col-no">
                        {idx + 1}
                      </td>

                      <td data-label="Pilih Barang" className="ots-col-product">
                        <select
                          className="ots-select"
                          value={row.groupKey}
                          onChange={(e) => handleSelectGroup(idx, e.target.value)}
                        >
                          <option value="">-- Pilih Barang --</option>
                          {optionsForRow.map((grp) => (
                            <option key={grp.key} value={grp.key}>
                              {selectedLevel === 'SEMUA' || grp.level !== selectedLevel
                                ? `[${grp.level} • ${grp.category === 'buku' ? 'Buku' : 'Seragam'}] ${grp.name}`
                                : `[${grp.category === 'buku' ? 'Buku' : 'Seragam'}] ${grp.name}`}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td data-label="Ukuran & Stok" className="ots-col-size">
                        <select
                          className="ots-select"
                          value={row.productId}
                          disabled={!currentGroup}
                          onChange={(e) => handleSelectSize(idx, e.target.value)}
                        >
                          <option value="">-- Pilih Ukuran --</option>
                          {(currentGroup?.variants || []).map((v) => {
                            const vStock = Number(v.stock || 0);
                            const vUnit = v.unit || resolveItemUnit(v);
                            const sizeText = v.size || 'All Size';
                            return (
                              <option key={v.id} value={v.id} disabled={vStock <= 0}>
                                {vStock <= 0
                                  ? `${sizeText} (Stok Habis)`
                                  : `${sizeText} — Stok: ${vStock} ${vUnit}`}
                              </option>
                            );
                          })}
                        </select>
                      </td>

                      <td data-label="Harga Siswa" className="ots-col-price">
                        {selectedProduct ? (
                          <div>
                            <div className="ots-price-val">{formatRupiah(unitPrice)}</div>
                            <div className="ots-price-unit">/ {unitLabel}</div>
                          </div>
                        ) : (
                          <span className="ots-muted">—</span>
                        )}
                      </td>

                      <td data-label="Jumlah" className="ots-col-qty">
                        <div className="ots-qty-stepper">
                          <button
                            type="button"
                            className="ots-qty-btn"
                            disabled={!selectedProduct || row.quantity <= 1}
                            onClick={() => handleChangeRowQty(idx, row.quantity - 1)}
                            title="Kurangi jumlah"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={Math.max(1, maxForThisRow)}
                            disabled={!selectedProduct}
                            value={selectedProduct && row.quantity > 0 ? row.quantity : ''}
                            placeholder={selectedProduct ? '1' : '0'}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                handleChangeRowQty(idx, 0);
                                return;
                              }
                              handleChangeRowQty(idx, parseInt(raw, 10) || 1);
                            }}
                            onBlur={() => {
                              if (selectedProduct && row.quantity <= 0) {
                                handleChangeRowQty(idx, 1);
                              }
                            }}
                            className="ots-qty-input"
                          />
                          <button
                            type="button"
                            className="ots-qty-btn"
                            disabled={!selectedProduct || row.quantity >= maxForThisRow}
                            onClick={() => handleChangeRowQty(idx, row.quantity + 1)}
                            title="Tambah jumlah"
                          >
                            +
                          </button>
                        </div>
                        {selectedProduct && (
                          <div className="ots-stock-hint">
                            Maks: {maxForThisRow} {unitLabel}
                          </div>
                        )}
                      </td>

                      <td data-label="Subtotal" className="ots-col-subtotal">
                        {selectedProduct ? (
                          <span className="ots-subtotal-val">{formatRupiah(subtotal)}</span>
                        ) : (
                          <span className="ots-muted">Rp 0</span>
                        )}
                      </td>

                      <td data-label="Aksi" className="ots-col-action">
                        <button
                          type="button"
                          className="ots-btn-remove-row"
                          onClick={() => handleRemoveRow(idx)}
                          title={orderRows.length > 1 ? 'Hapus baris ini' : 'Kosongkan baris'}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Aksi Baris */}
          <div className="ots-row-actions-bar">
            <button type="button" className="ots-btn-add-row" onClick={handleAddRow}>
              + Tambah Item Barang Lainnya
            </button>

            {(orderRows.length > 1 || orderRows[0]?.groupKey || notes.trim()) && (
              <button type="button" className="ots-btn-reset-rows" onClick={handleResetRows}>
                ↺ Reset Pilihan
              </button>
            )}
          </div>

          {/* Ringkasan & Tombol Simpan Langsung di Halaman */}
          <div className="ots-checkout-footer">
            <div className="ots-notes-box">
              <label htmlFor="ots-notes" className="ots-notes-label">
                Catatan Pembeli / Keterangan (Opsional)
              </label>
              <input
                id="ots-notes"
                type="text"
                placeholder="Contoh: Bpk. Budi / An. Clara (SDK 6)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="ots-notes-input"
              />
            </div>

            <div className="ots-summary-action-box">
              <div className="ots-summary-metrics">
                <div className="ots-metric-item">
                  <span>Total Jumlah</span>
                  <strong>{orderSummary.totalQty} item</strong>
                </div>
                <div className="ots-metric-item total">
                  <span>Total Bayar</span>
                  <strong>{formatRupiah(orderSummary.totalStudent)}</strong>
                </div>
              </div>

              <button
                type="submit"
                className="ots-btn-submit"
                disabled={isSubmitting || orderSummary.filledCount === 0}
              >
                {isSubmitting ? 'Menyimpan...' : '💾 Simpan Pesanan & Buat Kwitansi'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: RIWAYAT PESANAN ON THE SPOT */}
      {activeTab === 'history' && (
        <div className="ots-history-section">
          <div className="ots-history-header">
            <div>
              <h3>📋 Riwayat Pesanan On The Spot</h3>
              <p className="ots-history-sub">
                Daftar transaksi langsung di koperasi dan cetak ulang kwitansi pembayaran.
              </p>
            </div>
            <div className="ots-history-controls">
              <input
                type="text"
                placeholder="🔍 Cari nomor pesanan / barang / catatan..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="ots-history-search"
              />
              <button
                type="button"
                onClick={() => fetchHistory()}
                className="ots-btn-refresh"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {loadingHistory ? (
            <p style={{ color: '#64748b', padding: '24px 0', textAlign: 'center' }}>
              Memuat riwayat pesanan...
            </p>
          ) : filteredHistoryOrders.length === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 0' }}>
              {historySearch.trim()
                ? 'Tidak ada riwayat pesanan yang cocok dengan pencarian.'
                : 'Belum ada pesanan yang dibuat oleh akun ini.'}
            </p>
          ) : (
            <div className="ots-table-wrap">
              <table className="ots-history-table">
                <thead>
                  <tr>
                    <th>No. Pesanan &amp; Tanggal</th>
                    <th>Rincian Barang</th>
                    <th>Total Tagihan</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Aksi Cetak</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td>
                        <div style={{ fontWeight: 800, color: '#1e293b' }}>{ord.id}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                          {formatDate(ord.createdAt)} WIB
                        </div>
                        {ord.notes && (
                          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '4px' }}>
                            Catatan: {ord.notes}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                          {ord.items.map((it, i) => (
                            <div key={i}>
                              • {it.name} [{it.size || '-'}] ({it.quantity}{' '}
                              {resolveItemUnit(it, it.quantity)})
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, color: '#059669' }}>
                          {formatRupiah(ord.totalPriceStudent)}
                        </div>
                      </td>
                      <td>
                        <span className="ots-status-badge-done">✅ Selesai Diterima</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="ots-btn-kwitansi"
                          onClick={() => setPrintingOrder(ord)}
                          title="Cetak Kwitansi Pembayaran"
                        >
                          🧾 Cetak Kwitansi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {historyOrders.length < historyTotal && !historySearch.trim() && (
                <div style={{ textAlign: 'center', marginTop: '14px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const nextLimit = historyLimit + 30;
                      setHistoryLimit(nextLimit);
                      fetchHistory(nextLimit);
                    }}
                    className="ots-btn-load-more"
                  >
                    📄 Muat Lebih Banyak ({historyOrders.length} / {historyTotal})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Sukses Order & Cetak Kwitansi Langsung */}
      {successOrder && (
        <div
          className="no-print ots-modal-backdrop"
          onClick={() => setSuccessOrder(null)}
        >
          <div className="ots-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🎉</div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', color: '#0f172a' }}>
              Pesanan On The Spot Berhasil!
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.88rem', margin: '0 0 16px 0' }}>
              Pesanan telah tercatat dengan status <strong>Diterima / Selesai</strong>.
            </p>

            <div className="ots-modal-summary">
              <div className="ots-modal-summary-row">
                <span style={{ color: '#64748b' }}>No. Pesanan:</span>
                <strong>{successOrder.id}</strong>
              </div>
              <div className="ots-modal-summary-row">
                <span style={{ color: '#64748b' }}>Jumlah Item:</span>
                <strong>
                  {successOrder.items.reduce((acc, it) => acc + it.quantity, 0)} item
                </strong>
              </div>
              <div className="ots-modal-summary-row total">
                <span style={{ color: '#64748b' }}>Total Tagihan:</span>
                <strong style={{ color: '#059669', fontSize: '1.1rem' }}>
                  {formatRupiah(successOrder.totalPriceStudent)}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  const ord = successOrder;
                  setSuccessOrder(null);
                  setTimeout(() => {
                    setPrintingOrder(ord);
                  }, 100);
                }}
                className="ots-btn-print-now"
              >
                🖨️ Cetak Kwitansi Sekarang
              </button>
              <button
                type="button"
                onClick={() => setSuccessOrder(null)}
                className="ots-btn-close-modal"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kwitansi Print Hidden Component */}
      <KwitansiPrint order={printingOrder} />
    </div>
  );
};

export default GuruOtsPemesanan;
