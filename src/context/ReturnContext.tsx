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
  createReturn: (data: CreateReturnInput) => Promise<{ success: boolean; id?: string; error?: string }>;
  acceptReturn: (returnId: string, data: AcceptReturnInput) => Promise<void>;
  rejectReturn: (returnId: string, data: RejectReturnInput) => Promise<void>;
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
      acceptedAt: d.accepted_at,
      acceptedAtDate: d.accepted_at_date,
      acceptedAtTime: d.accepted_at_time,
      acceptedByName: d.accepted_by_name,
      acceptedNotes: d.accepted_notes,
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
      if (!data.departureDate || !data.departureTime) {
        return { success: false, error: 'Tanggal dan jam keberangkatan barang wajib diisi.' };
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
        departure_date: data.departureDate,
        departure_time: data.departureTime,
        shipping_note: data.shippingNote?.trim() || null,
        status: 'requested',
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

  const acceptReturn = useCallback(async (returnId: string, data: AcceptReturnInput) => {
    const updates = {
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_at_date: data.acceptedAtDate,
      accepted_at_time: data.acceptedAtTime,
      accepted_by_name: data.acceptedByName,
      accepted_notes: data.acceptedNotes,
      is_restocked: Boolean(data.isRestocked),
    };
    
    const { error } = await supabase.from('returns').update(updates).eq('id', returnId);
    if (!error) {
      await fetchReturns();
    } else {
      console.error('Error accepting return:', error);
    }
  }, [fetchReturns]);

  const rejectReturn = useCallback(async (returnId: string, data: RejectReturnInput) => {
    const updates = {
      status: 'rejected',
      rejected_by_name: data.rejectedByName,
      rejection_reason: data.rejectionReason,
    };
    
    const { error } = await supabase.from('returns').update(updates).eq('id', returnId);
    if (!error) {
      await fetchReturns();
    } else {
      console.error('Error rejecting return:', error);
    }
  }, [fetchReturns]);

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
