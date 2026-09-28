import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Order, OrderItem, ShippingInfo, ReceiveInfo, CancellationInfo } from '../types';
import { supabase } from '../lib/supabase';

interface OrderContextType {
  orders: Order[];
  createOrder: (orderData: Omit<Order, 'id' | 'status' | 'createdAt' | 'totalPriceKopkar' | 'totalFeeSchool' | 'totalPriceStudent' | 'paymentStatus' | 'feeStatus'>) => Promise<{ success: boolean; error?: string }>;
  approveOrder: (orderId: string, processorName: string) => Promise<void>;
  rejectOrder: (orderId: string, processorName: string, reason: string) => Promise<void>;
  shipOrder: (orderId: string, shippingData: Omit<ShippingInfo, never>) => Promise<void>;
  cancelShipment: (orderId: string) => Promise<void>;
  receiveOrder: (orderId: string, receiveData: { receivedBy: string; isChecked: boolean; notes?: string }) => Promise<void>;
  requestCancelOrder: (orderId: string, reason: string, schoolUserName: string) => Promise<void>;
  approveCancelOrder: (orderId: string, stafName: string) => Promise<void>;
  kopkarCancelOrder: (orderId: string, reason: string, stafName: string) => Promise<void>;
  markOrderAsPaid: (orderId: string, notes?: string) => Promise<void>;
  disburseSchoolFee: (orderId: string, stafName: string, notes?: string) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  getOrdersBySchoolId: (schoolUserId: string) => Order[];
  fetchOrders: () => Promise<void>;
  cartItems: OrderItem[];
  setCartItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  showCartModal: boolean;
  setShowCartModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const OrderContext = createContext<OrderContextType | null>(null);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [showCartModal, setShowCartModal] = useState(false);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)');
      
    if (!error && data) {
      const mappedOrders: Order[] = data.map((row: any) => ({
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
          priceKopkar: Number(item.price_kopkar),
          feeSchool: Number(item.fee_school),
          priceStudent: Number(item.price_student)
        }))
      }));
      setOrders(mappedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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

      const randomNum = Math.floor(100 + Math.random() * 900);
      const newOrderId = `ORD-${new Date().getFullYear()}-${randomNum}`;
      const now = new Date().toISOString();

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

      await fetchOrders();
      return { success: true };
    },
    [fetchOrders]
  );

  const updateOrderInSupabase = async (orderId: string, updates: any) => {
    await supabase.from('orders').update(updates).eq('id', orderId);
    await fetchOrders();
  };

  const approveOrder = useCallback(async (orderId: string, processorName: string) => {
    await updateOrderInSupabase(orderId, {
      status: 'approved',
      processed_by: processorName,
      processed_at: new Date().toISOString(),
      rejection_reason: null,
    });
  }, [fetchOrders]);

  const rejectOrder = useCallback(async (orderId: string, processorName: string, reason: string) => {
    await updateOrderInSupabase(orderId, {
      status: 'rejected',
      processed_by: processorName,
      processed_at: new Date().toISOString(),
      rejection_reason: reason,
    });
  }, [fetchOrders]);

  const shipOrder = useCallback(async (orderId: string, shippingData: ShippingInfo) => {
    // 1. Update order status
    await updateOrderInSupabase(orderId, {
      status: 'shipped',
      shipping_info: shippingData,
    });

    // 2. Deduct stock based on source
    const order = orders.find(o => o.id === orderId);
    if (order && order.items && order.items.length > 0) {
      for (const item of order.items) {
        if (!item.productId) continue;
        
        // fetch current stock
        const { data: pData } = await supabase.from('products').select('stock, stock_vendor').eq('id', item.productId).single();
        if (pData) {
          const qty = item.quantity;
          if (shippingData.source === 'vendor') {
            const newStockVendor = Math.max(0, (pData.stock_vendor || 0) - qty);
            await supabase.from('products').update({ stock_vendor: newStockVendor }).eq('id', item.productId);
          } else {
            const newStock = Math.max(0, (pData.stock || 0) - qty);
            await supabase.from('products').update({ stock: newStock }).eq('id', item.productId);
          }
        }
      }
    }
  }, [orders, fetchOrders]);

  const cancelShipment = useCallback(async (orderId: string) => {
    await updateOrderInSupabase(orderId, {
      status: 'approved',
      shipping_info: null,
    });
  }, [fetchOrders]);

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
      const order = orders.find(o => o.id === orderId);
      if (order && order.shippingInfo && order.shippingInfo.source === 'vendor') {
        // Find total HPP (Kopkar price) for this order
        let totalHpp = 0;
        let vendorName = 'Unknown Vendor';
        
        for (const item of order.items) {
          totalHpp += item.priceKopkar * item.quantity; // Note: if school only receives partial, this should ideally use received quantity, but for now we use order quantity.
          if (!item.productId) continue;
          
          // Get vendor name from product
          const { data: pData } = await supabase.from('products').select('supplier_name').eq('id', item.productId).single();
          if (pData && pData.supplier_name) {
            vendorName = pData.supplier_name;
          }
        }

        if (totalHpp > 0) {
          await supabase.from('vendor_payables').insert([{
            vendor_name: vendorName,
            order_id: orderId,
            school_name: order.schoolName,
            total_amount: totalHpp,
            status: 'pending'
          }]);
        }
      }
    },
    [fetchOrders]
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
  }, [fetchOrders]);

  const approveCancelOrder = useCallback(async (orderId: string, stafName: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const cancelInfo: CancellationInfo = {
      ...(order.cancellationInfo || {
        cancelledByRole: 'sekolah',
        cancelledByName: 'Sekolah',
        reason: 'Dibatalkan',
        requestedAt: new Date().toISOString(),
      }),
      cancelledAt: new Date().toISOString(),
      reason: `${order.cancellationInfo?.reason || 'Pengajuan pembatalan sekolah'} (Disetujui oleh ${stafName})`,
    };

    await updateOrderInSupabase(orderId, {
      status: 'cancelled',
      cancellation_info: cancelInfo,
    });
  }, [orders, fetchOrders]);

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
  }, [fetchOrders]);

  const markOrderAsPaid = useCallback(async (orderId: string, notes?: string) => {
    await updateOrderInSupabase(orderId, {
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      paid_notes: notes || 'Pembayaran telah diverifikasi lunas oleh Koperasi',
      fee_status: 'ready',
    });
  }, [fetchOrders]);

  const disburseSchoolFee = useCallback(async (orderId: string, stafName: string, notes?: string) => {
    await updateOrderInSupabase(orderId, {
      fee_status: 'disbursed',
      fee_disbursed_at: new Date().toISOString(),
      fee_disbursed_by: stafName,
      fee_disbursed_notes: notes || 'Fee sekolah telah ditransfer ke rekening sekolah',
    });
  }, [fetchOrders]);

  const deleteOrder = async (orderId: string) => {
    // Delete order_items first due to foreign key
    await supabase.from('order_items').delete().eq('order_id', orderId);
    // Then delete order
    await supabase.from('orders').delete().eq('id', orderId);
    await fetchOrders();
  };

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
        cancelShipment,
        receiveOrder,
        requestCancelOrder,
        approveCancelOrder,
        kopkarCancelOrder,
        markOrderAsPaid,
        disburseSchoolFee,
        deleteOrder,
        getOrdersBySchoolId,
        fetchOrders,
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
