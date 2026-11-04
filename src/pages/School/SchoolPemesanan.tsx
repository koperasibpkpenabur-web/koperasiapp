import { useState, type FormEvent, type ChangeEvent, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useProducts } from '../../context/ProductContext';
import { useReturns } from '../../context/ReturnContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import type { Order, OrderItem, SchoolLevel } from '../../types';
import './school.css';

// Urutan ukuran standar dari terkecil ke terbesar
const SIZE_ORDER = [
  'SS', 'XS', 'S', 'M', 'L',
  'XL', 'XXL', '2XL', '2L',
  '3XL', '3L', '4XL', '4L',
  '5XL', '5L', '6XL', '6L',
  '7XL', '7L', '8XL', '8L',
  '9XL', '9L', '10XL', '10L'
];

function sortBySize(variants: any[]) {
  return [...variants].sort((a, b) => {
    const aSize = (a.size || '').trim().toUpperCase();
    const bSize = (b.size || '').trim().toUpperCase();
    const ai = SIZE_ORDER.indexOf(aSize);
    const bi = SIZE_ORDER.indexOf(bSize);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;  // a (known) comes before b (unknown)
    if (bi !== -1) return 1;   // b (known) comes before a (unknown)
    // Both unknown: use numeric-aware natural sort so "10L" > "3L"
    return (a.size || '').localeCompare(b.size || '', undefined, { numeric: true });
  });
}

/** Group catalog products by name, sorted by the first variant's code (same order as Karyawan stock list) */
function groupByCatalog(catalog: any[]) {
  const acc: Record<string, { name: string; type: string; priceKopkar: number; feeSchool: number; priceStudent: number; firstCode: string; variants: any[] }> = {};
  for (const prod of catalog) {
    if (!acc[prod.name]) {
      acc[prod.name] = {
        name: prod.name,
        type: prod.category,
        priceKopkar: prod.priceKopkar,
        feeSchool: prod.feeSchool,
        priceStudent: prod.priceStudent,
        firstCode: prod.code || '',
        variants: [],
      };
    }
    acc[prod.name].variants.push(prod);
  }
  return Object.values(acc).sort((a, b) => a.firstCode.localeCompare(b.firstCode, 'id', { numeric: true, sensitivity: 'base' }));
}

const SchoolPemesanan = () => {
  const { user } = useAuth();
  const { createOrder, receiveOrder, partialReceiveOrder, requestCancelOrder, deleteOrder, cartItems, setCartItems, showCartModal, setShowCartModal } = useOrders();
  const { getProductsByLevel } = useProducts();
  const { getReturnsBySchoolId } = useReturns();
  const { phase1Open, phase2Open, tambahanOpen, tambahanUseDayRule, tambahanUseDateRule, tambahanStartDate, tambahanEndDate, gdriveWebAppUrl } = useSettings();

  // 3 Tabs: 'active' (Berjalan), 'received' (History Diterima), 'cancellations' (Riwayat Pembatalan)
  const [activeTab, setActiveTab] = useState<'active' | 'received' | 'cancellations'>('active');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'shipped'>('all');

  // PAGINATION STATES
  const [paginatedOrders, setPaginatedOrders] = useState<Order[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalTabCount, setTotalTabCount] = useState(0);

  // AGGREGATE STATS
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [shippedCount, setShippedCount] = useState(0);
  const [totalAllCount, setTotalAllCount] = useState(0);
  const [receivedCount, setReceivedCount] = useState(0);
  const [cancellationsCount, setCancellationsCount] = useState(0);

  const [schoolReturns, setSchoolReturns] = useState<any[]>([]);

  const [hasPhase1Order, setHasPhase1Order] = useState(false);
  const [hasPhase2Order, setHasPhase2Order] = useState(false);

  // Fetch Aggregate Counts & Phase Records
  const fetchCounts = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('orders').select('status, order_phase').eq('school_user_id', user.id);
    if (!error && data) {
      let p = 0, a = 0, s = 0, r = 0, c = 0;
      let p1 = false, p2 = false;
      data.forEach((o: any) => {
        if (o.status === 'pending') p++;
        else if (o.status === 'approved') a++;
        else if (o.status === 'shipped') s++;
        else if (o.status === 'received') r++;
        else if (o.status === 'cancelled' || o.status === 'cancellation_requested' || o.status === 'rejected') c++;

        if (o.status !== 'cancelled' && o.status !== 'rejected') {
          if (o.order_phase === 'Tahap 1') p1 = true;
          if (o.order_phase === 'Tahap 2') p2 = true;
        }
      });
      setPendingCount(p);
      setApprovedCount(a);
      setShippedCount(s);
      setReceivedCount(r);
      setCancellationsCount(c);
      setTotalAllCount(data.length);
      setHasPhase1Order(p1);
      setHasPhase2Order(p2);
    }
  };

  // Fetch Paginated Data
  const fetchPaginated = async () => {
    if (!user?.id) return;
    let query = supabase.from('orders').select('*, order_items(*)', { count: 'exact' }).eq('school_user_id', user.id);
    
    if (activeTab === 'active') {
      if (statusFilter === 'all') {
        query = query.in('status', ['pending', 'approved', 'shipped']);
      } else {
        query = query.eq('status', statusFilter);
      }
    } else if (activeTab === 'received') {
      query = query.eq('status', 'received');
    } else if (activeTab === 'cancellations') {
      query = query.in('status', ['cancelled', 'cancellation_requested', 'rejected']);
    }
    
    query = query.order('created_at', { ascending: false });
    
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to);
    
    const { data, count, error } = await query;
    if (!error && data) {
      setPaginatedOrders(data.map((row: any) => ({
         id: row.id,
         schoolUserId: row.school_user_id,
         schoolName: row.school_name,
         schoolLevel: row.school_level,
         orderPhase: row.order_phase,
         items: (row.order_items || []).map((it: any) => ({
           id: it.id,
           productId: it.product_id,
           name: it.name,
           type: it.type,
           size: it.size,
           gender: it.gender,
           quantity: it.quantity,
           priceKopkar: Number(it.price_kopkar),
           feeSchool: Number(it.fee_school),
           priceStudent: Number(it.price_student),
         })),
         totalPriceKopkar: Number(row.total_price_kopkar),
         totalFeeSchool: Number(row.total_fee_school),
         totalPriceStudent: Number(row.total_price_student),
         status: row.status,
         rejectionReason: row.rejection_reason,
         shippingInfo: row.shipping_info,
         receiveInfo: row.receive_info,
         cancellationInfo: row.cancellation_info,
         paymentStatus: row.payment_status,
         paidAt: row.paid_at,
         paidNotes: row.paid_notes,
         feeStatus: row.fee_status,
         feeDisbursedAt: row.fee_disbursed_at,
         feeDisbursedBy: row.fee_disbursed_by,
         feeDisbursedNotes: row.fee_disbursed_notes,
         createdAt: row.created_at,
         notes: row.notes || '',
      })));
      if (count !== null) setTotalTabCount(count);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchCounts();
      fetchPaginated();
      // Will be updated when ReturnContext is refactored
      setSchoolReturns(getReturnsBySchoolId(user.id) as any[]);
    }
  }, [user?.id, activeTab, statusFilter, currentPage]);

  // Realtime update & window focus auto-refresh
  useEffect(() => {
    if (!user?.id) return;

    const handleAutoRefresh = () => {
      fetchCounts();
      fetchPaginated();
      setSchoolReturns(getReturnsBySchoolId(user.id) as any[]);
    };

    window.addEventListener('school-order-updated', handleAutoRefresh);
    window.addEventListener('focus', handleAutoRefresh);
    document.addEventListener('visibilitychange', handleAutoRefresh);

    return () => {
      window.removeEventListener('school-order-updated', handleAutoRefresh);
      window.removeEventListener('focus', handleAutoRefresh);
      document.removeEventListener('visibilitychange', handleAutoRefresh);
    };
  }, [user?.id, activeTab, statusFilter, currentPage]);
  
  const refetchData = () => {
    fetchCounts();
    fetchPaginated();
  };


  // Modal Create Order
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [orderLevelFilter, setOrderLevelFilter] = useState<SchoolLevel>(
    user?.schoolLevel || 'SMP'
  );
  const [orderPhase, setOrderPhase] = useState<'Tahap 1' | 'Tambahan Tahap 1' | 'Tahap 2' | 'Tambahan Tahap 2' | 'Tambahan Mingguan'>('Tahap 1');

  useEffect(() => {
    if (user?.schoolLevel) {
      setOrderLevelFilter(user.schoolLevel);
    }
  }, [user?.schoolLevel]);

  const isAnyPhaseOpen = phase1Open || phase2Open || tambahanOpen;
  const getDefaultOpenPhase = (): 'Tahap 1' | 'Tambahan Tahap 1' | 'Tahap 2' | 'Tambahan Tahap 2' | 'Tambahan Mingguan' => {
    if (phase1Open && !hasPhase1Order) return 'Tahap 1';
    if (phase2Open && !hasPhase2Order) return 'Tahap 2';
    if (tambahanOpen) return 'Tambahan Mingguan';
    if (phase1Open) return 'Tahap 1';
    if (phase2Open) return 'Tahap 2';
    return 'Tambahan Mingguan';
  };

  // Available products for current school level
  const availableCatalog = useMemo(() => getProductsByLevel(orderLevelFilter), [getProductsByLevel, orderLevelFilter]);

  // Group products by name for smarter forms, sorted by kode barang (same as Karyawan stock list)
  const groupedCatalogArray = useMemo(() => groupByCatalog(availableCatalog), [availableCatalog]);
  // Lookup map by name for fast access
  const groupedCatalog = useMemo(() => Object.fromEntries(groupedCatalogArray.map(g => [g.name, g])), [groupedCatalogArray]);

  // Selected items in order form
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [matrixItems, setMatrixItems] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [cartPhase, setCartPhase] = useState<'Tahap 1' | 'Tambahan Tahap 1' | 'Tahap 2' | 'Tambahan Tahap 2' | 'Tambahan Mingguan' | ''>('');
  const [formError, setFormError] = useState('');

  // Offline Excel Template & Strict Upload Review states
  const orderExcelInputRef = useRef<HTMLInputElement>(null);
  const [hasUploadedOrderExcel, setHasUploadedOrderExcel] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedReviewRows, setUploadedReviewRows] = useState<{
    no: number;
    productId: string;
    code: string;
    name: string;
    type: any;
    size: string;
    quantity: number;
    priceKopkar: number;
    feeSchool: number;
    priceStudent: number;
  }[]>([]);

  // Official PDF Identity Form states (Attachment 1 & 2)
  const [docNama, setDocNama] = useState(user?.name || '');
  const [docEmail, setDocEmail] = useState(user?.username?.includes('@') ? user.username : '');
  const [docPhone, setDocPhone] = useState('');
  const [docKepsekName, setDocKepsekName] = useState('');
  const [docPicName, setDocPicName] = useState(user?.name || '');

  // Direct Upload to Google Drive states
  const [signedScanFile, setSignedScanFile] = useState<File | null>(null);
  const [isUploadingGdrive, setIsUploadingGdrive] = useState(false);
  const [uploadedGdriveUrl, setUploadedGdriveUrl] = useState('');
  const [gdriveUploadStatus, setGdriveUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Modal Receive Confirmation
  const [receivingOrder, setReceivingOrder] = useState<Order | null>(null);
  const [receiverName, setReceiverName] = useState('');
  const [isChecklistDone, setIsChecklistDone] = useState(false);
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveError, setReceiveError] = useState('');

  // Modal Request Cancellation
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Detail Modal & Menu Action
  const [openCancelMenuId, setOpenCancelMenuId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  if (!user) {
    return <div style={{ padding: '20px' }}>Silakan login sebagai sekolah...</div>;
  }

  const activeReturnsCount = schoolReturns.filter((r: any) => r.status === 'pending' || r.status === 'koperasi_confirmed' || r.status === 'sekolah_dikirim').length;

  // Calculate live financial summary for modal
  const cartTotalStudent = cartItems.reduce((acc, it) => acc + (it.priceStudent * it.quantity), 0);
  const cartTotalKopkar = cartItems.reduce((acc, it) => acc + (it.priceKopkar * it.quantity), 0);
  const cartTotalFee = cartItems.reduce((acc, it) => acc + (it.feeSchool * it.quantity), 0);

  // Day Restriction Logic
  const currentDay = new Date().getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
  const isInputAllowed = () => {
    if (orderPhase.includes('Tambahan')) {
      if (!tambahanOpen) return false;
      
      let isAllowedByDate = true;
      if (tambahanUseDateRule && tambahanStartDate && tambahanEndDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        isAllowedByDate = (todayStr >= tambahanStartDate && todayStr <= tambahanEndDate);
      }
      
      let isAllowedByDay = true;
      if (tambahanUseDayRule && user) {
        if (user.schoolLevel === 'TK' && currentDay !== 1) isAllowedByDay = false;
        if (user.schoolLevel === 'SD' && currentDay !== 2) isAllowedByDay = false;
        if (user.schoolLevel === 'SMP' && currentDay !== 3) isAllowedByDay = false;
        if (user.schoolLevel === 'SMA' && currentDay !== 4) isAllowedByDay = false;
      }
      
      return isAllowedByDate && isAllowedByDay;
    }
    
    return true;
  };
  const isAllowedToInput = isInputAllowed();

  // Day Restriction Logic

  const handleAddItem = () => {
    const firstGroup = groupedCatalogArray[0];
    setSelectedItems((prev) => [
      ...prev,
      {
        name: firstGroup ? firstGroup.name : '',
        type: firstGroup ? (firstGroup.type as import('../../types').OrderItemType) : 'seragam',
        quantity: 1,
        size: '',
        priceKopkar: firstGroup ? firstGroup.priceKopkar : 0,
        feeSchool: firstGroup ? firstGroup.feeSchool : 0,
        priceStudent: firstGroup ? firstGroup.priceStudent : 0,
        productId: '',
        code: '',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (selectedItems.length <= 1) return;
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateCartQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    const updated = [...cartItems];
    updated[index].quantity = newQty;
    setCartItems(updated);
  };

  const handleRemoveCartItem = (index: number) => {
    const updated = [...cartItems];
    updated.splice(index, 1);
    setCartItems(updated);
  };

  const handleProductSelect = (index: number, productName: string) => {
    const group = groupedCatalog[productName];
    if (!group) return;

    setSelectedItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return {
            ...item,
            name: group.name,
            type: group.type as import('../../types').OrderItemType,
            priceKopkar: group.priceKopkar,
            feeSchool: group.feeSchool,
            priceStudent: group.priceStudent,
            productId: '', // reset until size is picked
            code: '',
            size: '',
          };
        }
        return item;
      })
    );
  };

  const handleQuantityChange = (index: number, qty: number) => {
    const validQty = Math.max(1, qty);
    setSelectedItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return { ...item, quantity: validQty };
        }
        return item;
      })
    );
  };

  const resetCreateForm = (phase: 'Tahap 1' | 'Tambahan Tahap 1' | 'Tahap 2' | 'Tambahan Tahap 2' | 'Tambahan Mingguan') => {
    const defaultLevel = user?.schoolLevel || 'SMP';
    setOrderLevelFilter(defaultLevel);
    setOrderPhase(phase);
    const cat = getProductsByLevel(defaultLevel);
    const grp = groupByCatalog(cat);

    if (!phase.includes('Tambahan') && grp.length > 0) {
      setMatrixItems(grp.map((g: any) => ({
        name: g.name,
        type: g.type,
        priceKopkar: g.priceKopkar,
        feeSchool: g.feeSchool,
        priceStudent: g.priceStudent,
        variants: g.variants,
        sizesInput: {},
        customVariantId: '',
        customQty: 0
      })));
      setSelectedItems([]);
    } else {
      setMatrixItems([]);
      setSelectedItems([{
        name: '',
        type: (grp[0]?.type || 'seragam') as import('../../types').OrderItemType,
        quantity: 1,
        priceKopkar: grp[0]?.priceKopkar || 80000,
        feeSchool: grp[0]?.feeSchool || 15000,
        priceStudent: grp[0]?.priceStudent || 95000,
        productId: '',
        code: '',
        size: ''
      }]);
    }
    setNotes('');
    setFormError('');
    setHasUploadedOrderExcel(false);
    setUploadedFileName('');
    setUploadedReviewRows([]);
    setDocNama(user?.name || '');
    setDocEmail(user?.username?.includes('@') ? user.username : '');
    setDocPicName(user?.name || '');
    setSignedScanFile(null);
    setUploadedGdriveUrl('');
    setGdriveUploadStatus(null);
  };

  // 1. Download Template Excel Pemesanan (Strict dari Manajemen Barang sesuai Jenjang)
  const handleDownloadOrderTemplate = () => {
    if (groupedCatalogArray.length === 0) {
      alert(`Katalog Manajemen Barang untuk jenjang ${orderLevelFilter} masih kosong.`);
      return;
    }

    const templateRows: any[] = [];
    let rowNo = 1;
    groupedCatalogArray.forEach((group) => {
      const sortedVariants = sortBySize(group.variants || []);
      sortedVariants.forEach((v: any) => {
        templateRows.push({
          'No.': rowNo++,
          'Jenis Item': group.name,
          'Ukuran': (v.size || 'ALL SIZE').trim(),
          'Total Pesanan': 0,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [{ wch: 6 }, { wch: 38 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Template_${orderLevelFilter}`);
    const safeSchool = (user?.schoolName || user?.name || orderLevelFilter).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safePhase = orderPhase.replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Template_Pemesanan_${safePhase}_${safeSchool}.xlsx`);
  };

  // 2. Upload File Excel Pemesanan dengan Validasi Strict 100% terhadap Manajemen Barang
  const handleUploadOrderExcel = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError('');

    // Bangun daftar master strict dari Manajemen Barang (availableCatalog)
    const expectedRows: { name: string; size: string; variant: any; group: any }[] = [];
    const masterVariantMap = new Map<string, { variant: any; group: any }>();

    groupedCatalogArray.forEach((group) => {
      const sortedVariants = sortBySize(group.variants || []);
      sortedVariants.forEach((v: any) => {
        const cleanName = group.name.trim();
        const cleanSize = (v.size || 'ALL SIZE').trim().toUpperCase();
        expectedRows.push({ name: cleanName, size: cleanSize, variant: v, group });
        masterVariantMap.set(`${cleanName.toLowerCase()}|||${cleanSize}`, { variant: v, group });
      });
    });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!jsonRows || jsonRows.length === 0) {
          const msg = 'File Excel kosong atau format tidak terbaca. Harap gunakan Template Pemesanan resmi dari sistem.';
          alert('UPLOAD DITOLAK:\n' + msg);
          setFormError(msg);
          return;
        }

        // Pastikan kolom header wajib ada
        const firstRowKeys = Object.keys(jsonRows[0]).map(k => k.trim().toLowerCase());
        const hasJenisItemCol = firstRowKeys.some(k => k === 'jenis item' || k === 'nama barang');
        const hasUkuranCol = firstRowKeys.some(k => k === 'ukuran' || k === 'size');
        const hasTotalCol = firstRowKeys.some(k => k === 'total pesanan' || k === 'total' || k === 'jumlah');

        if (!hasJenisItemCol || !hasUkuranCol || !hasTotalCol) {
          const msg = 'Kolom Excel tidak sesuai template! Wajib memiliki kolom: "No.", "Jenis Item", "Ukuran", dan "Total Pesanan".';
          alert('UPLOAD DITOLAK:\n' + msg);
          setFormError(msg);
          return;
        }

        const mismatchErrors: string[] = [];
        const parsedReviewRows: typeof uploadedReviewRows = [];
        const seenKeys = new Set<string>();

        jsonRows.forEach((row, idx) => {
          const excelRowNum = idx + 2; // baris di Excel (header di baris 1)
          const rawName = String(row['Jenis Item'] ?? row['jenis item'] ?? row['Nama Barang'] ?? '').trim();
          const rawSize = String(row['Ukuran'] ?? row['ukuran'] ?? row['Size'] ?? '').trim();
          const rawQty = row['Total Pesanan'] ?? row['total pesanan'] ?? row['Total'] ?? row['Jumlah'] ?? 0;

          if (!rawName && !rawSize && (rawQty === '' || rawQty === 0)) {
            return; // abaikan baris kosong di paling bawah
          }

          const normalizedSize = (rawSize || 'ALL SIZE').toUpperCase();
          const lookupKey = `${rawName.toLowerCase()}|||${normalizedSize}`;
          const matched = masterVariantMap.get(lookupKey);

          if (!matched || matched.group.name.trim() !== rawName) {
            mismatchErrors.push(
              `Baris ${excelRowNum}: Jenis Item "${rawName || '(Kosong)'}" / Ukuran "${rawSize || '(Kosong)'}" tidak terdaftar atau berbeda dengan Manajemen Barang (Jenjang ${orderLevelFilter}).`
            );
            return;
          }

          // Cek juga apakah urutan/baris diubah dari template asli
          if (idx < expectedRows.length) {
            const exp = expectedRows[idx];
            if (exp.name !== rawName || exp.size !== normalizedSize) {
              mismatchErrors.push(
                `Baris ${excelRowNum}: Tertulis "${rawName} (${normalizedSize})", seharusnya "${exp.name} (${exp.size})" sesuai Manajemen Barang.`
              );
              return;
            }
          }

          const qty = Math.max(0, parseInt(String(rawQty), 10) || 0);
          seenKeys.add(lookupKey);

          parsedReviewRows.push({
            no: parsedReviewRows.length + 1,
            productId: matched.variant.id,
            code: matched.variant.code || '',
            name: matched.group.name,
            type: matched.group.type,
            size: matched.variant.size || 'ALL SIZE',
            quantity: qty,
            priceKopkar: matched.variant.priceKopkar,
            feeSchool: matched.variant.feeSchool,
            priceStudent: matched.variant.priceStudent,
          });
        });

        // Cek apakah ada item dari Manajemen Barang yang dihapus barisnya di Excel
        if (mismatchErrors.length === 0 && seenKeys.size !== expectedRows.length) {
          mismatchErrors.push(
            `Jumlah baris barang di file Excel (${seenKeys.size} varian) tidak sama dengan jumlah varian di Manajemen Barang jenjang ${orderLevelFilter} (${expectedRows.length} varian). Dilarang menghapus atau menambah baris pada template.`
          );
        }

        if (mismatchErrors.length > 0) {
          const previewErr = mismatchErrors.slice(0, 6).join('\n- ');
          const moreText = mismatchErrors.length > 6 ? `\n...dan ${mismatchErrors.length - 6} ketidaksesuaian lainnya.` : '';
          const fullAlert = `PERINGATAN STRICT VALIDASI MANAJEMEN BARANG!\n\nFile Excel DITOLAK karena ditemukan perbedaan data dengan Master Manajemen Barang:\n- ${previewErr}${moreText}\n\nSekolah tidak diperbolehkan mengubah Jenis Item, Ukuran, atau menghapus baris pada Template Excel.`;
          alert(fullAlert);
          setFormError(`Upload ditolak: Ditemukan ${mismatchErrors.length} baris yang tidak sesuai dengan Manajemen Barang.`);
          setHasUploadedOrderExcel(false);
          setUploadedReviewRows([]);
          if (orderExcelInputRef.current) orderExcelInputRef.current.value = '';
          return;
        }

        const totalOrderedPcs = parsedReviewRows.reduce((acc, r) => acc + r.quantity, 0);
        if (totalOrderedPcs <= 0) {
          const msg = 'Seluruh baris pada kolom "Total Pesanan" masih bernilai 0. Harap isi jumlah pesanan minimal pada 1 ukuran barang.';
          alert('PERINGATAN:\n' + msg);
          setFormError(msg);
          setHasUploadedOrderExcel(false);
          setUploadedReviewRows([]);
          if (orderExcelInputRef.current) orderExcelInputRef.current.value = '';
          return;
        }

        // Sinkronkan ke matrixItems agar perhitungan harga & keranjang bekerja otomatis
        const qtyByVariantId: Record<string, number> = {};
        parsedReviewRows.forEach(r => {
          if (r.quantity > 0) qtyByVariantId[r.productId] = r.quantity;
        });

        setMatrixItems(prev =>
          prev.map(row => {
            const newSizesInput: Record<string, number> = {};
            row.variants.forEach((v: any) => {
              if (qtyByVariantId[v.id] > 0) {
                newSizesInput[v.id] = qtyByVariantId[v.id];
              }
            });
            return { ...row, sizesInput: newSizesInput };
          })
        );

        setUploadedReviewRows(parsedReviewRows);
        setHasUploadedOrderExcel(true);
        setUploadedFileName(file.name);
      } catch (err: any) {
        alert('Gagal membaca file Excel: ' + (err?.message || 'Format tidak valid'));
      } finally {
        if (orderExcelInputRef.current) orderExcelInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 3. Generate & Download PDF Lembar Pemesanan Resmi (Persis Attachment 1 & 2)
  const handleDownloadOfficialPdf = async (customItems?: { name: string; size?: string; quantity: number }[]) => {
    const itemsForPdf = customItems
      ? customItems.filter(i => i.quantity > 0)
      : uploadedReviewRows.filter(r => r.quantity > 0);

    if (itemsForPdf.length === 0) {
      alert('Belum ada item pesanan dengan jumlah > 0. Silakan upload file Excel pemesanan terlebih dahulu.');
      return;
    }

    if (!docNama.trim() || !docEmail.trim() || !docPhone.trim() || !docKepsekName.trim() || !docPicName.trim()) {
      alert('Harap lengkapi seluruh kolom identitas dokumen:\n1. Nama\n2. Email Address\n3. No. Handphone\n4. Nama Kepala Sekolah\n5. Nama PIC Sekolah\nsebelum mendownload PDF Lembar Pemesanan Resmi.');
      return;
    }

    const doc = new jsPDF('portrait', 'mm', 'a4');

    // Load Logo Koperasi
    try {
      const logoUrl = `${import.meta.env.BASE_URL}logo_koperasi2.png`;
      const resp = await fetch(logoUrl);
      const blob = await resp.blob();
      const base64Logo = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      doc.addImage(base64Logo, 'PNG', 18, 12, 26, 26);
    } catch {
      // Lanjut jika logo gagal dimuat
    }

    // Kop Surat Koperasi (Sesuai Attachment 1)
    doc.setFont('times', 'normal');
    doc.setFontSize(13.5);
    doc.text('KOPERASI KONSUMEN KARYAWAN', 50, 18);
    doc.text('BPK PENABUR JAKARTA', 50, 24);
    doc.setFontSize(12);
    doc.text('Sekretariat Jl. Tanjung Duren Raya No. 4 Jakarta 11470', 50, 30);
    doc.text('Telp.: 5666962 - 5666963 (Fax)', 50, 36);

    // Garis ganda di bawah Kop Surat
    doc.setLineWidth(0.5);
    doc.line(18, 43, 192, 43);
    doc.setLineWidth(0.2);
    doc.line(18, 44, 192, 44);

    // Timestamp format M/D/YYYY H:mm:ss seperti contoh gambar
    const now = new Date();
    const timestampStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const schoolLabel = user?.schoolName || user?.name || '-';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const metaRows = [
      ['Timestamp', ':', timestampStr],
      ['NAMA', ':', docNama.trim()],
      ['Email Address', ':', docEmail.trim()],
      ['NO HANDPHONE', ':', docPhone.trim()],
      ['SEKOLAH', ':', schoolLabel],
    ];

    let metaY = 52;
    metaRows.forEach(([label, sep, val]) => {
      doc.text(label, 18, metaY);
      doc.text(sep, 56, metaY);
      doc.text(String(val), 62, metaY);
      metaY += 5.2;
    });

    // Judul PEMESANAN
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('PEMESANAN', 18, metaY + 4);

    // Tabel 4 Kolom: No. | Jenis Item | Ukuran | Total Pesanan
    const tableBody = itemsForPdf.map((it, i) => [
      i + 1,
      it.name,
      it.size || 'ALL SIZE',
      it.quantity,
    ]);

    const totalAllPcs = itemsForPdf.reduce((acc, it) => acc + it.quantity, 0);
    tableBody.push(['', 'TOTAL PESANAN', '', totalAllPcs]);

    (doc as any).autoTable({
      startY: metaY + 7,
      margin: { left: 18, right: 18 },
      head: [['No.', 'Jenis Item', 'Ukuran', 'Total Pesanan']],
      body: tableBody,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 2.2,
        textColor: [20, 20, 20],
        lineColor: [80, 80, 80],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 14 },
        1: { halign: 'left' },
        2: { halign: 'center', cellWidth: 28 },
        3: { halign: 'center', cellWidth: 32 },
      },
      didParseCell: (data: any) => {
        if (data.row.index === tableBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [248, 250, 252];
        }
      },
    });

    // Bagian Bawah: Tanda Tangan Kepala Sekolah & PIC Sekolah (Sesuai Attachment 2)
    let finalY = ((doc as any).lastAutoTable?.finalY || metaY + 40) + 14;
    if (finalY > 245) {
      doc.addPage();
      finalY = 25;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Mengetahui,', 24, finalY);
    doc.text('yang membuat,', 128, finalY);

    const signLineY = finalY + 26;
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    doc.text(docKepsekName.trim(), 24, signLineY - 1.5);
    doc.text(docPicName.trim(), 128, signLineY - 1.5);

    doc.setLineWidth(0.35);
    doc.line(24, signLineY, 82, signLineY);
    doc.line(128, signLineY, 182, signLineY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Kepala Sekolah', 24, signLineY + 5);
    doc.text('PIC Sekolah', 128, signLineY + 5);

    const safeSchool = schoolLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`Lembar_Pemesanan_Resmi_${safeSchool}_${orderPhase.replace(/\s+/g, '_')}.pdf`);
  };

  // 4. Direct Upload Lembar Pemesanan Bertanda Tangan ke Google Drive Koperasi
  const handleUploadSignedToGdrive = async () => {
    if (!signedScanFile) {
      alert('Pilih file scan/foto Lembar Pemesanan yang sudah ditandatangani terlebih dahulu.');
      return;
    }
    if (!gdriveWebAppUrl) {
      alert('URL Google Drive Web App belum diatur oleh Admin Koperasi di menu Admin Dashboard.');
      return;
    }

    setIsUploadingGdrive(true);
    setGdriveUploadStatus(null);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const base64Clean = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64Clean);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(signedScanFile);
      });

      const schoolLabel = user?.schoolName || user?.name || 'Sekolah';
      const timestampTag = new Date().toISOString().slice(0, 10);
      const customFileName = `Lembar_Pemesanan_${schoolLabel}_${orderPhase}_${timestampTag}_${signedScanFile.name}`;

      const response = await fetch(gdriveWebAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          fileName: customFileName,
          mimeType: signedScanFile.type || 'application/pdf',
          base64Data,
          schoolName: schoolLabel,
          schoolLevel: orderLevelFilter,
          orderPhase,
          picName: docPicName || user?.name || '',
        }),
      });

      const resJson = await response.json();
      if (resJson && resJson.success && resJson.fileUrl) {
        setUploadedGdriveUrl(resJson.fileUrl);
        setGdriveUploadStatus({
          type: 'success',
          msg: 'Berhasil di-upload langsung ke Google Drive Koperasi!',
        });
        setNotes((prev) => {
          const cleanPrev = prev.replace(/\[Bukti GDrive:.*?\]/g, '').trim();
          return `${cleanPrev ? cleanPrev + ' | ' : ''}[Bukti GDrive: ${resJson.fileUrl}]`;
        });
      } else {
        throw new Error(resJson?.error || 'Respons Google Drive Web App tidak valid');
      }
    } catch (err: any) {
      setGdriveUploadStatus({
        type: 'error',
        msg: 'Gagal upload ke Google Drive: ' + (err?.message || 'Pastikan URL Google Apps Script sudah benar & akses Anyone.'),
      });
    } finally {
      setIsUploadingGdrive(false);
    }
  };


  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    let itemsToSubmit: OrderItem[] = [];

    if (!orderPhase.includes('Tambahan')) {
      matrixItems.forEach(row => {
        Object.entries(row.sizesInput).forEach(([variantId, qty]) => {
          if ((qty as number) > 0) {
            const variant = row.variants.find((v: any) => v.id === variantId);
            if (variant) {
              itemsToSubmit.push({
                productId: variant.id,
                code: variant.code,
                name: row.name,
                type: row.type,
                priceKopkar: variant.priceKopkar,
                feeSchool: variant.feeSchool,
                priceStudent: variant.priceStudent,
                size: variant.size,
                quantity: qty as number
              });
            }
          }
        });
        if (row.customQty > 0 && row.customVariantId) {
          const variant = row.variants.find((v: any) => v.id === row.customVariantId);
          if (variant) {
            itemsToSubmit.push({
              productId: variant.id,
              code: variant.code,
              name: row.name,
              type: row.type,
              priceKopkar: variant.priceKopkar,
              feeSchool: variant.feeSchool,
              priceStudent: variant.priceStudent,
              size: variant.size,
              quantity: row.customQty
            });
          }
        }
      });
    } else {
      itemsToSubmit = selectedItems.filter(it => it.quantity > 0 && it.productId); // must have selected a specific size/variant
      for (const item of itemsToSubmit) {
        if (!item.name.trim()) {
          setFormError('Nama item tidak boleh kosong');
          return;
        }
      }
    }

    if (itemsToSubmit.length === 0) {
      setFormError('Pilih minimal 1 item barang dengan kuantitas > 0');
      return;
    }

    // Add to global cart state
    if (cartItems.length === 0) { setCartPhase(orderPhase); }
    setCartItems(prev => [...prev, ...itemsToSubmit]);
    setShowCreateModal(false);
    resetCreateForm(orderPhase);
  };

  const handleCartSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!user) return;
    
    if (cartItems.length === 0) {
      setFormError('Keranjang masih kosong');
      return;
    }

    const result = await createOrder({
      schoolUserId: user.id,
      schoolName: user.schoolName || user.name,
      schoolLevel: user.schoolLevel || orderLevelFilter, // default to user's level
      orderPhase: (cartPhase as any) || orderPhase,
      items: cartItems,
      notes: notes.trim(),
    });

    if (result.success) {
      setCartItems([]);
      setNotes('');
      setShowCartModal(false);
      refetchData(); // Refresh data agar pesanan baru dan angka "Menunggu" langsung muncul
      
      // Opsional: Langsung arahkan ke tab "Menunggu" agar user langsung melihat pesanannya
      setActiveTab('active');
      setStatusFilter('pending');
      setCurrentPage(1);
    } else {
      setFormError(result.error || 'Gagal membuat pesanan');
    }
  };

  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});

  // Open receive modal
  const handleOpenReceiveModal = (order: Order) => {
    setReceivingOrder(order);
    setReceiverName(user?.name || '');
    setIsChecklistDone(false);
    setReceiveNotes('');
    setReceiveError('');
    
    const initialQty: Record<string, number> = {};
    if (order.shippingInfo?.shippedItems) {
      order.shippingInfo.shippedItems.forEach(item => {
        const key = `${item.name}-${item.type}-${item.size || ''}`;
        const previousReceived = order.receiveInfo?.receivedItems?.find(r => r.name === item.name && r.type === item.type && (r.size || '') === (item.size || ''))?.receivedQty || 0;
        initialQty[key] = Math.max(0, item.shippedQty - previousReceived);
      });
    }
    setReceiveQuantities(initialQty);
  };

  const handleConfirmReceive = async (e: FormEvent) => {
    e.preventDefault();
    if (!receivingOrder) return;

    if (!receiverName.trim()) {
      setReceiveError('Nama penerima wajib diisi');
      return;
    }
    if (!isChecklistDone) {
      setReceiveError('Harap centang verifikasi bahwa fisik barang telah dicek dan sesuai');
      return;
    }

    let isPartial = false;
    const receivedItemsData: any[] = [];
    
    if (receivingOrder.shippingInfo?.shippedItems) {
      receivingOrder.shippingInfo.shippedItems.forEach(item => {
        const key = `${item.name}-${item.type}-${item.size || ''}`;
        const inputQty = receiveQuantities[key] || 0;
        const previousReceived = receivingOrder.receiveInfo?.receivedItems?.find(r => r.name === item.name && r.type === item.type && (r.size || '') === (item.size || ''))?.receivedQty || 0;
        
        const totalReceived = previousReceived + inputQty;
        receivedItemsData.push({
          name: item.name,
          type: item.type,
          size: item.size,
          receivedQty: totalReceived,
          missingQty: item.shippedQty - totalReceived
        });

        if (totalReceived < item.shippedQty) {
          isPartial = true;
        }
      });
    }

    if (isPartial) {
      await partialReceiveOrder(receivingOrder.id, {
        receivedBy: receiverName.trim(),
        isChecked: true,
        notes: receiveNotes.trim() || undefined,
        receivedItems: receivedItemsData
      });
    } else {
      await receiveOrder(receivingOrder.id, {
        receivedBy: receiverName.trim(),
        isChecked: true,
        notes: receiveNotes.trim() || undefined,
      });
    }

    setReceivingOrder(null);
    refetchData();
  };

  // Open cancel modal
  const handleOpenCancelModal = (order: Order) => {
    setCancellingOrder(order);
    setCancelReason('');
    setCancelError('');
  };

  const handleConfirmCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder || !user) return;

    if (!cancelReason.trim()) {
      setCancelError('Alasan pembatalan wajib diisi');
      return;
    }

    await requestCancelOrder(cancellingOrder.id, cancelReason.trim(), user.name);
    setCancellingOrder(null);
    setCancelReason('');
    refetchData();
  };

  const formatRupiah = (num?: number) => {
    if (num === undefined || isNaN(num)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="school-dashboard">
      <div className="school-header-section">
        <div>
          <h2>Pemesanan Barang</h2>
          <div className="school-welcome">
            Buat pesanan seragam dan buku baru ke Kopkar.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            className="btn-primary" 
            disabled={!isAnyPhaseOpen}
            onClick={() => {
              if (!isAnyPhaseOpen) return;
              resetCreateForm(getDefaultOpenPhase());
              setShowCreateModal(true);
            }}
            title={!isAnyPhaseOpen ? 'Periode pemesanan sedang ditutup oleh Koperasi' : 'Buat pesanan baru'}
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              ...( !isAnyPhaseOpen ? { background: '#94a3b8', cursor: 'not-allowed', opacity: 0.85 } : {} )
            }}
          >
            <span>{isAnyPhaseOpen ? '➕' : '🔒'}</span> {isAnyPhaseOpen ? 'Buat Pesanan' : 'Periode Pemesanan Ditutup'}
          </button>
          <Link
            to="/school/retur"
            className="btn-primary"
            style={{
              background: 'var(--bluish-white, #F0F3FA)',
              color: 'var(--primary-blue, #395886)',
              border: '1px solid var(--border-subtle, #d5deef)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>↩️</span> Retur Barang
            {activeReturnsCount > 0 && (
              <span
                style={{
                  background: '#d97706',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '99px',
                }}
              >
                {activeReturnsCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="order-stats">
        <div className="order-stat-card" onClick={() => { setActiveTab('active'); setStatusFilter('all'); setCurrentPage(1); }} style={{ cursor: 'pointer', background: statusFilter === 'all' && activeTab === 'active' ? '#f8fafc' : '#fff', border: statusFilter === 'all' && activeTab === 'active' ? '1px solid #cbd5e1' : undefined }}>
          <div className="stat-icon">📦</div>
          <div className="stat-label">Total Pesanan</div>
          <div className="stat-value">{totalAllCount}</div>
        </div>
        <div className="order-stat-card" onClick={() => { setActiveTab('active'); setStatusFilter('pending'); setCurrentPage(1); }} style={{ cursor: 'pointer', background: statusFilter === 'pending' && activeTab === 'active' ? '#f8fafc' : '#fff', border: statusFilter === 'pending' && activeTab === 'active' ? '1px solid #cbd5e1' : undefined }}>
          <div className="stat-icon">⏳</div>
          <div className="stat-label">Menunggu</div>
          <div className="stat-value">{pendingCount}</div>
        </div>
        <div className="order-stat-card" onClick={() => { setActiveTab('active'); setStatusFilter('approved'); setCurrentPage(1); }} style={{ cursor: 'pointer', background: statusFilter === 'approved' && activeTab === 'active' ? '#f8fafc' : '#fff', border: statusFilter === 'approved' && activeTab === 'active' ? '1px solid #cbd5e1' : undefined }}>
          <div className="stat-icon">👍</div>
          <div className="stat-label">Disetujui</div>
          <div className="stat-value">{approvedCount}</div>
        </div>
        <div className="order-stat-card" onClick={() => { setActiveTab('active'); setStatusFilter('shipped'); setCurrentPage(1); }} style={{ cursor: 'pointer', background: statusFilter === 'shipped' && activeTab === 'active' ? '#f8fafc' : '#fff', border: statusFilter === 'shipped' && activeTab === 'active' ? '1px solid #cbd5e1' : undefined }}>
          <div className="stat-icon">🚚</div>
          <div className="stat-label">Sedang Dikirim</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{shippedCount}</div>
        </div>
        <div className="order-stat-card" onClick={() => { setActiveTab('received'); setCurrentPage(1); }} style={{ cursor: 'pointer', background: activeTab === 'received' ? '#f8fafc' : '#fff', border: activeTab === 'received' ? '1px solid #cbd5e1' : undefined }}>
          <div className="stat-icon">✅</div>
          <div className="stat-label">History Diterima</div>
          <div className="stat-value" style={{ color: '#059669' }}>{receivedCount}</div>
        </div>
      </div>

      {/* 3 Tabs Navigation */}
      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          📋 Pesanan Berjalan ({paginatedOrders.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'received' ? 'active' : ''}`}
          onClick={() => setActiveTab('received')}
        >
          ✅ History Diterima ({receivedCount})
        </button>
        <button
          className={`tab-button ${activeTab === 'cancellations' ? 'active' : ''}`}
          onClick={() => setActiveTab('cancellations')}
        >
          🚫 History Pembatalan ({cancellationsCount})
        </button>
      </div>

      {/* TAB 1: PESANAN BERJALAN */}
      {activeTab === 'active' && (
        <div className="tab-pane">
          <div className="order-toolbar" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <h3>Daftar Pesanan Sedang Berjalan</h3>
            </div>
          </div>

          {paginatedOrders.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="order-table-container desktop-table-view">
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>ID & Tgl Pesan</th>
                      <th>Item Pemesanan</th>
                      <th>Status Pelunasan</th>
                      <th>Status Pengiriman</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order: Order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.id}</strong>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {formatDate(order.createdAt)}
                          </div>
                        </td>
                        <td>
                          <ul className="order-items-list">
                            {order.items.map((it, idx) => (
                              <li key={idx}>
                                <span className={`item-type ${it.type}`}>{it.type}</span>
                                {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} (<strong>{it.quantity} pcs</strong>)
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          {order.paymentStatus === 'paid' ? (
                            <span className="badge-pay-paid">✅ Lunas ke Koperasi</span>
                          ) : (
                            <span className="badge-pay-unpaid">⏳ Menunggu Pelunasan</span>
                          )}
                        </td>
                        <td>
                          {order.status === 'pending' && (
                            <span className="status-badge pending">⏳ Menunggu Persetujuan</span>
                          )}
                          {order.status === 'approved' && (
                            <span className="status-badge approved">👍 Disetujui (Siap Kirim)</span>
                          )}
                          {order.status === 'shipped' && !order.receiveInfo?.isPartial && !order.receiveInfo?.isSusulan && (
                            <div className="shipping-badge-container">
                              <span className="status-badge shipped">🚚 Sedang Dikirim</span>
                              {order.shippingInfo && (
                                <div className="shipping-info-box">
                                  <div>{order.shippingInfo.shippedAtDate} (Pk {order.shippingInfo.shippedAtTime})</div>
                                  <div>{order.shippingInfo.courierNotes || 'Armada Koperasi'}</div>
                                </div>
                              )}
                            </div>
                          )}
                          {order.status === 'shipped' && order.receiveInfo?.isPartial && (
                            <div className="shipping-badge-container">
                              <span className="status-badge shipped" style={{ background: '#fef08a', color: '#854d0e', border: '1px solid #fde047' }}>⚠️ Diterima Sebagian</span>
                              <div style={{ fontSize: '0.75rem', marginTop: '4px', color: '#b45309' }}>Koperasi akan mengirim sisa barang.</div>
                            </div>
                          )}
                          {order.status === 'shipped' && order.receiveInfo?.isSusulan && (
                            <div className="shipping-badge-container">
                              <span className="status-badge shipped" style={{ background: '#bfdbfe', color: '#1e3a8a', border: '1px solid #93c5fd' }}>🚚 Sedang Dikirim (Susulan)</span>
                              {order.shippingInfo && (
                                <div className="shipping-info-box">
                                  <div>{order.shippingInfo.shippedAtDate} (Pk {order.shippingInfo.shippedAtTime})</div>
                                  <div>{order.shippingInfo.courierNotes || 'Armada Koperasi'}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons-col">
                            <button
                              className="btn-detail-dots"
                              title="Lihat Detail"
                              onClick={() => setDetailOrder(order)}
                            >
                              ⋮
                            </button>
                            {order.status === 'shipped' && !order.receiveInfo?.isPartial && (
                              <button
                                className="btn-receive"
                                onClick={() => handleOpenReceiveModal(order)}
                              >
                                {order.receiveInfo?.isSusulan ? '📦 Konfirmasi Terima Susulan' : '📦 Konfirmasi Terima'}
                              </button>
                            )}
                            {(order.status === 'pending' || order.status === 'approved') && (
                              <button
                                className="btn-cancel-request"
                                onClick={() => handleOpenCancelModal(order)}
                              >
                                ✖ Batalkan
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards-view">
                {paginatedOrders.map((order: Order) => (
                  <div key={order.id} className="mobile-order-card">
                    <div className="mobile-card-header">
                      <div>
                        <span className="mobile-order-id">{order.id}</span>
                        <div className="mobile-card-date">{formatDate(order.createdAt)}</div>
                      </div>
                      <span className={`status-badge ${order.status}`}>
                        {order.status === 'pending' && '⏳ Menunggu'}
                        {order.status === 'approved' && '👍 Disetujui'}
                        {order.status === 'shipped' && '🚚 Dikirim'}
                      </span>
                    </div>

                    <div className="mobile-items-box">
                      <div className="mobile-label">Item Pesanan:</div>
                      <ul className="order-items-list">
                        {order.items.map((it, idx) => (
                          <li key={idx}>
                            <span className={`item-type ${it.type}`}>{it.type}</span>
                            {it.name}{it.size ? ` [${it.size}]` : ''} — {it.quantity} pcs
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mobile-price-summary">
                      <div>
                        <span className="price-sub-label">Total Tagihan Siswa:</span>
                        <strong>{formatRupiah(order.totalPriceStudent)}</strong>
                      </div>
                      <div>
                        <span className="price-sub-label">Hak Fee Sekolah:</span>
                        <strong style={{ color: '#059669' }}>+{formatRupiah(order.totalFeeSchool)}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {order.paymentStatus === 'paid' ? (
                        <span className="badge-pay-paid">✅ Lunas</span>
                      ) : (
                        <span className="badge-pay-unpaid">⏳ Belum Lunas</span>
                      )}
                      {order.feeStatus === 'disbursed' ? (
                        <span className="badge-fee-disbursed">💰 Fee Cair</span>
                      ) : (
                        <span className="badge-fee-locked">🔒 Fee Belum Cair</span>
                      )}
                    </div>

                    <div className="mobile-card-actions">
                      {order.status === 'shipped' && (
                        <button
                          className="btn-receive full-width-touch"
                          onClick={() => handleOpenReceiveModal(order)}
                        >
                          📦 Konfirmasi Terima Barang
                        </button>
                      )}
                      {(order.status === 'pending' || order.status === 'approved') && (
                        <button
                          className="btn-cancel-request full-width-touch"
                          onClick={() => handleOpenCancelModal(order)}
                        >
                          ✖ Batalkan Pesanan
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination UI */}
              {totalTabCount > itemsPerPage && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#fff', color: currentPage === 1 ? '#94a3b8' : '#1e293b', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    ⬅️ Sebelumnya
                  </button>
                  <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                    Halaman {currentPage} dari {Math.ceil(totalTabCount / itemsPerPage)}
                  </span>
                  <button 
                    disabled={currentPage >= Math.ceil(totalTabCount / itemsPerPage)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalTabCount / itemsPerPage), prev + 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? '#f1f5f9' : '#fff', color: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? '#94a3b8' : '#1e293b', cursor: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? 'not-allowed' : 'pointer' }}
                  >
                    Selanjutnya ➡️
                  </button>
                </div>
              )}

            </>
          ) : (
            <div className="order-empty">
              <p>Belum ada pesanan aktif saat ini.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HISTORY PEMESANAN DITERIMA (SELESAI) */}
      {activeTab === 'received' && (
        <div className="tab-pane">
          <div className="order-toolbar">
            <h3>Riwayat Pesanan yang Berhasil Diterima & Selesai</h3>
          </div>

          {paginatedOrders.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="order-table-container desktop-table-view">
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>ID & Tgl Pesan</th>
                      <th>Item Pemesanan</th>
                      <th>Status Pelunasan</th>
                      <th>Status Pengiriman</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order: Order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.id}</strong>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {formatDate(order.createdAt)}
                          </div>
                        </td>
                        <td>
                          <ul className="order-items-list">
                            {order.items.map((it, idx) => (
                              <li key={idx}>
                                <span className={`item-type ${it.type}`}>{it.type}</span>
                                {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} ({it.quantity} pcs)
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          {order.paymentStatus === 'paid' ? (
                            <div>
                              <span className="badge-pay-paid">✅ Lunas ke Koperasi</span>
                              {order.paidAt && (
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                  {formatDate(order.paidAt)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="badge-pay-unpaid">⏳ Menunggu Pelunasan</span>
                          )}
                        </td>
                        <td>
                          <span className="status-badge received">✅ Selesai Diterima</span>
                          {order.receiveInfo && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                              Oleh: {order.receiveInfo.receivedBy}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons-col">
                            <button
                              className="btn-detail-dots"
                              title="Lihat Detail"
                              onClick={() => setDetailOrder(order)}
                            >
                              ⋮
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards-view">
                {paginatedOrders.map((order: Order) => (
                  <div key={order.id} className="mobile-order-card completed-card">
                    <div className="mobile-card-header">
                      <div>
                        <span className="mobile-order-id">{order.id}</span>
                        <div className="mobile-card-date">{formatDate(order.createdAt)}</div>
                      </div>
                      <span className="status-badge received">✅ Selesai Diterima</span>
                    </div>

                    <div className="mobile-items-box">
                      <div className="mobile-label">Item:</div>
                      <ul className="order-items-list">
                        {order.items.map((it, idx) => (
                          <li key={idx}>
                            <span className={`item-type ${it.type}`}>{it.type}</span>
                            {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} ({it.quantity} pcs)
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mobile-price-summary">
                      <div>
                        <span className="price-sub-label">Total Tagihan Siswa:</span>
                        <strong>{formatRupiah(order.totalPriceStudent)}</strong>
                      </div>
                      <div>
                        <span className="price-sub-label">Hak Fee Sekolah:</span>
                        <strong style={{ color: '#059669' }}>+{formatRupiah(order.totalFeeSchool)}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      {order.paymentStatus === 'paid' ? (
                        <div className="badge-pay-paid">✅ Pembayaran: Lunas ke Koperasi</div>
                      ) : (
                        <div className="badge-pay-unpaid">⏳ Pembayaran: Belum Lunas</div>
                      )}

                      {order.feeStatus === 'disbursed' ? (
                        <div className="badge-fee-disbursed">💰 Fee Sekolah: Telah Ditransfer Koperasi</div>
                      ) : order.feeStatus === 'ready' ? (
                        <div className="badge-fee-ready">⏳ Fee Sekolah: Siap Ditransfer (Koperasi sedang proses)</div>
                      ) : (
                        <div className="badge-fee-locked">🔒 Fee Sekolah: Cair Setelah Pelunasan</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination UI */}
              {totalTabCount > itemsPerPage && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#fff', color: currentPage === 1 ? '#94a3b8' : '#1e293b', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    ⬅️ Sebelumnya
                  </button>
                  <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                    Halaman {currentPage} dari {Math.ceil(totalTabCount / itemsPerPage)}
                  </span>
                  <button 
                    disabled={currentPage >= Math.ceil(totalTabCount / itemsPerPage)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalTabCount / itemsPerPage), prev + 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? '#f1f5f9' : '#fff', color: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? '#94a3b8' : '#1e293b', cursor: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? 'not-allowed' : 'pointer' }}
                  >
                    Selanjutnya ➡️
                  </button>
                </div>
              )}

            </>
          ) : (
            <div className="order-empty">
              <p>Belum ada riwayat pesanan yang selesai/diterima.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTORY PEMBATALAN */}
      {activeTab === 'cancellations' && (
        <div className="tab-pane">
          <div className="order-toolbar">
            <h3>Riwayat Pembatalan & Penolakan Pesanan</h3>
          </div>

          {paginatedOrders.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="order-table-container desktop-table-view">
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>ID & Tgl Pesan</th>
                      <th>Item Pemesanan</th>
                      <th>Status Pelunasan</th>
                      <th>Status Pengiriman</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order: Order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.id}</strong>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {formatDate(order.createdAt)}
                          </div>
                        </td>
                        <td>
                          <ul className="order-items-list">
                            {order.items.map((it, idx) => (
                              <li key={idx}>
                                <span className={`item-type ${it.type}`}>{it.type}</span>
                                {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} ({it.quantity} pcs)
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          {order.paymentStatus === 'paid' ? (
                            <span className="badge-pay-paid">✅ Lunas</span>
                          ) : (
                            <span className="badge-pay-unpaid">⏳ Belum Lunas</span>
                          )}
                        </td>
                        <td>
                          {order.status === 'cancellation_requested' && (
                            <span className="status-badge requested">⏳ Permintaan Batal</span>
                          )}
                          {order.status === 'cancelled' && (
                            <span className="status-badge cancelled">🚫 Dibatalkan</span>
                          )}
                          {order.status === 'rejected' && (
                            <span className="status-badge rejected">❌ Ditolak Koperasi</span>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons-col" style={{ position: 'relative' }}>
                            <button
                              className="btn-detail-dots"
                              title="Opsi"
                              onClick={() => setOpenCancelMenuId(openCancelMenuId === order.id ? null : order.id)}
                            >
                              ⋮
                            </button>
                            {openCancelMenuId === order.id && (
                              <div className="action-menu-dropdown">
                                <button
                                  className="dropdown-item"
                                  onClick={() => {
                                    setDetailOrder(order);
                                    setOpenCancelMenuId(null);
                                  }}
                                >
                                  📄 Detail
                                </button>
                                <button
                                  className="dropdown-item delete"
                                  onClick={async () => {
                                    if(window.confirm('Yakin ingin menghapus permanen riwayat pembatalan ini?')) {
                                      await deleteOrder(order.id);
                                      refetchData();
                                    }
                                    setOpenCancelMenuId(null);
                                  }}
                                >
                                  🗑️ Hapus Riwayat
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards-view">
                {paginatedOrders.map((order: Order) => (
                  <div key={order.id} className="mobile-order-card cancelled-card">
                    <div className="mobile-card-header">
                      <span className="mobile-order-id">{order.id}</span>
                      <span className={`status-badge ${order.status}`}>
                        {order.status === 'cancellation_requested' && '⏳ Request Batal'}
                        {order.status === 'cancelled' && '🚫 Dibatalkan'}
                        {order.status === 'rejected' && '❌ Ditolak'}
                      </span>
                    </div>

                    <div className="mobile-items-box">
                      <div className="mobile-label">Item:</div>
                      <ul className="order-items-list">
                        {order.items.map((it, idx) => (
                          <li key={idx}>
                            <span className={`item-type ${it.type}`}>{it.type}</span>
                            {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} ({it.quantity} pcs)
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="reason-text-box" style={{ marginTop: '8px' }}>
                      <strong>Alasan:</strong> {order.cancellationInfo?.reason || order.rejectionReason || 'Tidak ada alasan'}
                    </div>

                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <button 
                        className="btn-primary" 
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem', background: '#395886' }}
                        onClick={() => setDetailOrder(order)}
                      >
                        📄 Detail
                      </button>
                      <button 
                        className="btn-reject" 
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                        onClick={async () => {
                          if(window.confirm('Yakin ingin menghapus permanen riwayat pembatalan ini?')) {
                            await deleteOrder(order.id);
                            refetchData();
                          }
                        }}
                      >
                        🗑️ Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination UI */}
              {totalTabCount > itemsPerPage && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#fff', color: currentPage === 1 ? '#94a3b8' : '#1e293b', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    ⬅️ Sebelumnya
                  </button>
                  <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                    Halaman {currentPage} dari {Math.ceil(totalTabCount / itemsPerPage)}
                  </span>
                  <button 
                    disabled={currentPage >= Math.ceil(totalTabCount / itemsPerPage)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalTabCount / itemsPerPage), prev + 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? '#f1f5f9' : '#fff', color: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? '#94a3b8' : '#1e293b', cursor: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? 'not-allowed' : 'pointer' }}
                  >
                    Selanjutnya ➡️
                  </button>
                </div>
              )}

            </>
          ) : (
            <div className="order-empty">
              <p>Tidak ada riwayat pembatalan atau penolakan pesanan.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal Buat Order Baru (Dengan Pilihan Katalog Barang Sesuai Jenjang) */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className={`modal ${!orderPhase.includes('Tambahan') ? 'order-modal-extra-wide' : 'order-modal-wide'}`} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Form Pemesanan Seragam & Buku</h3>
              <button className="btn-close-modal" onClick={() => setShowCreateModal(false)}>✖</button>
            </div>

            <form className="modal-form" onSubmit={handleCreateSubmit}>
              {formError && <div className="modal-error">{formError}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: '12px' }}>
                <div className="form-group">
                  <label>Nama Pemesan / Sekolah</label>
                  <input
                    type="text"
                    value={`${user?.name} - ${user?.schoolName || ''}`}
                    disabled
                    style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                </div>

                <div className="form-group">
                  <label>Jenjang Sekolah</label>
                  <select
                    value={orderLevelFilter}
                    disabled={user?.role === 'sekolah' && !!user?.schoolLevel && user.schoolLevel !== 'SEMUA'}
                    style={(user?.role === 'sekolah' && !!user?.schoolLevel && user.schoolLevel !== 'SEMUA') ? { background: '#f1f5f9', cursor: 'not-allowed' } : undefined}
                    onChange={(e) => {
                      if (user?.role === 'sekolah' && user?.schoolLevel && user.schoolLevel !== 'SEMUA') return;
                      const lvl = e.target.value as SchoolLevel;
                      setOrderLevelFilter(lvl);
                      const cat = getProductsByLevel(lvl);
                      if (!orderPhase.includes('Tambahan')) {
                        setMatrixItems(groupByCatalog(cat).map((g: any) => ({
                          name: g.name, type: g.type, priceKopkar: g.priceKopkar, feeSchool: g.feeSchool, priceStudent: g.priceStudent,
                          variants: g.variants, sizesInput: {}, customVariantId: '', customQty: 0
                        })));
                        setSelectedItems([]);
                      }
                    }}
                  >
                    <option value="TK">Jenjang TK</option>
                    <option value="SD">Jenjang SD</option>
                    <option value="SMP">Jenjang SMP</option>
                    <option value="SMA">Jenjang SMA</option>
                    <option value="SPK-SD">Jenjang SPK (Primary)</option>
                    <option value="SPK-SMP">Jenjang SPK (Lower Sec)</option>
                    <option value="SPK-SMA">Jenjang SPK (Upper Sec)</option>
                    <option value="SEMUA">Semua Jenjang</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Fase Pemesanan</label>
                  <select
                    value={orderPhase}
                    onChange={(e) => {
                      const p = e.target.value as 'Tahap 1' | 'Tambahan Tahap 1' | 'Tahap 2' | 'Tambahan Tahap 2' | 'Tambahan Mingguan';
                      setOrderPhase(p);
                      setHasUploadedOrderExcel(false);
                      setUploadedFileName('');
                      setUploadedReviewRows([]);
                      const grp = groupByCatalog(getProductsByLevel(orderLevelFilter));
                      if (!p.includes('Tambahan')) {
                        setMatrixItems(grp.map((g: any) => ({
                          name: g.name, type: g.type, priceKopkar: g.priceKopkar, feeSchool: g.feeSchool, priceStudent: g.priceStudent,
                          variants: g.variants, sizesInput: {}, customVariantId: '', customQty: 0
                        })));
                        setSelectedItems([]);
                      } else {
                        setMatrixItems([]);
                        setSelectedItems([{ name: '', type: (grp[0]?.type || 'seragam') as import('../../types').OrderItemType, quantity: 1, priceKopkar: grp[0]?.priceKopkar || 80000, feeSchool: grp[0]?.feeSchool || 15000, priceStudent: grp[0]?.priceStudent || 95000, productId: '', code: '', size: '' }]);
                      }
                    }}
                  >
                    <option value="Tahap 1">Tahap 1</option>
                    <option value="Tambahan Tahap 1">Tambahan Tahap 1</option>
                    <option value="Tahap 2">Tahap 2</option>
                    <option value="Tambahan Tahap 2">Tambahan Tahap 2</option>
                    <option value="Tambahan Mingguan">Tambahan Mingguan</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                {!orderPhase.includes('Tambahan') ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '16px' }}>
                    {/* LANGKAH 1 & 2: DOWNLOAD TEMPLATE & UPLOAD EXCEL STRICT */}
                    <div style={{ background: '#f8fafc', padding: '18px 20px', borderRadius: '12px', border: '1.5px solid #cbd5e1' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#1e293b', marginBottom: '6px' }}>
                        📋 Langkah 1 & 2: Download Template & Upload Excel Pemesanan ({orderPhase} - Jenjang {orderLevelFilter})
                      </div>
                      <div style={{ fontSize: '0.84rem', color: '#475569', marginBottom: '14px', lineHeight: 1.5 }}>
                        Daftar barang dan ukuran pada template ditarik <strong>100% strict dari Manajemen Barang</strong>. Sekolah wajib mengisi jumlah pesanan pada kolom <code>Total Pesanan</code> secara offline tanpa mengubah <code>Jenis Item</code> maupun <code>Ukuran</code>.
                      </div>

                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={handleDownloadOrderTemplate}
                          style={{
                            padding: '10px 16px',
                            background: '#ffffff',
                            color: '#1e40af',
                            border: '1.5px solid #3b82f6',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          📥 1. Download Template Pemesanan (.xlsx)
                        </button>

                        <input
                          ref={orderExcelInputRef}
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleUploadOrderExcel}
                          style={{ display: 'none' }}
                        />
                        <button
                          type="button"
                          onClick={() => orderExcelInputRef.current?.click()}
                          style={{
                            padding: '10px 16px',
                            background: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          📤 2. Upload File Excel Pemesanan (.xlsx)
                        </button>

                        {hasUploadedOrderExcel && (
                          <span style={{ fontSize: '0.84rem', color: '#059669', fontWeight: 700, background: '#ecfdf5', padding: '6px 12px', borderRadius: '99px', border: '1px solid #a7f3d0' }}>
                            ✅ File Terverifikasi: {uploadedFileName}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* TABEL REVIEW TERKUNCI SETELAH UPLOAD EXCEL */}
                    <div style={{ background: '#ffffff', padding: '18px 20px', borderRadius: '12px', border: '1.5px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                          🔒 Review Data Pemesanan (Terkunci - Sesuai Manajemen Barang)
                        </div>
                        {hasUploadedOrderExcel && (
                          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#2563eb' }}>
                            Total Item Dipesan: {uploadedReviewRows.filter(r => r.quantity > 0).length} varian ({uploadedReviewRows.reduce((a, b) => a + b.quantity, 0)} pcs)
                          </div>
                        )}
                      </div>

                      {!hasUploadedOrderExcel ? (
                        <div style={{ textAlign: 'center', padding: '28px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '0.88rem' }}>
                          Belum ada file Excel yang di-upload. Silakan <strong>Download Template</strong>, isi kolom <strong>Total Pesanan</strong> secara offline, lalu klik <strong>Upload File Excel Pemesanan</strong> di atas.
                        </div>
                      ) : (
                        <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                          <table className="order-table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 5 }}>
                                <th style={{ width: '60px', textAlign: 'center', padding: '10px', borderBottom: '2px solid #cbd5e1' }}>No.</th>
                                <th style={{ textAlign: 'left', padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Jenis Item</th>
                                <th style={{ width: '120px', textAlign: 'center', padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Ukuran</th>
                                <th style={{ width: '140px', textAlign: 'center', padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Total Pesanan</th>
                              </tr>
                            </thead>
                            <tbody>
                              {uploadedReviewRows.filter(r => r.quantity > 0).map((row, idx) => (
                                <tr key={`${row.productId}-${idx}`} style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                                  <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>{idx + 1}</td>
                                  <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e293b' }}>{row.name}</td>
                                  <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                                    <span style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', fontSize: '0.82rem' }}>
                                      {row.size}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                                    <input
                                      type="number"
                                      value={row.quantity}
                                      disabled
                                      readOnly
                                      style={{ width: '90px', textAlign: 'center', padding: '5px 8px', background: '#f1f5f9', color: '#0f172a', fontWeight: 700, border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'not-allowed' }}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* LANGKAH 3: FORM IDENTITAS & DOWNLOAD PDF LEMBAR PEMESANAN RESMI */}
                    <div style={{ background: '#fffbeb', padding: '18px 20px', borderRadius: '12px', border: '1.5px solid #fde68a' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#92400e', marginBottom: '6px' }}>
                        📄 Langkah 3: Isi Data Penandatangan & Download PDF Lembar Pemesanan Resmi
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#78350f', marginBottom: '14px' }}>
                        Lengkapi data di bawah ini untuk mencetak <strong>Lembar Pemesanan Resmi Ber-Kop Koperasi</strong> (lengkap dengan kolom Tanda Tangan Kepala Sekolah & PIC Sekolah).
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.8rem' }}>Nama Pembuat *</label>
                          <input
                            type="text"
                            placeholder="Contoh: Maria Agustina"
                            value={docNama}
                            onChange={(e) => setDocNama(e.target.value)}
                            style={{ background: '#fff' }}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.8rem' }}>Email Address *</label>
                          <input
                            type="email"
                            placeholder="nama@bpkpenaburjakarta.or.id"
                            value={docEmail}
                            onChange={(e) => setDocEmail(e.target.value)}
                            style={{ background: '#fff' }}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.8rem' }}>No. Handphone *</label>
                          <input
                            type="text"
                            placeholder="Contoh: 08111111442"
                            value={docPhone}
                            onChange={(e) => setDocPhone(e.target.value)}
                            style={{ background: '#fff' }}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.8rem' }}>Nama Kepala Sekolah (Tanda Tangan Kiri) *</label>
                          <input
                            type="text"
                            placeholder="Contoh: Damaris Fajar Dewanti, M.Pd"
                            value={docKepsekName}
                            onChange={(e) => setDocKepsekName(e.target.value)}
                            style={{ background: '#fff' }}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.8rem' }}>Nama PIC Sekolah (Tanda Tangan Kanan) *</label>
                          <input
                            type="text"
                            placeholder="Contoh: Maria Agustina"
                            value={docPicName}
                            onChange={(e) => setDocPicName(e.target.value)}
                            style={{ background: '#fff' }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={!hasUploadedOrderExcel}
                        onClick={() => handleDownloadOfficialPdf()}
                        style={{
                          padding: '10px 18px',
                          background: hasUploadedOrderExcel ? '#d97706' : '#cbd5e1',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.86rem',
                          cursor: hasUploadedOrderExcel ? 'pointer' : 'not-allowed',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        🖨️ 3. Download PDF Lembar Pemesanan Resmi (Siap Tanda Tangan & Cap)
                      </button>
                    </div>

                    {/* LANGKAH 4: DIRECT UPLOAD LEMBAR BERTANDA TANGAN KE GOOGLE DRIVE */}
                    <div style={{ background: '#f0f9ff', padding: '18px 20px', borderRadius: '12px', border: '1.5px solid #bae6fd' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0369a1', marginBottom: '6px' }}>
                        ☁️ Langkah 4: Upload Scan Lembar Pemesanan Bertanda Tangan (Direct ke Google Drive)
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#334155', marginBottom: '12px' }}>
                        Setelah PDF Lembar Pemesanan dicetak, ditandatangani oleh <strong>Kepala Sekolah & PIC Sekolah</strong> serta diberi stempel sekolah, upload file scan/fotonya di bawah ini untuk dikirim langsung ke Google Drive Koperasi.
                      </div>

                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            setSignedScanFile(e.target.files?.[0] || null);
                            setGdriveUploadStatus(null);
                          }}
                          style={{ padding: '7px', background: '#fff', border: '1px solid #93c5fd', borderRadius: '8px', fontSize: '0.84rem' }}
                        />
                        <button
                          type="button"
                          disabled={!signedScanFile || isUploadingGdrive}
                          onClick={handleUploadSignedToGdrive}
                          style={{
                            padding: '10px 16px',
                            background: (!signedScanFile || isUploadingGdrive) ? '#94a3b8' : '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: (!signedScanFile || isUploadingGdrive) ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isUploadingGdrive ? '⏳ Mengupload ke Google Drive...' : '☁️ 4. Upload Direct ke Google Drive'}
                        </button>

                        {uploadedGdriveUrl && (
                          <a
                            href={uploadedGdriveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0284c7', textDecoration: 'underline' }}
                          >
                            🔗 Lihat File di Google Drive
                          </a>
                        )}
                      </div>

                      {gdriveUploadStatus && (
                        <div style={{ marginTop: '10px', fontSize: '0.83rem', fontWeight: 600, color: gdriveUploadStatus.type === 'success' ? '#059669' : '#dc2626' }}>
                          {gdriveUploadStatus.type === 'success' ? '✅ ' : '⚠️ '}{gdriveUploadStatus.msg}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="school-order-items-table">
                    {selectedItems.map((item, index) => {
                      const selectedGroup = groupedCatalog[item.name];
                      return (
                        <div key={index} className="school-order-row">
                          <div style={{ flexGrow: 1 }}>
                            <select
                              className="product-select"
                              value={item.name || ''}
                              onChange={(e) => handleProductSelect(index, e.target.value)}
                            >
                              <option value="">-- Pilih Barang --</option>
                              {groupedCatalogArray.map((group) => (
                                <option key={group.name} value={group.name}>
                                  [{group.type}] {group.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div style={{ width: '160px', marginLeft: '10px' }}>
                            <select
                              value={item.productId || ''}
                              onChange={(e) => {
                                const prodId = e.target.value;
                                const variant = selectedGroup?.variants.find(v => v.id === prodId);
                                setSelectedItems((prev) => prev.map((it, i) => i === index ? { 
                                  ...it, 
                                  productId: prodId, 
                                  code: variant?.code, 
                                  size: variant?.size || '',
                                  priceKopkar: variant ? variant.priceKopkar : it.priceKopkar,
                                  feeSchool: variant ? variant.feeSchool : it.feeSchool,
                                  priceStudent: variant ? variant.priceStudent : it.priceStudent
                                } : it));
                              }}
                              style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff' }}
                              required={item.quantity > 0}
                              disabled={!item.name}
                            >
                              <option value="">-- Pilih Ukuran --</option>
                              {sortBySize(selectedGroup?.variants || []).map(v => (
                                <option key={v.id} value={v.id}>{v.size || 'Tanpa Ukuran'} (Stok: {v.stock})</option>
                              ))}
                            </select>
                          </div>

                          <div style={{ width: '100px', marginLeft: '10px' }}>
                            <input
                              type="number"
                              min="0"
                              placeholder="Jumlah"
                              value={item.quantity || ''}
                              onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                              style={{ width: '100%', padding: '9px 12px', textAlign: 'center' }}
                              required
                            />
                          </div>

                          {selectedItems.length > 1 && (
                            <button
                              type="button"
                              className="btn-remove-item"
                              onClick={() => handleRemoveItem(index)}
                              title="Hapus baris"
                              style={{ marginLeft: '10px' }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {orderPhase.includes('Tambahan') && (
                  <button
                    type="button"
                    className="btn-add-item"
                    onClick={handleAddItem}
                    style={{ marginTop: '8px' }}
                  >
                    + Tambah Item Barang Lainnya
                  </button>
                )}
              </div>

              <div className="modal-actions" style={{ marginTop: '24px', flexDirection: 'column', alignItems: 'stretch' }}>
                {(orderPhase === 'Tahap 1' && hasPhase1Order) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Sudah Dipesan:</strong> Anda sudah melakukan pesanan untuk Tahap 1.
                  </div>
                )}
                {(orderPhase === 'Tahap 2' && hasPhase2Order) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Sudah Dipesan:</strong> Anda sudah melakukan pesanan untuk Tahap 2.
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    type="submit" 
                    className="btn-primary"
                    disabled={(orderPhase === 'Tahap 1' && hasPhase1Order) || (orderPhase === 'Tahap 2' && hasPhase2Order) || (!orderPhase.includes('Tambahan') && !hasUploadedOrderExcel)}
                    style={((orderPhase === 'Tahap 1' && hasPhase1Order) || (orderPhase === 'Tahap 2' && hasPhase2Order) || (!orderPhase.includes('Tambahan') && !hasUploadedOrderExcel)) ? { background: '#94a3b8', cursor: 'not-allowed' } : {}}
                  >
                    🛒 Tambahkan ke Keranjang
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Keranjang */}
      {showCartModal && (
        <div className="modal-overlay" onClick={() => setShowCartModal(false)}>
          <div className="modal order-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Keranjang Pesanan 🛒</h3>
              <button className="btn-close-modal" onClick={() => setShowCartModal(false)}>✖</button>
            </div>

            <form className="modal-form" onSubmit={handleCartSubmit}>
              {formError && <div className="modal-error">{formError}</div>}

              <div className="verification-item-box" style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', color: '#334155' }}>
                  Ringkasan Keranjang Pesanan:
                </div>
                {cartItems.length === 0 ? (
                  <div style={{ color: '#dc2626', fontSize: '0.9rem' }}>Keranjang masih kosong. Harap kembali ke Dashboard dan buat pesanan.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {cartItems.map((it, idx) => (
                      <li key={idx} style={{ padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <span className={`item-type ${it.type}`} style={{ marginRight: '8px' }}>{it.type}</span>
                          <strong>{it.name}</strong>
                          {it.size && <span style={{ marginLeft: '6px', color: '#2563eb', fontWeight: 600 }}>[{it.size}]</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(idx, it.quantity - 1)}
                            disabled={it.quantity <= 1}
                            style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: it.quantity <= 1 ? 'not-allowed' : 'pointer' }}
                          >-</button>
                          <span style={{ minWidth: '32px', textAlign: 'center' }}>{it.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(idx, it.quantity + 1)}
                            style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}
                          >+</button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCartItem(idx)}
                            style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', marginLeft: '4px' }}
                            title="Hapus Item"
                          >✖</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {cartItems.length > 0 && (
                <>
                  <div className="order-live-summary-card">
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '8px' }}>
                      Ringkasan Estimasi Biaya & Fee:
                    </div>
                    <div className="live-summary-grid">
                      <div className="summary-item">
                        <span className="sum-label">Total Tagihan Siswa (Wajib Dilunasi):</span>
                        <span className="sum-value primary">{formatRupiah(cartTotalStudent)}</span>
                      </div>
                      <div className="summary-item">
                        <span className="sum-label">Estimasi Fee Hak Sekolah (Dikembalikan Setelah Lunas):</span>
                        <span className="sum-value success">+{formatRupiah(cartTotalFee)}</span>
                      </div>
                      <div className="summary-item">
                        <span className="sum-label">Total Biaya Pengadaan Koperasi (HPP):</span>
                        <span className="sum-value secondary">{formatRupiah(cartTotalKopkar)}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px', lineHeight: 1.4 }}>
                      ℹ️ Sekolah menagihkan <strong>{formatRupiah(cartTotalStudent)}</strong> kepada siswa/wali murid dan membayarkannya ke Koperasi. Setelah diverifikasi lunas, Koperasi akan membayarkan fee hak sekolah sebesar <strong>{formatRupiah(cartTotalFee)}</strong>.
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="orderNotes">Catatan Tambahan (opsional)</label>
                    <textarea
                      id="orderNotes"
                      placeholder="Misal: Mohon dikirimkan bertahap atau ditujukan ke ruang TU..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </>
              )}

              <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {(orderPhase === 'Tahap 1' && !phase1Open) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Tahap 1 Ditutup:</strong> Admin belum mengaktifkan pemesanan Tahap 1.
                  </div>
                )}
                {(orderPhase === 'Tahap 2' && !phase2Open) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Tahap 2 Ditutup:</strong> Admin belum mengaktifkan pemesanan Tahap 2.
                  </div>
                )}
                {(orderPhase.includes('Tambahan') && !tambahanOpen) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Fase Tambahan Ditutup:</strong> Admin sedang menutup akses pesanan Tambahan.
                  </div>
                )}
                {(orderPhase.includes('Tambahan') && tambahanOpen && !isAllowedToInput) && (
                  <div style={{ padding: '12px 16px', background: '#fee2e2', borderLeft: '4px solid #ef4444', borderRadius: '4px', fontSize: '0.9rem', color: '#b91c1c', marginBottom: '16px' }}>
                    <strong>Akses Dibatasi:</strong> Checkout tidak dapat dilakukan saat ini karena belum memasuki periode waktu pemesanan yang ditetapkan atau bukan jadwal hari pesanan jenjang Anda.
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={(orderPhase === 'Tahap 1' && !phase1Open) || (orderPhase === 'Tahap 2' && !phase2Open) || (orderPhase.includes('Tambahan') && (!tambahanOpen || !isAllowedToInput)) || cartItems.length === 0}
                      style={((orderPhase === 'Tahap 1' && !phase1Open) || (orderPhase === 'Tahap 2' && !phase2Open) || (orderPhase.includes('Tambahan') && (!tambahanOpen || !isAllowedToInput)) || cartItems.length === 0) ? { background: '#94a3b8', cursor: 'not-allowed' } : {}}
                    >
                      🚀 Pesan Sekarang
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Penerimaan & Pengecekan Barang */}
      {receivingOrder && (
        <div className="modal-overlay" onClick={() => setReceivingOrder(null)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <h3>📦 Konfirmasi Penerimaan & Verifikasi Fisik Barang</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '16px' }}>
              Pesanan No: <strong>{receivingOrder.id}</strong> ({receivingOrder.schoolName})
            </p>

            <form className="modal-form" onSubmit={handleConfirmReceive}>
              {receiveError && <div className="modal-error">{receiveError}</div>}

              <div className="verification-item-box">
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px', color: '#334155' }}>
                  Periksa Kesesuaian Fisik Barang:
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {receivingOrder.shippingInfo?.shippedItems ? receivingOrder.shippingInfo.shippedItems.map((it, idx) => {
                    const key = `${it.name}-${it.type}-${it.size || ''}`;
                    const previousReceived = receivingOrder.receiveInfo?.receivedItems?.find(r => r.name === it.name && r.type === it.type && (r.size || '') === (it.size || ''))?.receivedQty || 0;
                    const remainingToReceive = Math.max(0, it.shippedQty - previousReceived);
                    
                    if (remainingToReceive === 0) return null; // Already fully received
                    
                    return (
                      <li key={idx} style={{ padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>📦 <strong>{it.name}</strong> {it.size ? `(Size: ${it.size})` : ''} — {it.type}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dikirim: {remainingToReceive} pcs</span>
                          <input 
                            type="number" 
                            min="0" 
                            max={remainingToReceive} 
                            value={receiveQuantities[key] !== undefined ? receiveQuantities[key] : remainingToReceive}
                            onChange={(e) => {
                              const val = Math.min(remainingToReceive, Math.max(0, parseInt(e.target.value) || 0));
                              setReceiveQuantities(prev => ({ ...prev, [key]: val }));
                            }}
                            style={{ width: '60px', padding: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                          />
                        </div>
                      </li>
                    );
                  }) : (
                    <li style={{ padding: '6px 0', fontSize: '0.88rem' }}>⚠️ Data pengiriman rinci tidak tersedia. Semua barang dianggap diterima.</li>
                  )}
                </ul>
              </div>

              <div className="checklist-container">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isChecklistDone}
                    onChange={(e) => setIsChecklistDone(e.target.checked)}
                    required
                  />
                  <span>
                    <strong>Saya telah memeriksa fisik barang</strong> dan menyatakan bahwa jumlah serta kondisi barang sudah sesuai pesanan.
                  </span>
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="receiverName">Nama Petugas Penerima di Sekolah *</label>
                <input
                  id="receiverName"
                  type="text"
                  placeholder="Contoh: Bpk. Haryanto (Staf TU)"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="receiveNotes">Catatan Penerimaan (opsional)</label>
                <textarea
                  id="receiveNotes"
                  placeholder="Misal: Diterima dalam kondisi baik, kardus tersegel rapi..."
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReceivingOrder(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-receive">
                  ✅ Konfirmasi & Selesai
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pengajuan Pembatalan oleh Sekolah */}
      {cancellingOrder && (
        <div className="modal-overlay" onClick={() => setCancellingOrder(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#dc2626' }}>✖ Ajukan Pembatalan Pesanan</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '16px' }}>
              Nomor Pesanan: <strong>{cancellingOrder.id}</strong>
            </p>

            <form className="modal-form" onSubmit={handleConfirmCancel}>
              {cancelError && <div className="modal-error">{cancelError}</div>}

              <div className="form-group">
                <label htmlFor="cancelReason">
                  Alasan Pembatalan (wajib diisi agar dapat ditinjau Koperasi) *
                </label>
                <textarea
                  id="cancelReason"
                  placeholder="Contoh: Terjadi perubahan data ukuran siswa baru / Pembatalan kegiatan..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  required
                  rows={4}
                  autoFocus
                />
              </div>

              <div style={{ fontSize: '0.82rem', color: '#64748b', background: '#fef2f2', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                ℹ️ Permintaan pembatalan ini akan masuk ke dashboard Karyawan Koperasi untuk disetujui.
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCancellingOrder(null)}
                >
                  Kembali
                </button>
                <button type="submit" className="btn-reject">
                  Kirim Pengajuan Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detail Order */}
      {detailOrder && (
        <div className="modal-overlay" onClick={() => setDetailOrder(null)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Detail Pesanan</h3>
              <button className="btn-close-modal" onClick={() => setDetailOrder(null)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.9rem', color: '#64748b' }}>ID Pesanan</div>
              <div style={{ fontWeight: 600 }}>{detailOrder.id}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Tanggal Pesan: {formatDate(detailOrder.createdAt)}
              </div>
            </div>

            <div className="verification-item-box" style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', color: '#334155' }}>
                Item Pemesanan:
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {detailOrder.items.map((it, idx) => (
                  <li key={idx} style={{ padding: '6px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '0.88rem' }}>
                    <span className={`item-type ${it.type}`} style={{ marginRight: '8px' }}>{it.type}</span>
                    <strong>{it.name}{it.size ? ` [${it.size}]` : ''}</strong> — {it.quantity} pcs
                  </li>
                ))}
              </ul>
            </div>

            <div className="order-live-summary-card" style={{ marginBottom: '20px' }}>
              <div className="live-summary-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="summary-item" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '8px' }}>
                  <span className="sum-label" style={{ fontWeight: 600 }}>Total Tagihan Siswa:</span>
                  <span className="sum-value primary" style={{ fontWeight: 700, fontSize: '1.1rem' }}>{formatRupiah(detailOrder.totalPriceStudent)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>Status Pelunasan</div>
                {detailOrder.paymentStatus === 'paid' ? (
                  <span className="badge-pay-paid">✅ Lunas ke Koperasi</span>
                ) : (
                  <span className="badge-pay-unpaid">⏳ Menunggu Pelunasan</span>
                )}
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>Status Pengiriman</div>
                <span className={`status-badge ${detailOrder.status}`}>
                  {detailOrder.status === 'pending' && '⏳ Menunggu Persetujuan'}
                  {detailOrder.status === 'approved' && '👍 Disetujui (Siap Kirim)'}
                  {detailOrder.status === 'shipped' && '🚚 Sedang Dikirim'}
                  {detailOrder.status === 'received' && '✅ Selesai Diterima'}
                  {detailOrder.status === 'cancellation_requested' && '⏳ Permintaan Batal'}
                  {detailOrder.status === 'cancelled' && '🚫 Dibatalkan'}
                  {detailOrder.status === 'rejected' && '❌ Ditolak Koperasi'}
                </span>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDetailOrder(null)}
                style={{ width: '100%' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolPemesanan;
