import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './NotificationPopup.css';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  target_type: 'all' | 'level' | 'school';
  target_value: string | null;
  created_by: string;
  created_at: string;
}

const NotificationPopup = () => {
  const { user, isAuthenticated } = useAuth();
  const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const checkNotifications = useCallback(async () => {
    if (!user) return;

    // Ambil daftar pengumuman yang ditandai "Jangan tampilkan lagi" selama sesi login ini
    let suppressedList: string[] = [];
    try {
      const raw = sessionStorage.getItem('suppressed_notifications');
      if (raw) suppressedList = JSON.parse(raw);
    } catch {}

    // Ambil daftar pengumuman terbaru
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data && data.length > 0) {
      // Ambil level sekolah pengguna (dengan fallback langsung ke app_users/school_whitelist jika di state masih undefined/kosong)
      let currentSchoolLevel = user.schoolLevel?.trim();
      if (!currentSchoolLevel && (user.role === 'sekolah' || user.role === 'guru_ots')) {
        try {
          const { data: dbUser } = await supabase
            .from('app_users')
            .select('school_level')
            .eq('id', user.id)
            .maybeSingle();

          if (dbUser?.school_level) {
            currentSchoolLevel = dbUser.school_level.trim();
          } else {
            const { data: wlData } = await supabase
              .from('school_whitelist')
              .select('*')
              .eq('email', user.username)
              .maybeSingle();
            const raw = wlData?.Jenjang || wlData?.jenjang;
            if (raw) currentSchoolLevel = typeof raw === 'string' ? raw.trim() : raw;
          }
        } catch (e) {
          console.warn('Gagal mengambil level sekolah:', e);
        }
      }

      // Cari pengumuman pertama yang cocok untuk user dan belum diceklis "Jangan tampilkan lagi" di sesi ini
      const unsuppressed = data.find((n: AppNotification) => {
        if (suppressedList.includes(n.id)) return false;

        // Cocokkan target pengumuman
        if (n.target_type === 'all') return true;

        if (n.target_type === 'level') {
          const userLevelUpper = currentSchoolLevel?.toUpperCase();
          const targetLevelUpper = n.target_value?.trim().toUpperCase();
          if (userLevelUpper && targetLevelUpper && userLevelUpper === targetLevelUpper) {
            return true;
          }
        }

        if (n.target_type === 'school') {
          const target = n.target_value?.trim().toLowerCase();
          if (
            target &&
            (target === user.id?.toLowerCase() ||
             target === user.username?.toLowerCase() ||
             target === user.name?.trim().toLowerCase() ||
             target === user.schoolName?.trim().toLowerCase())
          ) {
            return true;
          }
        }

        return false;
      });

      if (unsuppressed) {
        setActiveNotification(unsuppressed);
        setDontShowAgain(false); // Reset checkbox untuk pengumuman yang tampil
      } else {
        setActiveNotification(null);
      }
    }
  }, [user]);

  // Cek pengumuman saat pertama kali login / komponen mount & dengarkan siaran baru secara realtime
  useEffect(() => {
    if (isAuthenticated && (user?.role === 'sekolah' || user?.role === 'guru_ots')) {
      checkNotifications();

      const channel = supabase
        .channel('app_notifications_changes')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications' },
          () => {
            checkNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setActiveNotification(null);
    }
  }, [isAuthenticated, user, checkNotifications]);

  // Deteksi ketika window di-minimize lalu di-maximize lagi, atau berpindah window/tab
  useEffect(() => {
    if (!isAuthenticated || (user?.role !== 'sekolah' && user?.role !== 'guru_ots')) {
      return;
    }

    const handleVisibilityChange = () => {
      // Saat window kembali aktif / un-minimized (document.hidden === false)
      if (!document.hidden) {
        checkNotifications();
      }
    };

    const handleWindowFocus = () => {
      checkNotifications();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isAuthenticated, user, checkNotifications]);

  const handleClose = () => {
    if (!activeNotification) return;

    if (dontShowAgain) {
      // Jika dicentang: simpan ID ke sessionStorage agar tidak muncul lagi selama sesi login ini
      try {
        const raw = sessionStorage.getItem('suppressed_notifications');
        const list: string[] = raw ? JSON.parse(raw) : [];
        if (!list.includes(activeNotification.id)) {
          list.push(activeNotification.id);
          sessionStorage.setItem('suppressed_notifications', JSON.stringify(list));
        }
      } catch (err) {
        console.warn('Gagal menyimpan suppressed notification:', err);
      }
    }

    // Tutup popup
    setActiveNotification(null);
    setDontShowAgain(false);

    // Jika tadi dicentang, cek apakah masih ada pengumuman lain yang belum diceklis
    if (dontShowAgain) {
      checkNotifications();
    }
  };

  if (!activeNotification) return null;

  return (
    <div className="notif-popup-overlay">
      <div className="notif-popup-card">
        <div className="notif-popup-header">
          <h3>📢 PENGUMUMAN</h3>
        </div>
        <div className="notif-popup-body">
          <h4 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', color: '#1e293b' }}>
            {activeNotification.title}
          </h4>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#334155', margin: 0 }}>
            {activeNotification.message}
          </p>
          <div style={{ marginTop: '24px', fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
            Dikirim oleh: {activeNotification.created_by} <br />
            {new Date(activeNotification.created_at).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
        <div className="notif-popup-footer">
          <label className="notif-popup-checkbox-label">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="notif-popup-checkbox"
            />
            <span>Jangan tampilkan lagi selama sesi login ini</span>
          </label>
          <button
            className="btn-primary notif-popup-close-btn"
            onClick={handleClose}
          >
            Saya Mengerti & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPopup;
