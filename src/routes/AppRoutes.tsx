import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MainLayout from '../components/layout/MainLayout';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import LoginPage from '../pages/Auth/LoginPage';
import AdminDashboard from '../pages/Admin/AdminDashboard';
import UserManagement from '../pages/Admin/UserManagement';
import SchoolDashboard from '../pages/School/SchoolDashboard';
import SchoolPayment from '../pages/School/SchoolPayment';
import KopkarDashboard from '../pages/Kopkar/KopkarDashboard';
import KopkarPesanan from '../pages/Kopkar/KopkarPesanan';
import KopkarPelunasan from '../pages/Kopkar/KopkarPelunasan';
import ProductCatalog from '../pages/Kopkar/ProductCatalog';
import StockManagement from '../pages/Kopkar/StockManagement';
import KopkarReturn from '../pages/Kopkar/KopkarReturn';
import KopkarRekap from '../pages/Kopkar/KopkarRekap';
import SchoolReturn from '../pages/School/SchoolReturn';
import type { UserRole } from '../types';

const RootRedirect = () => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const roleHome: Record<UserRole, string> = {
    admin: '/admin',
    kopkar: '/kopkar',
    sekolah: '/school',
  };

  return <Navigate to={roleHome[user.role]} replace />;
};

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
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
        <Route path="kopkar/catalog" element={
          <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
            <ProductCatalog />
          </ProtectedRoute>
        } />
        <Route path="kopkar/stock" element={
          <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
            <StockManagement />
          </ProtectedRoute>
        } />
        <Route path="kopkar/retur" element={
          <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
            <KopkarReturn />
          </ProtectedRoute>
        } />
        <Route path="kopkar/rekap" element={
          <ProtectedRoute allowedRoles={['admin', 'kopkar']}>
            <KopkarRekap />
          </ProtectedRoute>
        } />

        {/* School routes */}
        <Route path="school" element={
          <ProtectedRoute allowedRoles={['admin', 'sekolah']}>
            <SchoolDashboard />
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

        {/* Catch-all for not found pages */}
        <Route path="*" element={
          <div style={{ padding: '20px' }}>
            <h2>404 - Halaman Tidak Ditemukan</h2>
          </div>
        } />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
