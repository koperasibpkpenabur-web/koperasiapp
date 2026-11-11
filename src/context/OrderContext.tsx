import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Order, OrderItem, ShippingInfo, ReceiveInfo, CancellationInfo } from '../types';
import { supabase } from '../lib/supabase';
import { resolveItemUnit } from '../utils/formatUnit';
import { getWibCompactDateString } from '../utils/dateWib';
import { findMatchingOrderLine } from '../utils/orderItemMatch';

interface OrderContextType {
  createOrder: (orderData: Omit<Order, 'id' | 'status' | 'createdAt' | 'totalPriceKopkar' | 'totalFeeSchool' | 'totalPriceStudent' | 'paymentStatus' | 'feeStatus'>, initialStatus?: import('../types').OrderStatus) => Promise<{ success: boolean; newOrderId?: string; error?: string }>;
  approveOrder: (orderId: string, processorName: string) => Promise<void>;
  rejectOrder: (orderId: string, processorName: string, reason: string) => Promise<void>;
  saveShippingInfo: (orderId: string, shippingData: ShippingInfo) => Promise<void>;
  shipOrder: (orderId: string, shippingData: Omit<ShippingInfo, never>) => Promise<void>;
  shipRemainingOrder: (orderId: string, additionalShippingData: Omit<ShippingInfo, never>) => Promise<void>;
  cancelShipment: (orderId: string) => Promise<void>;
  receiveOrder: (orderId: string, receiveData: { receivedBy: string; isChecked: boolean; notes?: string }) => Promise<void>;
  partialReceiveOrder: (orderId: string, receiveData: { receivedBy: string; isChecked: boolean; notes?: string; receivedItems: any[] }) => Promise<void>;
  requestCancelOrder: (orderId: string, reason: string, schoolUserName: string) => Promise<void>;
  approveCancelOrder: (orderId: string, stafName: string) => Promise<void>;
  kopkarCancelOrder: (orderId: string, reason: string, stafName: string) => Promise<void>;
  markOrderAsPaid: (orderId: string, notes?: string) => Promise<void>;
  uploadPaymentReceipt: (orderId: string, url: string) => Promise<void>;
  disburseSchoolFee: (orderId: string, stafName: string, notes?: string) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  getOrdersBySchoolId: (schoolUserId: string) => Promise<Order[]>;
  cartItems: OrderItem[];
  setCartItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  showCartModal: boolean;
  setShowCartModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const OrderContext = createContext<OrderContextType | null>(null);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [showCartModal, setShowCartModal] = useState(false);

  const createOrder = useCallback(
    async (
      orderData: Omit<Order, 'id' | 'status' | 'createdAt' | 'totalPriceKopkar' | 'totalFeeSchool' | 'totalPriceStudent' | 'paymentStatus' | 'feeStatus'>,
      initialStatus?: import('../types').OrderStatus
    ) => {
      if (!orderData.items || orderData.items.length === 0) {
        return { success: false, error: 'Daftar item pesanan tidak boleh kosong' };
      }

      let totalPriceKopkar = 0;
      let totalFeeSchool = 0;
      let totalPriceStudent = 0;

      for (const it of orderData.items) {
        totalPriceKopkar += (it.priceKopkar || 0) * it.quantity;
        totalFeeSchool += (it.feeSchool || 0) * it.quantity;
        totalPriceStudent += (it.priceStudent || (it.priceKopkar + it.feeSchool)) * it.quantity;
      }

      const now = new Date().toISOString();
      const finalStatus = initialStatus || 'pending';
      let newOrderId = '';

      const broadcastNewOrder = (orderId: string) => {
        try {
          const orderChannel = supabase.channel('order_realtime_broadcast');
          orderChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              orderChannel.send({
                type: 'broadcast',
                event: 'new_order',
                payload: {
                  id: orderId,
                  school_name: orderData.schoolName,
                  created_at: now,
                },
              });
            }
          });
        } catch (broadcastErr) {
          console.warn('Realtime broadcast error:', broadcastErr);
        }
      };

      // Pesanan On The Spot (Guru OTS): validasi stok ketat & potong stok gudang secara atomic di Postgres
      if (finalStatus === 'received') {
        const rpcItems = orderData.items.map((it) => ({
          productId: it.productId,
          code: it.code,
          name: it.name,
          type: it.type,
          quantity: it.quantity,
          priceKopkar: it.priceKopkar,
          feeSchool: it.feeSchool,
          priceStudent: it.priceStudent || (it.priceKopkar + it.feeSchool),
          size: it.size,
          unit: it.unit || resolveItemUnit(it, it.quantity),
        }));

        const { data: otsRes, error: otsErr } = await supabase.rpc('create_ots_order_atomic', {
          p_school_user_id: orderData.schoolUserId,
          p_school_name: orderData.schoolName,
          p_school_level: orderData.schoolLevel || null,
          p_order_phase: orderData.orderPhase || 'On The Spot',
          p_notes: orderData.notes || null,
          p_items: rpcItems,
        });

        if (otsErr) {
          if (otsErr.code === 'PGRST202') {
            return {
              success: false,
              error: 'Fungsi validasi stok OTS atomic belum terpasang di database. Jalankan script supabase_hardening_tahap1_central_data.sql terlebih dahulu.'
            };
          }
          return { success: false, error: otsErr.message };
        }

        if (!otsRes?.success) {
          return { success: false, error: otsRes?.error || 'Gagal membuat pesanan On The Spot.' };
        }

        newOrderId = otsRes.order_id;
        broadcastNewOrder(newOrderId);
        return { success: true, newOrderId };
      }

      // 1. Coba dapatkan nomor order secara atomic melalui RPC Postgres (anti-bentrok / race condition)
      try {
        const { data: rpcOrderId, error: rpcError } = await supabase.rpc('generate_order_id');
        if (!rpcError && rpcOrderId && typeof rpcOrderId === 'string' && rpcOrderId.startsWith('ORD-')) {
          newOrderId = rpcOrderId;
        }
      } catch (e) {
        console.warn('RPC generate_order_id fallback to client-side:', e);
      }

      // 2. Fallback aman WIB jika RPC belum di-execute di Supabase
      if (!newOrderId) {
        const dateForId = getWibCompactDateString();
        const prefix = `ORD-${dateForId}-`;
        const { data: todayOrders } = await supabase
          .from('orders')
          .select('id')
          .like('id', `${prefix}%`);

        let maxSeq = 0;
        if (todayOrders && todayOrders.length > 0) {
          for (const row of todayOrders) {
            const parts = (row.id || '').split('-');
            if (parts.length >= 3) {
              const num = parseInt(parts[2], 10);
              if (!isNaN(num) && num > maxSeq) {
                maxSeq = num;
              }
            }
          }
        }

        const seq = String(maxSeq + 1).padStart(3, '0');
        newOrderId = `ORD-${dateForId}-${seq}`;
      }

      const orderPayload: any = {
        id: newOrderId,
        school_user_id: orderData.schoolUserId,
        school_name: orderData.schoolName,
        school_level: orderData.schoolLevel,
        order_phase: orderData.orderPhase,
        status: finalStatus,
        notes: orderData.notes,
        total_price_kopkar: totalPriceKopkar,
        total_fee_school: totalFeeSchool,
        total_price_student: totalPriceStudent,
        payment_status: 'unpaid',
        fee_status: 'locked',
        created_at: now
      };

      const { error: orderError } = await supabase.from('orders').insert([orderPayload]);

      if (orderError) return { success: false, error: orderError.message };

      const itemsToInsert = orderData.items.map(it => ({
        order_id: newOrderId,
        product_id: it.productId,
        code: it.code,
        name: it.name,
        type: it.type,
        quantity: it.quantity,
        price_kopkar: it.priceKopkar,
        fee_school: it.feeSchool,
        price_student: it.priceStudent,
        size: it.size,
        unit: it.unit || resolveItemUnit(it, it.quantity)
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
      
      if (itemsError) return { success: false, error: itemsError.message };

      // Kirim sinyal broadcast realtime ke role Kopkar agar langsung muncul notifikasi & refresh
      broadcastNewOrder(newOrderId);

      return { success: true, newOrderId };
    },
    []
  );

  const updateOrderInSupabase = async (orderId: string, updates: any) => {
    const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (error) {
      console.error('Failed to update order in Supabase:', error);
      throw new Error(error.message);
    }
  };

  const approveOrder = useCallback(async (orderId: string, processorName: string) => {
    await updateOrderInSupabase(orderId, {
      status: 'approved',
      processed_by: processorName,
      processed_at: new Date().toISOString(),
      rejection_reason: null,
    });
  }, []);

  const rejectOrder = useCallback(async (orderId: string, processorName: string, reason: string) => {
    await updateOrderInSupabase(orderId, {
      status: 'rejected',
      processed_by: processorName,
      processed_at: new Date().toISOString(),
      rejection_reason: reason,
    });
  }, []);

  const saveShippingInfo = useCallback(async (orderId: string, shippingData: ShippingInfo) => {
    await updateOrderInSupabase(orderId, {
      shipping_info: shippingData,
    });
  }, []);

  const shipOrder = useCallback(async (orderId: string, shippingData: ShippingInfo) => {
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, name, type, size')
      .eq('order_id', orderId);

    const enrichedShippingData: ShippingInfo = {
      ...shippingData,
      shippedItems: (shippingData.shippedItems || []).map((si) => {
        if (si.productId) return si;
        const matched = findMatchingOrderLine(orderItems, si);
        return matched?.product_id ? { ...si, productId: matched.product_id } : si;
      }),
    };

    const { data, error } = await supabase.rpc('ship_order_atomic', {
      p_order_id: orderId,
      p_shipping_data: enrichedShippingData,
    });

    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error('Fungsi pengiriman atomic belum terpasang di database. Jalankan script supabase_hardening_tahap1_central_data.sql terlebih dahulu.');
      }
      throw new Error(error.message);
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Gagal memproses pengiriman pesanan.');
    }
  }, []);

  const shipRemainingOrder = useCallback(async (orderId: string, additionalShippingData: ShippingInfo) => {
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, name, type, size')
      .eq('order_id', orderId);

    const enrichedAdditionalData: ShippingInfo = {
      ...additionalShippingData,
      shippedItems: (additionalShippingData.shippedItems || []).map((si) => {
        if (si.productId) return si;
        const matched = findMatchingOrderLine(orderItems, si);
        return matched?.product_id ? { ...si, productId: matched.product_id } : si;
      }),
    };

    const { data, error } = await supabase.rpc('ship_remaining_order_atomic', {
      p_order_id: orderId,
      p_additional_shipping_data: enrichedAdditionalData,
    });

    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error('Fungsi pengiriman susulan atomic belum terpasang di database. Jalankan script supabase_hardening_tahap1_central_data.sql terlebih dahulu.');
      }
      throw new Error(error.message);
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Gagal memproses pengiriman susulan.');
    }
  }, []);

  const cancelShipment = useCallback(async (orderId: string) => {
    const { data, error } = await supabase.rpc('cancel_shipment_atomic', {
      p_order_id: orderId,
    });

    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error('Fungsi pembatalan pengiriman atomic belum terpasang di database. Jalankan script supabase_hardening_tahap1_central_data.sql terlebih dahulu.');
      }
      throw new Error(error.message);
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Gagal membatalkan pengiriman.');
    }
  }, []);

  const receiveOrder = useCallback(
    async (orderId: string, receiveData: { receivedBy: string; isChecked: boolean; notes?: string }) => {
      const receiveInfo: ReceiveInfo = {
        receivedAt: new Date().toISOString(),
        receivedBy: receiveData.receivedBy,
        isChecked: receiveData.isChecked,
        notes: receiveData.notes,
      };

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('receive_order_atomic', {
        p_order_id: orderId,
        p_receive_info: receiveInfo,
      });

      if (!rpcErr) {
        if (!rpcRes?.success) {
          throw new Error(rpcRes?.error || 'Gagal mengonfirmasi penerimaan barang.');
        }
        return;
      }

      if (rpcErr.code !== 'PGRST202') {
        throw new Error(rpcErr.message);
      }

      await updateOrderInSupabase(orderId, {
        status: 'received',
        receive_info: receiveInfo,
      });

      // 3-Way Matching fallback (sebelum RPC SQL dijalankan)
      const { data: orderRow } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
      if (orderRow && orderRow.shipping_info) {
        const shippingData = orderRow.shipping_info;
        let totalVendorHpp = 0;
        let vendorName = 'Unknown Vendor';
        
        for (const item of (orderRow.order_items || [])) {
          if (!item.product_id) continue;
          
          const shippedItem = findMatchingOrderLine<any>(shippingData.shippedItems, item);
          const vendorQty = shippedItem ? (shippedItem.vendorQty || 0) : (shippingData.source === 'vendor' ? item.quantity : 0);

          if (vendorQty > 0) {
            totalVendorHpp += item.price_kopkar * vendorQty;
            
            const { data: pData } = await supabase.from('products').select('supplier_name').eq('id', item.product_id).single();
            if (pData && pData.supplier_name) {
              vendorName = pData.supplier_name;
            }
          }
        }

        if (totalVendorHpp > 0) {
          await supabase.from('vendor_payables').insert([{
            vendor_name: vendorName,
            order_id: orderId,
            school_name: orderRow.school_name,
            total_amount: totalVendorHpp,
            status: 'pending'
          }]);
        }
      }
    },
    []
  );

  const partialReceiveOrder = useCallback(
    async (orderId: string, receiveData: { receivedBy: string; isChecked: boolean; notes?: string; receivedItems: any[] }) => {
      const receiveInfo: ReceiveInfo = {
        receivedAt: new Date().toISOString(),
        receivedBy: receiveData.receivedBy,
        isChecked: receiveData.isChecked,
        notes: receiveData.notes,
        isPartial: true,
        receivedItems: receiveData.receivedItems,
      };
      
      // Status tetap 'shipped', hanya update receive_info
      await updateOrderInSupabase(orderId, {
        receive_info: receiveInfo,
      });
    },
    []
  );

  const requestCancelOrder = useCallback(async (orderId: string, reason: string, schoolUserName: string) => {
    const cancelInfo: CancellationInfo = {
      cancelledByRole: 'sekolah',
      cancelledByName: schoolUserName,
      reason,
      requestedAt: new Date().toISOString(),
      cancelledAt: '',
    };
    await updateOrderInSupabase(orderId, {
      status: 'cancellation_requested',
      cancellation_info: cancelInfo,
    });
  }, []);

  const approveCancelOrder = useCallback(async (orderId: string, stafName: string) => {
    const { data: orderRow } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (!orderRow) return;
    
    const cancelInfo: CancellationInfo = {
      ...(orderRow.cancellation_info || {
        cancelledByRole: 'sekolah',
        cancelledByName: 'Sekolah',
        reason: 'Dibatalkan',
        requestedAt: new Date().toISOString(),
      }),
      cancelledAt: new Date().toISOString(),
      reason: `${orderRow.cancellation_info?.reason || 'Pengajuan pembatalan sekolah'} (Disetujui oleh ${stafName})`,
    };

    await updateOrderInSupabase(orderId, {
      status: 'cancelled',
      cancellation_info: cancelInfo,
    });
  }, []);

  const kopkarCancelOrder = useCallback(async (orderId: string, reason: string, stafName: string) => {
    const cancelInfo: CancellationInfo = {
      cancelledByRole: 'kopkar',
      cancelledByName: stafName,
      reason,
      cancelledAt: new Date().toISOString(),
    };
    await updateOrderInSupabase(orderId, {
      status: 'cancelled',
      cancellation_info: cancelInfo,
    });
  }, []);

  const markOrderAsPaid = useCallback(async (orderId: string, notes?: string) => {
    await updateOrderInSupabase(orderId, {
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      paid_notes: notes || 'Pembayaran telah diverifikasi lunas oleh Koperasi',
      fee_status: 'ready',
    });
  }, []);

  const uploadPaymentReceipt = useCallback(async (orderId: string, url: string) => {
    await updateOrderInSupabase(orderId, {
      paid_notes: `[BUKTI_TRANSFER] ${url}`,
    });
  }, []);

  const disburseSchoolFee = useCallback(async (orderId: string, stafName: string, notes?: string) => {
    await updateOrderInSupabase(orderId, {
      fee_status: 'disbursed',
      fee_disbursed_at: new Date().toISOString(),
      fee_disbursed_by: stafName,
      fee_disbursed_notes: notes || 'Fee sekolah telah ditransfer ke rekening sekolah',
    });
  }, []);

  const deleteOrder = async (orderId: string) => {
    // Delete order_items first due to foreign key
    await supabase.from('order_items').delete().eq('order_id', orderId);
    // Then delete order
    await supabase.from('orders').delete().eq('id', orderId);
  };

  const getOrdersBySchoolId = useCallback(async (schoolUserId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('school_user_id', schoolUserId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data.map((row: any) => ({
        id: row.id,
        schoolUserId: row.school_user_id,
        schoolName: row.school_name,
        schoolLevel: row.school_level,
        orderPhase: row.order_phase,
        status: row.status,
        notes: row.notes,
        totalPriceKopkar: Number(row.total_price_kopkar),
        totalFeeSchool: Number(row.total_fee_school),
        totalPriceStudent: Number(row.total_price_student),
        paymentStatus: row.payment_status,
        paidAt: row.paid_at,
        paidNotes: row.paid_notes,
        feeStatus: row.fee_status,
        feeDisbursedAt: row.fee_disbursed_at,
        feeDisbursedBy: row.fee_disbursed_by,
        feeDisbursedNotes: row.fee_disbursed_notes,
        processedBy: row.processed_by,
        processedAt: row.processed_at,
        rejectionReason: row.rejection_reason,
        shippingInfo: row.shipping_info,
        receiveInfo: row.receive_info,
        cancellationInfo: row.cancellation_info,
        createdAt: row.created_at,
        items: (row.order_items || []).map((item: any) => ({
          productId: item.product_id,
          code: item.code,
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          size: item.size,
          unit: item.unit || resolveItemUnit(item, item.quantity),
          priceKopkar: Number(item.price_kopkar),
          feeSchool: Number(item.fee_school),
          priceStudent: Number(item.price_student)
        }))
      })) as Order[];
    }
    return [];
  }, []);

  return (
    <OrderContext.Provider
      value={{
        createOrder,
        approveOrder,
        rejectOrder,
        saveShippingInfo,
        shipOrder,
        shipRemainingOrder,
        cancelShipment,
        receiveOrder,
        partialReceiveOrder,
        requestCancelOrder,
        approveCancelOrder,
        kopkarCancelOrder,
        markOrderAsPaid,
        uploadPaymentReceipt,
        disburseSchoolFee,
        deleteOrder,
        getOrdersBySchoolId,
        cartItems,
        setCartItems,
        showCartModal,
        setShowCartModal,
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
