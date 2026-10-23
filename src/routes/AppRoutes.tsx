import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MainLayout from '../components/layout/MainLayout';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import type { UserRole } from '../types';

// Helper untuk menangani cache chunk lama saat ada update deployment baru (mencegah layar putih)
function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      console.warn('Chunk loading failed, reloading app for latest build...', error);
      const isRefreshed = sessionStorage.getItem('chunk_reload');
      if (!isRefreshed) {
        sessionStorage.setItem('chunk_reload', 'true');
        window.location.reload();
        return { default: (() => null) as unknown as T };
      }
      sessionStorage.removeItem('chunk_reload');
      throw error;
    }
  });
}

// Lazy loading modul halaman (Code Splitting dengan auto-retry)
const LoginPage = lazyWithRetry(() => import('../pages/Auth/LoginPage'));
const AdminDashboard = lazyWithRetry(() => import('../pages/Admin/AdminDashboard'));
const UserManagement = lazyWithRetry(() => import('../pages/Admin/UserManagement'));
const SchoolDashboard = lazyWithRetry(() => import('../pages/School/SchoolDashboard'));
const SchoolPemesanan = lazyWithRetry(() => import('../pages/School/SchoolPemesanan'));
const SchoolPayment = lazyWithRetry(() => import('../pages/School/SchoolPayment'));
const KopkarDashboard = lazyWithRetry(() => import('../pages/Kopkar/KopkarDashboard'));
const KopkarPesanan = lazyWithRetry(() => import('../pages/Kopkar/KopkarPesanan'));
const KopkarPelunasan = lazyWithRetry(() => import('../pages/Kopkar/KopkarPelunasan'));
const ItemManagement = lazyWithRetry(() => import('../pages/Kopkar/ItemManagement'));
const VendorManagement = lazyWithRetry(() => import('../pages/Kopkar/VendorManagement'));
const KopkarReturn = lazyWithRetry(() => import('../pages/Kopkar/KopkarReturn'));
const KopkarRekap = lazyWithRetry(() => import('../pages/Kopkar/KopkarRekap'));
const KopkarNotifikasi = lazyWithRetry(() => import('../pages/Kopkar/KopkarNotifikasi'));
const SchoolReturn = lazyWithRetry(() => import('../pages/School/SchoolReturn'));
const SchoolRekap = lazyWithRetry(() => import('../pages/School/SchoolRekap'));
const PengurusDashboard = lazyWithRetry(() => import('../pages/Pengurus/PengurusDashboard'));
const GuruOtsPemesanan = lazyWithRetry(() => import('../pages/GuruOts/GuruOtsPemesanan'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: '#64748b', fontSize: '0.95rem', gap: '8px' }}>
    <span>⏳</span> Memuat halaman...
  </div>
);

const RootRedirect = () => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const roleHome: Record<UserRole, string> = {
    admin: '/admin',
    kopkar: '/kopkar',
    sekolah: '/school',
    pengurus: '/pengurus',
    guru_ots: '/school',
  };

  return <Navigate to={roleHome[user.role]} replace />;
};

const AppRoutes = () => {
  const { isAuthenticated, user } = useAuth();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public route */}
        <Route
          path="/login"
          element={isAuthenticated ? <RootRedirect /> : <LoginPage />}
        />

        {/* Protected routes inside MainLayout */}
        <Route path="/" element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          {/* Root redirect based on role */}
          <Route index element={<RootRedirect />} />

          {/* Admin routes */}
          <Route path="admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="admin/users" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <UserManagement />
            </ProtectedRoute>
          } />

          {/* Kopkar routes */}
          <Route path="kopkar" element={
            <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
              <KopkarDashboard />
            </ProtectedRoute>
          } />
          <Route path="kopkar/pesanan" element={
            <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
              <KopkarPesanan />
            </ProtectedRoute>
          } />
          <Route path="kopkar/pelunasan" element={
            <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
              <KopkarPelunasan />
            </ProtectedRoute>
          } />
          <Route path="kopkar/barang" element={
            <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
              <ItemManagement />
            </ProtectedRoute>
          } />
          <Route path="kopkar/retur" element={
            <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
              <KopkarReturn />
            </ProtectedRoute>
          } />
          <Route path="kopkar/vendor" element={
            <ProtectedRoute allowedRoles={['admin', 'kopkar', 'pengurus']}>
              <VendorManagement />
            </ProtectedRoute>
          } />
          <Route path="kopkar/notifikasi" element={
            <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
              <KopkarNotifikasi />
            </ProtectedRoute>
          } />
          <Route path="kopkar/rekap" element={
            <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
              <KopkarRekap />
            </ProtectedRoute>
          } />

          {/* Pengurus routes */}
          <Route path="pengurus" element={
            <ProtectedRoute allowedRoles={['admin', 'pengurus']}>
              <PengurusDashboard />
            </ProtectedRoute>
          } />
          <Route path="pengurus/vendor" element={
            <ProtectedRoute allowedRoles={['admin', 'pengurus']}>
              <VendorManagement />
            </ProtectedRoute>
          } />

          {/* School routes */}
          <Route path="school" element={
            <ProtectedRoute allowedRoles={['admin', 'sekolah', 'guru_ots']}>
              <SchoolDashboard />
            </ProtectedRoute>
          } />
          <Route path="school/pemesanan" element={
            <ProtectedRoute allowedRoles={['admin', 'sekolah', 'guru_ots']}>
              {user?.role === 'guru_ots' ? <GuruOtsPemesanan /> : <SchoolPemesanan />}
            </ProtectedRoute>
          } />
          <Route path="school/pelunasan" element={
            <ProtectedRoute allowedRoles={['admin', 'sekolah']}>
              <SchoolPayment />
            </ProtectedRoute>
          } />
          <Route path="school/retur" element={
            <ProtectedRoute allowedRoles={['admin', 'sekolah']}>
              <SchoolReturn />
            </ProtectedRoute>
          } />

          <Route path="school/rekap" element={
            <ProtectedRoute allowedRoles={['admin', 'sekolah', 'guru_ots']}>
              <SchoolRekap />
            </ProtectedRoute>
          } />

          {/* Catch-all for not found pages */}
          <Route path="*" element={
            <div style={{ padding: '20px' }}>
              <h2>404 - Halaman Tidak Ditemukan</h2>
            </div>
          } />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
