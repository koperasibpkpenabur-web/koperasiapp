import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ReturnRequest, ReturnItem, SchoolLevel } from '../types';

interface CreateReturnInput {
  schoolUserId: string;
  schoolName: string;
  schoolLevel?: SchoolLevel;
  items: ReturnItem[];
  reasonCategory?: string;
  reason: string;
  departureDate: string;
  departureTime: string;
  shippingNote?: string;
}

interface AcceptReturnInput {
  acceptedByName: string;
  acceptedAtDate: string;
  acceptedAtTime: string;
  acceptedNotes: string;
  isRestocked?: boolean;
}

interface RejectReturnInput {
  rejectedByName: string;
  rejectionReason: string;
}

interface ReturnContextType {
  returns: ReturnRequest[];
  createReturn: (data: CreateReturnInput) => { success: boolean; id?: string; error?: string };
  acceptReturn: (returnId: string, data: AcceptReturnInput) => void;
  rejectReturn: (returnId: string, data: RejectReturnInput) => void;
  getReturnsBySchoolId: (schoolUserId: string) => ReturnRequest[];
  pendingCount: number;
}

const ReturnContext = createContext<ReturnContextType | null>(null);

const RETURNS_STORAGE_KEY = 'koperasi_returns_v1';

const INITIAL_RETURNS: ReturnRequest[] = [
  {
    id: 'RET-2026-001',
    schoolUserId: 'user-demo-smpk1',
    schoolName: 'SMPK 1 PENABUR Jakarta',
    schoolLevel: 'SMP',
    items: [
      {
        productId: 'prod-srg-smp-01',
        productCode: 'SRG-SMP-01',
        productName: 'Seragam Putih Biru SMP PENABUR (Size L)',
        quantity: 5,
        itemReason: 'Kancing terlepas & jahitan saku miring dari pabrik',
      },
    ],
    reasonCategory: 'Cacat Jahitan / Produksi',
    reason: 'Terdapat 5 pcs seragam ukuran L yang mengalami cacat jahitan pada bagian kancing dan saku kiri, mohon ditukar unit baru yang rapi.',
    departureDate: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
    departureTime: '08:30',
    shippingNote: 'Dikirim armada operasional sekolah (Avanza B 2940 KAS) - Diserahkan oleh Pak Joko',
    status: 'accepted',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    acceptedAt: new Date(Date.now() - 86400000).toISOString(),
    acceptedAtDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    acceptedAtTime: '11:15',
    acceptedByName: 'Budi Santoso (Gudang Kopkar)',
    acceptedNotes: 'Barang telah kami terima di gudang Koperasi dan diverifikasi fisik 5 pcs lengkap sesuai surat jalan. Penggantian unit sedang disiapkan tim pengadaan.',
    isRestocked: false,
  },
  {
    id: 'RET-2026-002',
    schoolUserId: 'user-demo-smpk1',
    schoolName: 'SMPK 1 PENABUR Jakarta',
    schoolLevel: 'SMP',
    items: [
      {
        productId: 'prod-bk-smp-01',
        productCode: 'BK-SMP-01',
        productName: 'Buku Siswa Matematika Kelas 7 SMP',
        quantity: 8,
        itemReason: 'Halaman cetak buram dan ada lembaran yang terbalik',
      },
      {
        productId: 'prod-srg-smp-02',
        productCode: 'SRG-SMP-02',
        productName: 'Seragam Pramuka SMP PENABUR (Size M)',
        quantity: 3,
        itemReason: 'Salah pesan ukuran oleh panitia sekolah',
      },
    ],
    reasonCategory: 'Buku Cacat Cetak & Salah Ukuran',
    reason: 'Pengembalian buku matematika yang cacat halaman cetak dan 3 pcs seragam pramuka untuk ditukar ke size XL.',
    departureDate: new Date().toISOString().split('T')[0],
    departureTime: '09:00',
    shippingNote: 'Kurir Sekolah Bpk Herman (Motor Honda Vario B 6789 PQR)',
    status: 'requested',
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
];

function loadReturns(): ReturnRequest[] {
  try {
    const raw = localStorage.getItem(RETURNS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load returns from localStorage', err);
  }
  return INITIAL_RETURNS;
}

export function ReturnProvider({ children }: { children: ReactNode }) {
  const [returns, setReturns] = useState<ReturnRequest[]>(loadReturns);

  useEffect(() => {
    try {
      localStorage.setItem(RETURNS_STORAGE_KEY, JSON.stringify(returns));
    } catch (err) {
      console.error('Failed to save returns to localStorage', err);
    }
  }, [returns]);

  const generateReturnId = useCallback(() => {
    const year = new Date().getFullYear();
    const count = returns.length + 1;
    return `RET-${year}-${String(count).padStart(3, '0')}`;
  }, [returns.length]);

  const createReturn = useCallback(
    (data: CreateReturnInput): { success: boolean; id?: string; error?: string } => {
      if (!data.schoolUserId || !data.schoolName) {
        return { success: false, error: 'Data sekolah tidak valid.' };
      }
      if (!data.items || data.items.length === 0) {
        return { success: false, error: 'Minimal harus ada 1 barang yang diretur.' };
      }
      if (!data.reason.trim()) {
        return { success: false, error: 'Alasan retur wajib diisi.' };
      }
      if (!data.departureDate || !data.departureTime) {
        return { success: false, error: 'Tanggal dan jam keberangkatan barang wajib diisi.' };
      }

      const newId = generateReturnId();
      const newReturn: ReturnRequest = {
        id: newId,
        schoolUserId: data.schoolUserId,
        schoolName: data.schoolName,
        schoolLevel: data.schoolLevel,
        items: data.items,
        reasonCategory: data.reasonCategory || 'Lainnya',
        reason: data.reason.trim(),
        departureDate: data.departureDate,
        departureTime: data.departureTime,
        shippingNote: data.shippingNote?.trim() || undefined,
        status: 'requested',
        createdAt: new Date().toISOString(),
      };

      setReturns((prev) => [newReturn, ...prev]);
      return { success: true, id: newId };
    },
    [generateReturnId]
  );

  const acceptReturn = useCallback((returnId: string, data: AcceptReturnInput) => {
    setReturns((prev) =>
      prev.map((ret) => {
        if (ret.id !== returnId) return ret;
        return {
          ...ret,
          status: 'accepted',
          acceptedAt: new Date().toISOString(),
          acceptedAtDate: data.acceptedAtDate,
          acceptedAtTime: data.acceptedAtTime,
          acceptedByName: data.acceptedByName,
          acceptedNotes: data.acceptedNotes,
          isRestocked: Boolean(data.isRestocked),
        };
      })
    );
  }, []);

  const rejectReturn = useCallback((returnId: string, data: RejectReturnInput) => {
    setReturns((prev) =>
      prev.map((ret) => {
        if (ret.id !== returnId) return ret;
        return {
          ...ret,
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectedByName: data.rejectedByName,
          rejectionReason: data.rejectionReason,
        };
      })
    );
  }, []);

  const getReturnsBySchoolId = useCallback(
    (schoolUserId: string) => {
      return returns.filter((r) => r.schoolUserId === schoolUserId);
    },
    [returns]
  );

  const pendingCount = returns.filter((r) => r.status === 'requested').length;

  return (
    <ReturnContext.Provider
      value={{
        returns,
        createReturn,
        acceptReturn,
        rejectReturn,
        getReturnsBySchoolId,
        pendingCount,
      }}
    >
      {children}
    </ReturnContext.Provider>
  );
}

export function useReturns(): ReturnContextType {
  const ctx = useContext(ReturnContext);
  if (!ctx) {
    throw new Error('useReturns must be used within a ReturnProvider');
  }
  return ctx;
}
