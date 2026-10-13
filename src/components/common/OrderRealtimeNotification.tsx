import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { playOrderNotificationSound } from '../../utils/sound';
import './OrderRealtimeNotification.css';

interface OrderToast {
  id: string;
  targetId: string;
  schoolName: string;
  type: 'order' | 'return';
  timestamp: number;
}

const OrderRealtimeNotification = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<OrderToast[]>([]);

  // Refs for tracking latest IDs and preventing duplicate notifications
  const latestOrderIdRef = useRef<string | null>(null);
  const lastProcessedOrderIdRef = useRef<string | null>(null);
  const latestReturnIdRef = useRef<string | null>(null);
  const lastProcessedReturnIdRef = useRef<string | null>(null);
  const isInitialFetchRef = useRef<boolean>(true);

  // 1. Handle incoming order
  const handleIncomingOrder = useCallback((order: { id: string; school_name?: string }) => {
    if (!order || !order.id) return;

    if (lastProcessedOrderIdRef.current === order.id) {
      return;
    }
    lastProcessedOrderIdRef.current = order.id;
    latestOrderIdRef.current = order.id;

    // Check notification setting (default is ON/true)
    const notifSetting = localStorage.getItem('kopkar_order_notif_enabled');
    const isEnabled = notifSetting === null ? true : notifSetting === 'true';

    // Dispatch event so active order pages auto-refresh data
    window.dispatchEvent(
      new CustomEvent('new-order-received', { detail: order })
    );

    if (isEnabled) {
      console.log('🔔 Memproses notifikasi pesanan baru (Status: ON):', order);
      playOrderNotificationSound();

      const toastId = `ord-${order.id}-${Date.now()}`;
      setToasts((prev) => [
        {
          id: toastId,
          targetId: order.id,
          schoolName: order.school_name || 'Sekolah',
          type: 'order',
          timestamp: Date.now(),
        },
        ...prev.slice(0, 3),
      ]);
    } else {
      console.log('🔕 Notifikasi pesanan diredam (Status: OFF). Data tetap diperbarui:', order);
    }
  }, []);

  // 2. Handle incoming return
  const handleIncomingReturn = useCallback((ret: { id: string; school_name?: string }) => {
    if (!ret || !ret.id) return;

    if (lastProcessedReturnIdRef.current === ret.id) {
      return;
    }
    lastProcessedReturnIdRef.current = ret.id;
    latestReturnIdRef.current = ret.id;

    // Check notification setting (default is ON/true)
    const notifSetting = localStorage.getItem('kopkar_order_notif_enabled');
    const isEnabled = notifSetting === null ? true : notifSetting === 'true';

    // Dispatch event so ReturnContext & Sidebar badge auto-refresh
    window.dispatchEvent(
      new CustomEvent('new-return-received', { detail: ret })
    );

    if (isEnabled) {
      console.log('↩️ Memproses notifikasi retur baru (Status: ON):', ret);
      playOrderNotificationSound();

      const toastId = `ret-${ret.id}-${Date.now()}`;
      setToasts((prev) => [
        {
          id: toastId,
          targetId: ret.id,
          schoolName: ret.school_name || 'Sekolah',
          type: 'return',
          timestamp: Date.now(),
        },
        ...prev.slice(0, 3),
      ]);
    } else {
      console.log('🔕 Notifikasi retur diredam (Status: OFF). Data tetap diperbarui:', ret);
    }
  }, []);

  // 3. Fallback polling for both orders and returns
  const checkForNewItems = useCallback(async () => {
    try {
      const [orderRes, returnRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, school_name, created_at')
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('returns')
          .select('id, school_name, created_at')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      const latestOrder = orderRes.data?.[0];
      const latestReturn = returnRes.data?.[0];

      if (isInitialFetchRef.current) {
        // Record existing IDs on page mount without ringing
        isInitialFetchRef.current = false;
        if (latestOrder) {
          latestOrderIdRef.current = latestOrder.id;
          lastProcessedOrderIdRef.current = latestOrder.id;
        }
        if (latestReturn) {
          latestReturnIdRef.current = latestReturn.id;
          lastProcessedReturnIdRef.current = latestReturn.id;
        }
        return;
      }

      // Check if new order arrived
      if (
        latestOrder &&
        latestOrder.id !== latestOrderIdRef.current &&
        latestOrder.id !== lastProcessedOrderIdRef.current
      ) {
        console.log('⚡ Polling mendeteksi pesanan baru:', latestOrder.id);
        handleIncomingOrder(latestOrder);
      }

      // Check if new return arrived
      if (
        latestReturn &&
        latestReturn.id !== latestReturnIdRef.current &&
        latestReturn.id !== lastProcessedReturnIdRef.current
      ) {
        console.log('⚡ Polling mendeteksi retur baru:', latestReturn.id);
        handleIncomingReturn(latestReturn);
      }
    } catch (err) {
      console.warn('Gagal cek pembaruan pesanan/retur:', err);
    }
  }, [handleIncomingOrder, handleIncomingReturn]);

  useEffect(() => {
    // Only subscribe for Kopkar and Admin users
    if (!user || (user.role !== 'kopkar' && user.role !== 'admin')) {
      return;
    }

    // Reset initial mount flag
    isInitialFetchRef.current = true;
    checkForNewItems();

    // 1. WebSocket Broadcast Channel
    const broadcastChannel = supabase
      .channel('order_realtime_broadcast')
      .on('broadcast', { event: 'new_order' }, ({ payload }) => {
        console.log('⚡ Broadcast pesanan diterima:', payload);
        handleIncomingOrder(payload);
      })
      .on('broadcast', { event: 'new_return' }, ({ payload }) => {
        console.log('⚡ Broadcast retur diterima:', payload);
        handleIncomingReturn(payload);
      })
      .subscribe();

    // 2. Postgres Changes Listeners
    const postgresOrderChannel = supabase
      .channel('order_postgres_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('⚡ Postgres changes orders diterima:', payload);
          handleIncomingOrder(payload.new as any);
        }
      )
      .subscribe();

    const postgresReturnChannel = supabase
      .channel('return_postgres_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'returns' },
        (payload) => {
          console.log('⚡ Postgres changes returns diterima:', payload);
          handleIncomingReturn(payload.new as any);
        }
      )
      .subscribe();

    // 3. Fallback Polling every 4 seconds
    const pollInterval = setInterval(() => {
      checkForNewItems();
    }, 4000);

    // 4. Instant check on tab focus or visibility change
    const handleFocus = () => {
      checkForNewItems();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(postgresOrderChannel);
      supabase.removeChannel(postgresReturnChannel);
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user, handleIncomingOrder, handleIncomingReturn, checkForNewItems]);

  // Auto-dismiss toasts after 8 seconds
  useEffect(() => {
    if (toasts.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.timestamp < 8000));
    }, 1000);

    return () => clearInterval(timer);
  }, [toasts]);

  const handleDismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleView = (toast: OrderToast) => {
    handleDismiss(toast.id);
    if (toast.type === 'return') {
      navigate('/kopkar/retur');
    } else {
      navigate('/kopkar/pesanan');
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="order-realtime-toasts" role="region" aria-label="Notifikasi Realtime">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`order-realtime-toast ${t.type === 'return' ? 'toast-return' : ''}`}
        >
          <div className="order-toast-icon-wrap" aria-hidden="true">
            {t.type === 'return' ? '↩️' : '🛒'}
          </div>
          <div className="order-toast-content">
            <h4 className="order-toast-title">
              {t.type === 'return' ? 'Pengajuan Retur Masuk!' : 'Pesanan Baru Masuk!'}
              <span className="order-toast-badge">
                {t.type === 'return' ? 'Retur' : 'Baru'}
              </span>
            </h4>
            <p className="order-toast-desc">
              Dari: <strong>{t.schoolName}</strong>
              <br />
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>No: {t.targetId}</span>
            </p>
            <div className="order-toast-actions">
              <button
                className="order-toast-btn-view"
                onClick={() => handleView(t)}
              >
                {t.type === 'return' ? 'Lihat Retur' : 'Lihat Pesanan'}
              </button>
            </div>
          </div>
          <button
            className="order-toast-btn-dismiss"
            onClick={() => handleDismiss(t.id)}
            aria-label="Tutup notifikasi"
            title="Tutup"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default OrderRealtimeNotification;
