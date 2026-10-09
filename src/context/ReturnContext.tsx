import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ReturnRequest, ReturnItem, SchoolLevel } from '../types';
import { supabase } from '../lib/supabase';

interface CreateReturnInput {
  schoolUserId: string;
  schoolName: string;
  schoolLevel?: SchoolLevel;
  items: ReturnItem[];
  reasonCategory?: string;
  reason: string;
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
  createReturn: (data: CreateReturnInput) => Promise<{ success: boolean; id?: string; error?: string }>;
  confirmReturn: (returnId: string, data: { confirmedByName: string }) => Promise<{ success: boolean, error?: string }>;
  shipReturn: (returnId: string, data: { departureDate: string; departureTime: string; shippingNote: string }) => Promise<{ success: boolean; error?: string }>;
  receiveReturn: (returnId: string, data: AcceptReturnInput) => Promise<{ success: boolean; error?: string }>;
  rejectReturn: (returnId: string, data: RejectReturnInput) => Promise<{ success: boolean; error?: string }>;
  getReturnsBySchoolId: (schoolUserId: string) => ReturnRequest[];
  pendingCount: number;
}

const ReturnContext = createContext<ReturnContextType | null>(null);

export function ReturnProvider({ children }: { children: ReactNode }) {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);

  const fetchReturns = useCallback(async () => {
    const { data, error } = await supabase.from('returns').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching returns:', error);
      return;
    }
    const mapped: ReturnRequest[] = data.map(d => ({
      id: d.id,
      schoolUserId: d.school_user_id,
      schoolName: d.school_name,
      schoolLevel: d.school_level,
      items: d.items,
      reasonCategory: d.reason_category,
      reason: d.reason,
      departureDate: d.departure_date,
      departureTime: d.departure_time,
      shippingNote: d.shipping_note,
      status: d.status,
      createdAt: d.created_at,
      
      confirmedAt: d.confirmed_at,
      confirmedByName: d.confirmed_by_name,
      
      sekolahDikirimAt: d.sekolah_dikirim_at,
      sekolahDikirimNotes: d.sekolah_dikirim_notes,
      
      koperasiDiterimaAt: d.koperasi_diterima_at,
      koperasiDiterimaByName: d.koperasi_diterima_by_name,
      koperasiDiterimaNotes: d.koperasi_diterima_notes,
      
      rejectedAt: d.rejected_at,
      rejectedByName: d.rejected_by_name,
      rejectionReason: d.rejection_reason,
      isRestocked: d.is_restocked
    }));
    setReturns(mapped);
  }, []);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  const generateReturnId = useCallback(() => {
    const year = new Date().getFullYear();
    const count = returns.length + 1;
    return `RET-${year}-${String(count).padStart(3, '0')}`;
  }, [returns.length]);

  const createReturn = useCallback(
    async (data: CreateReturnInput): Promise<{ success: boolean; id?: string; error?: string }> => {
      if (!data.schoolUserId || !data.schoolName) {
        return { success: false, error: 'Data sekolah tidak valid.' };
      }
      if (!data.items || data.items.length === 0) {
        return { success: false, error: 'Minimal harus ada 1 barang yang diretur.' };
      }
      if (!data.reason.trim()) {
        return { success: false, error: 'Alasan retur wajib diisi.' };
      }

      const newId = generateReturnId();
      
      const newReturn = {
        id: newId,
        school_user_id: data.schoolUserId,
        school_name: data.schoolName,
        school_level: data.schoolLevel,
        items: data.items,
        reason_category: data.reasonCategory || 'Lainnya',
        reason: data.reason.trim(),
        departure_date: '-',
        departure_time: '-',
        shipping_note: '-',
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('returns').insert([newReturn]);
      if (error) {
        console.error('Error creating return:', error);
        return { success: false, error: error.message };
      }
      
      await fetchReturns();
      return { success: true, id: newId };
    },
    [generateReturnId, fetchReturns]
  );

  const confirmReturn = useCallback(async (returnId: string, data: { confirmedByName: string }) => {
    const updates = {
      status: 'koperasi_confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by_name: data.confirmedByName,
    };
    
    const { error } = await supabase.from('returns').update(updates).eq('id', returnId);
    if (!error) {
      await fetchReturns();
      return { success: true };
    } else {
      console.error('Error confirming return:', error);
      return { success: false, error: error.message };
    }
  }, [fetchReturns]);

  const shipReturn = useCallback(async (returnId: string, data: { departureDate: string; departureTime: string; shippingNote: string }) => {
    const updates = {
      status: 'sekolah_dikirim',
      sekolah_dikirim_at: new Date().toISOString(),
      departure_date: data.departureDate,
      departure_time: data.departureTime,
      shipping_note: data.shippingNote,
    };
    
    const { error } = await supabase.from('returns').update(updates).eq('id', returnId);
    if (!error) {
      await fetchReturns();
      return { success: true };
    } else {
      console.error('Error shipping return:', error);
      return { success: false, error: error.message };
    }
  }, [fetchReturns]);

  const receiveReturn = useCallback(async (returnId: string, data: AcceptReturnInput) => {
    const updates = {
      status: 'koperasi_diterima',
      koperasi_diterima_at: new Date().toISOString(),
      koperasi_diterima_by_name: data.acceptedByName,
      koperasi_diterima_notes: data.acceptedNotes,
      is_restocked: Boolean(data.isRestocked),
    };
    
    const { error } = await supabase.from('returns').update(updates).eq('id', returnId);
    if (!error) {
      const currentReturn = returns.find(r => r.id === returnId);
      if (currentReturn) {
        let totalTagihanKredit = 0;
        let totalFeeKredit = 0;

        for (const item of currentReturn.items) {
          if (item.productId) {
            const { data: pData } = await supabase.from('products').select('stock, stock_rusak, price_student, fee_school').eq('id', item.productId).single();
            if (pData) {
              totalTagihanKredit += (Number(pData.price_student) || 0) * item.quantity;
              totalFeeKredit += (Number(pData.fee_school) || 0) * item.quantity;

              if (data.isRestocked) {
                await supabase.from('products').update({ stock: pData.stock + item.quantity }).eq('id', item.productId);
              } else if (currentReturn.reasonCategory === 'Rusak') {
                await supabase.from('products').update({ stock_rusak: (pData.stock_rusak || 0) + item.quantity }).eq('id', item.productId);
              }
            }
          }
        }

        // Add credit to school's app_users record
        if (totalTagihanKredit > 0 || totalFeeKredit > 0) {
          const { data: schoolData } = await supabase.from('app_users').select('return_balance_tagihan, return_balance_fee').eq('id', currentReturn.schoolUserId).single();
          if (schoolData) {
            await supabase.from('app_users').update({
              return_balance_tagihan: (Number(schoolData.return_balance_tagihan) || 0) + totalTagihanKredit,
              return_balance_fee: (Number(schoolData.return_balance_fee) || 0) + totalFeeKredit
            }).eq('id', currentReturn.schoolUserId);
          }
        }
      }

      await fetchReturns();
      return { success: true };
    } else {
      console.error('Error receiving return:', error);
      return { success: false, error: error.message };
    }
  }, [fetchReturns, returns]);

  const rejectReturn = useCallback(async (returnId: string, data: RejectReturnInput) => {
    const updates = {
      status: 'rejected',
      rejected_by_name: data.rejectedByName,
      rejection_reason: data.rejectionReason,
    };
    
    const { error } = await supabase.from('returns').update(updates).eq('id', returnId);
    if (!error) {
      await fetchReturns();
      return { success: true };
    } else {
      console.error('Error rejecting return:', error);
      return { success: false, error: error.message };
    }
  }, [fetchReturns]);

  const getReturnsBySchoolId = useCallback(
    (schoolUserId: string) => {
      return returns.filter((r) => r.schoolUserId === schoolUserId);
    },
    [returns]
  );

  const pendingCount = returns.filter((r) => r.status === 'pending').length;

  return (
    <ReturnContext.Provider
      value={{
        returns,
        createReturn,
        confirmReturn,
        shipReturn,
        receiveReturn,
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
