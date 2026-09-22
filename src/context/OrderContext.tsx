import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Order, ShippingInfo, ReceiveInfo, CancellationInfo } from '../types';

interface OrderContextType {
  orders: Order[];
  createOrder: (orderData: Omit<Order, 'id' | 'status' | 'createdAt' | 'totalPriceKopkar' | 'totalFeeSchool' | 'totalPriceStudent' | 'paymentStatus' | 'feeStatus'>) => { success: boolean; error?: string };
  approveOrder: (orderId: string, processorName: string) => void;
  rejectOrder: (orderId: string, processorName: string, reason: string) => void;
  shipOrder: (orderId: string, shippingData: Omit<ShippingInfo, never>) => void;
  receiveOrder: (orderId: string, receiveData: { receivedBy: string; isChecked: boolean; notes?: string }) => void;
  requestCancelOrder: (orderId: string, reason: string, schoolUserName: string) => void;
  approveCancelOrder: (orderId: string, stafName: string) => void;
  kopkarCancelOrder: (orderId: string, reason: string, stafName: string) => void;
  markOrderAsPaid: (orderId: string, notes?: string) => void;
  disburseSchoolFee: (orderId: string, stafName: string, notes?: string) => void;
  getOrdersBySchoolId: (schoolUserId: string) => Order[];
}

const OrderContext = createContext<OrderContextType | null>(null);

const ORDERS_KEY = 'koperasi_orders_v3';

const INITIAL_ORDERS: Order[] = [
  {
    id: 'ORD-2026-001',
    schoolUserId: 'user-demo-smpk1',
    schoolName: 'SMPK 1 PENABUR Jakarta',
    schoolLevel: 'SMP',
    items: [
      {
        name: 'Seragam Putih Biru SMP PENABUR',
        type: 'seragam',
        quantity: 50,
        priceKopkar: 105000,
        feeSchool: 20000,
        priceStudent: 125000,
      },
      {
        name: 'Seragam Pramuka SMP PENABUR',
        type: 'seragam',
        quantity: 50,
        priceKopkar: 110000,
        feeSchool: 20000,
        priceStudent: 130000,
      },
    ],
    totalPriceKopkar: 10750000,
    totalFeeSchool: 2000000,
    totalPriceStudent: 12750000,
    paymentStatus: 'paid',
    paidAt: new Date(Date.now() - 86400000).toISOString(),
    paidNotes: 'Pelunasan transfer Bank Mandiri Rekening Koperasi',
    feeStatus: 'ready', // Siap dicairkan ke sekolah karena sudah lunas!
    status: 'received',
    notes: 'Pengadaan seragam gelombang 1 tahun ajaran baru.',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    processedBy: 'Budi Santoso (Kopkar)',
    processedAt: new Date(Date.now() - 86400000 * 2.5).toISOString(),
    shippingInfo: {
      shippedAtDate: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
      shippedAtTime: '09:30',
      courierNotes: 'Armada Mobil Box Koperasi (B 1234 CD) - Pengemudi Bpk Joko',
      shippedBy: 'Budi Santoso (Kopkar)',
    },
    receiveInfo: {
      receivedAt: new Date(Date.now() - 86400000).toISOString(),
      receivedBy: 'Ibu Ratna (PIC SMPK 1)',
      isChecked: true,
      notes: 'Barang diterima lengkap dan kualitas kain sangat baik.',
    },
  },
  {
    id: 'ORD-2026-002',
    schoolUserId: 'user-demo-smpk1',
    schoolName: 'SMPK 1 PENABUR Jakarta',
    schoolLevel: 'SMP',
    items: [
      {
        name: 'Buku Siswa Matematika Kelas 7 SMP',
        type: 'buku',
        quantity: 100,
        priceKopkar: 75000,
        feeSchool: 15000,
        priceStudent: 90000,
      },
    ],
    totalPriceKopkar: 7500000,
    totalFeeSchool: 1500000,
    totalPriceStudent: 9000000,
    paymentStatus: 'unpaid',
    feeStatus: 'locked', // Belum bisa dicairkan karena sekolah belum lunas
    status: 'shipped',
    notes: 'Bahan ajar semester 1.',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    processedBy: 'Budi Santoso (Kopkar)',
    processedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    shippingInfo: {
      shippedAtDate: new Date().toISOString().split('T')[0],
      shippedAtTime: '08:00',
      courierNotes: 'Kurir Koperasi - Bpk Supardi',
      shippedBy: 'Budi Santoso (Kopkar)',
    },
  },
  {
    id: 'ORD-2026-003',
    schoolUserId: 'user-demo-sdk1',
    schoolName: 'SDK 1 PENABUR Jakarta',
    schoolLevel: 'SD',
    items: [
      {
        name: 'Seragam Batik Khas BPK PENABUR SD',
        type: 'seragam',
        quantity: 80,
        priceKopkar: 90000,
        feeSchool: 20000,
        priceStudent: 110000,
      },
    ],
    totalPriceKopkar: 7200000,
    totalFeeSchool: 1600000,
    totalPriceStudent: 8800000,
    paymentStatus: 'unpaid',
    feeStatus: 'locked',
    status: 'pending',
    notes: 'Mohon dicek ketersediaan ukuran M dan L.',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
];

function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }
  localStorage.setItem(ORDERS_KEY, JSON.stringify(INITIAL_ORDERS));
  return INITIAL_ORDERS;
}

function saveOrders(orders: Order[]) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(() => loadOrders());

  useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  const createOrder = useCallback(
    (orderData: Omit<Order, 'id' | 'status' | 'createdAt' | 'totalPriceKopkar' | 'totalFeeSchool' | 'totalPriceStudent' | 'paymentStatus' | 'feeStatus'>) => {
      if (!orderData.items || orderData.items.length === 0) {
        return { success: false, error: 'Daftar item pesanan tidak boleh kosong' };
      }

      // Calculate total Kopkar, total Fee School, total Student
      let totalPriceKopkar = 0;
      let totalFeeSchool = 0;
      let totalPriceStudent = 0;

      for (const it of orderData.items) {
        totalPriceKopkar += (it.priceKopkar || 0) * it.quantity;
        totalFeeSchool += (it.feeSchool || 0) * it.quantity;
        totalPriceStudent += (it.priceStudent || (it.priceKopkar + it.feeSchool)) * it.quantity;
      }

      const randomNum = Math.floor(100 + Math.random() * 900);
      const newOrder: Order = {
        ...orderData,
        id: `ORD-2026-${randomNum}`,
        totalPriceKopkar,
        totalFeeSchool,
        totalPriceStudent,
        paymentStatus: 'unpaid',
        feeStatus: 'locked',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      setOrders((prev) => [newOrder, ...prev]);
      return { success: true };
    },
    []
  );

  const approveOrder = useCallback((orderId: string, processorName: string) => {
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          return {
            ...ord,
            status: 'approved',
            processedBy: processorName,
            processedAt: new Date().toISOString(),
            rejectionReason: undefined,
          };
        }
        return ord;
      })
    );
  }, []);

  const rejectOrder = useCallback((orderId: string, processorName: string, reason: string) => {
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          return {
            ...ord,
            status: 'rejected',
            processedBy: processorName,
            processedAt: new Date().toISOString(),
            rejectionReason: reason,
          };
        }
        return ord;
      })
    );
  }, []);

  const shipOrder = useCallback((orderId: string, shippingData: ShippingInfo) => {
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          return {
            ...ord,
            status: 'shipped',
            shippingInfo: shippingData,
          };
        }
        return ord;
      })
    );
  }, []);

  const receiveOrder = useCallback(
    (orderId: string, receiveData: { receivedBy: string; isChecked: boolean; notes?: string }) => {
      const receiveInfo: ReceiveInfo = {
        receivedAt: new Date().toISOString(),
        receivedBy: receiveData.receivedBy,
        isChecked: receiveData.isChecked,
        notes: receiveData.notes,
      };

      setOrders((prev) =>
        prev.map((ord) => {
          if (ord.id === orderId) {
            return {
              ...ord,
              status: 'received',
              receiveInfo,
            };
          }
          return ord;
        })
      );
    },
    []
  );

  const requestCancelOrder = useCallback((orderId: string, reason: string, schoolUserName: string) => {
    const cancelInfo: CancellationInfo = {
      cancelledByRole: 'sekolah',
      cancelledByName: schoolUserName,
      reason,
      requestedAt: new Date().toISOString(),
      cancelledAt: '',
    };

    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          return {
            ...ord,
            status: 'cancellation_requested',
            cancellationInfo: cancelInfo,
          };
        }
        return ord;
      })
    );
  }, []);

  const approveCancelOrder = useCallback((orderId: string, stafName: string) => {
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          return {
            ...ord,
            status: 'cancelled',
            cancellationInfo: {
              ...(ord.cancellationInfo || {
                cancelledByRole: 'sekolah',
                cancelledByName: 'Sekolah',
                reason: 'Dibatalkan',
                requestedAt: new Date().toISOString(),
              }),
              cancelledAt: new Date().toISOString(),
              reason: `${ord.cancellationInfo?.reason || 'Pengajuan pembatalan sekolah'} (Disetujui oleh ${stafName})`,
            },
          };
        }
        return ord;
      })
    );
  }, []);

  const kopkarCancelOrder = useCallback((orderId: string, reason: string, stafName: string) => {
    const cancelInfo: CancellationInfo = {
      cancelledByRole: 'kopkar',
      cancelledByName: stafName,
      reason,
      cancelledAt: new Date().toISOString(),
    };

    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          return {
            ...ord,
            status: 'cancelled',
            cancellationInfo: cancelInfo,
          };
        }
        return ord;
      })
    );
  }, []);

  // Konfirmasi Pelunasan Pembayaran Sekolah ke Koperasi (Uang Siswa Masuk ke Koperasi)
  const markOrderAsPaid = useCallback((orderId: string, notes?: string) => {
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          return {
            ...ord,
            paymentStatus: 'paid',
            paidAt: new Date().toISOString(),
            paidNotes: notes || 'Pembayaran telah diverifikasi lunas oleh Koperasi',
            feeStatus: 'ready', // Setelah pelunasan, status fee menjadi SIAP dicairkan ke sekolah!
          };
        }
        return ord;
      })
    );
  }, []);

  // Koperasi Membayarkan/Mentransfer Fee Hak Sekolah
  const disburseSchoolFee = useCallback((orderId: string, stafName: string, notes?: string) => {
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id === orderId) {
          return {
            ...ord,
            feeStatus: 'disbursed',
            feeDisbursedAt: new Date().toISOString(),
            feeDisbursedBy: stafName,
            feeDisbursedNotes: notes || 'Fee sekolah telah ditransfer ke rekening sekolah',
          };
        }
        return ord;
      })
    );
  }, []);

  const getOrdersBySchoolId = useCallback(
    (schoolUserId: string) => {
      return orders.filter((ord) => ord.schoolUserId === schoolUserId);
    },
    [orders]
  );

  return (
    <OrderContext.Provider
      value={{
        orders,
        createOrder,
        approveOrder,
        rejectOrder,
        shipOrder,
        receiveOrder,
        requestCancelOrder,
        approveCancelOrder,
        kopkarCancelOrder,
        markOrderAsPaid,
        disburseSchoolFee,
        getOrdersBySchoolId,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders(): OrderContextType {
  const ctx = useContext(OrderContext);
  if (!ctx) {
    throw new Error('useOrders must be used within an OrderProvider');
  }
  return ctx;
}
