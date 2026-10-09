import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Order, OrderItem, ShippingInfo, ReceiveInfo, CancellationInfo } from '../types';
import { supabase } from '../lib/supabase';

interface OrderContextType {
  createOrder: (orderData: Omit<Order, 'id' | 'status' | 'createdAt' | 'totalPriceKopkar' | 'totalFeeSchool' | 'totalPriceStudent' | 'paymentStatus' | 'feeStatus'>) => Promise<{ success: boolean; error?: string }>;
  approveOrder: (orderId: string, processorName: string) => Promise<void>;
  rejectOrder: (orderId: string, processorName: string, reason: string) => Promise<void>;
  saveShippingInfo: (orderId: string, shippingData: ShippingInfo) => Promise<void>;
  shipOrder: (orderId: string, shippingData: Omit<ShippingInfo, never>) => Promise<void>;
  cancelShipment: (orderId: string) => Promise<void>;
  receiveOrder: (orderId: string, receiveData: { receivedBy: string; isChecked: boolean; notes?: string }) => Promise<void>;
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
    async (orderData: Omit<Order, 'id' | 'status' | 'createdAt' | 'totalPriceKopkar' | 'totalFeeSchool' | 'totalPriceStudent' | 'paymentStatus' | 'feeStatus'>) => {
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
      const dateStr = now.split('T')[0];
      const dateForId = dateStr.replace(/-/g, '');
      
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${dateStr}T00:00:00.000Z`)
        .lte('created_at', `${dateStr}T23:59:59.999Z`);
        
      const seq = String((count || 0) + 1).padStart(3, '0');
      const newOrderId = `ORD-${dateForId}-${seq}`;

      const { error: orderError } = await supabase.from('orders').insert([{
        id: newOrderId,
        school_user_id: orderData.schoolUserId,
        school_name: orderData.schoolName,
        school_level: orderData.schoolLevel,
        order_phase: orderData.orderPhase,
        status: 'pending',
        notes: orderData.notes,
        total_price_kopkar: totalPriceKopkar,
        total_fee_school: totalFeeSchool,
        total_price_student: totalPriceStudent,
        payment_status: 'unpaid',
        fee_status: 'locked',
        created_at: now
      }]);

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
        size: (it as any).size // Types mismatch handled as any for now
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
      
      if (itemsError) return { success: false, error: itemsError.message };

      return { success: true };
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
    // 1. Update order status
    await updateOrderInSupabase(orderId, {
      status: 'shipped',
      shipping_info: shippingData,
    });

    // 2. Deduct stock based on source or split qtys
    const { data: orderRow } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
    if (orderRow && orderRow.order_items && orderRow.order_items.length > 0) {
      // Find assigned vendor for this school
      const { data: assignment } = await supabase.from('vendor_school_assignments')
        .select('vendor_id')
        .eq('school_user_id', orderRow.school_user_id)
        .single();
      const assignedVendorId = assignment?.vendor_id || null;

      for (const item of orderRow.order_items) {
        if (!item.product_id) continue;
        
        const shippedItem = shippingData.shippedItems?.find(si => si.name === item.name && si.type === item.type);
        const kopkarQty = shippedItem?.kopkarQty || 0;
        const vendorQty = shippedItem?.vendorQty || 0;

        if (vendorQty > 0 && assignedVendorId) {
          const { data: vStock } = await supabase.from('vendor_stocks')
            .select('id, quantity')
            .eq('vendor_id', assignedVendorId)
            .eq('product_id', item.product_id)
            .single();
            
          if (vStock) {
            const newQty = Math.max(0, (vStock.quantity || 0) - vendorQty);
            await supabase.from('vendor_stocks').update({ quantity: newQty }).eq('id', vStock.id);
          }
        }
        
        if (kopkarQty > 0) {
          const { data: pData } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
          if (pData) {
            const newStock = Math.max(0, (pData.stock || 0) - kopkarQty);
            await supabase.from('products').update({ stock: newStock }).eq('id', item.product_id);
          }
        }

        // Fallback for older orders without split logic
        if (kopkarQty === 0 && vendorQty === 0) {
          const qty = item.quantity;
          if (shippingData.source === 'vendor' && assignedVendorId) {
            const { data: vStock } = await supabase.from('vendor_stocks').select('id, quantity').eq('vendor_id', assignedVendorId).eq('product_id', item.product_id).single();
            if (vStock) {
              const newQty = Math.max(0, (vStock.quantity || 0) - qty);
              await supabase.from('vendor_stocks').update({ quantity: newQty }).eq('id', vStock.id);
            }
          } else {
            const { data: pData } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
            if (pData) {
              const newStock = Math.max(0, (pData.stock || 0) - qty);
              await supabase.from('products').update({ stock: newStock }).eq('id', item.product_id);
            }
          }
        }
      }
    }
  }, []);

  const cancelShipment = useCallback(async (orderId: string) => {
    // Fetch the order and shipping info first
    const { data: orderRow } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
    if (orderRow && orderRow.shipping_info) {
      const shippingData = orderRow.shipping_info;
      const assignedVendorId = orderRow.vendor_id;

      for (const item of (orderRow.order_items || [])) {
        if (!item.product_id) continue;

        const shippedItem = shippingData.shippedItems?.find((si: any) => si.name === item.name && si.type === item.type);
        const kopkarQty = shippedItem?.kopkarQty || 0;
        const vendorQty = shippedItem?.vendorQty || 0;

        if (vendorQty > 0 && assignedVendorId) {
          const { data: vStock } = await supabase.from('vendor_stocks').select('id, quantity').eq('vendor_id', assignedVendorId).eq('product_id', item.product_id).single();
          if (vStock) {
            await supabase.from('vendor_stocks').update({ quantity: (vStock.quantity || 0) + vendorQty }).eq('id', vStock.id);
          }
        }
        
        if (kopkarQty > 0) {
          const { data: pData } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
          if (pData) {
            await supabase.from('products').update({ stock: (pData.stock || 0) + kopkarQty }).eq('id', item.product_id);
          }
        }

        // Fallback for older orders
        if (kopkarQty === 0 && vendorQty === 0 && shippingData.source) {
          const qty = item.quantity;
          if (shippingData.source === 'vendor' && assignedVendorId) {
            const { data: vStock } = await supabase.from('vendor_stocks').select('id, quantity').eq('vendor_id', assignedVendorId).eq('product_id', item.product_id).single();
            if (vStock) {
              await supabase.from('vendor_stocks').update({ quantity: (vStock.quantity || 0) + qty }).eq('id', vStock.id);
            }
          } else {
            const { data: pData } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
            if (pData) {
              await supabase.from('products').update({ stock: (pData.stock || 0) + qty }).eq('id', item.product_id);
            }
          }
        }
      }
    }

    await updateOrderInSupabase(orderId, {
      status: 'approved',
      shipping_info: null,
    });
  }, []);

  const receiveOrder = useCallback(
    async (orderId: string, receiveData: { receivedBy: string; isChecked: boolean; notes?: string }) => {
      const receiveInfo: ReceiveInfo = {
        receivedAt: new Date().toISOString(),
        receivedBy: receiveData.receivedBy,
        isChecked: receiveData.isChecked,
        notes: receiveData.notes,
      };
      
      await updateOrderInSupabase(orderId, {
        status: 'received',
        receive_info: receiveInfo,
      });

      // 3-Way Matching: Create Vendor Payables IF shipped from vendor
      const { data: orderRow } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single();
      if (orderRow && orderRow.shipping_info) {
        const shippingData = orderRow.shipping_info;
        let totalVendorHpp = 0;
        let vendorName = 'Unknown Vendor';
        
        for (const item of (orderRow.order_items || [])) {
          if (!item.product_id) continue;
          
          const shippedItem = shippingData.shippedItems?.find((si: any) => si.name === item.name && si.type === item.type);
          const vendorQty = shippedItem ? (shippedItem.vendorQty || 0) : (shippingData.source === 'vendor' ? item.quantity : 0);

          if (vendorQty > 0) {
            totalVendorHpp += item.price_kopkar * vendorQty;
            
            // Get vendor name from product
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
