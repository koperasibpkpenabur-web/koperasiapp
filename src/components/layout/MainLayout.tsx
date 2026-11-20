import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useUI } from '../../context/UIContext';
import { supabase } from '../../lib/supabase';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import NotificationPopup from '../NotificationPopup';
import OrderRealtimeNotification from '../common/OrderRealtimeNotification';
import CartModalGlobal from '../common/CartModalGlobal';
import './layout.css';

const MainLayout = () => {
  const { isMobileNavOpen, closeMobileNav, viewMode } = useUI();
  const [authRecoveryKey, setAuthRecoveryKey] = useState(0);
  const hadValidSessionRef = useRef<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      hadValidSessionRef.current = Boolean(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session && hadValidSessionRef.current === false && event === 'SIGNED_IN') {
        hadValidSessionRef.current = true;
        setAuthRecoveryKey((k) => k + 1);
      } else if (session) {
        hadValidSessionRef.current = true;
      } else if (event === 'SIGNED_OUT') {
        hadValidSessionRef.current = false;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className={`layout-container mode-${viewMode}`}>
      {/* Mobile backdrop */}
      {isMobileNavOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeMobileNav}
          aria-hidden="true"
        />
      )}

      <Sidebar />

      <div className="layout-main">
        <Topbar />
        <main className="layout-content">
          <Outlet key={authRecoveryKey} />
        </main>
      </div>
      
      <NotificationPopup />
      <OrderRealtimeNotification />
      <CartModalGlobal />
    </div>
  );
};

export default MainLayout;
