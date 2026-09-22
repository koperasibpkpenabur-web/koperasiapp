import { Outlet } from 'react-router-dom';
import { useUI } from '../../context/UIContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import './layout.css';

const MainLayout = () => {
  const { isMobileNavOpen, closeMobileNav, viewMode } = useUI();

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
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
