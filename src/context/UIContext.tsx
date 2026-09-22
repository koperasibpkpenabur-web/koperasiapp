import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type ViewMode = 'auto' | 'mobile' | 'desktop';

interface UIContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isMobileNavOpen: boolean;
  setIsMobileNavOpen: (open: boolean) => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  closeMobileNav: () => void;
}

const UIContext = createContext<UIContextType | null>(null);

const VIEW_MODE_KEY = 'koperasi_view_mode';
const SIDEBAR_COLLAPSED_KEY = 'koperasi_sidebar_collapsed';

export function UIProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      if (saved === 'mobile' || saved === 'desktop' || saved === 'auto') {
        return saved;
      }
    } catch {
      // fallback
    }
    return 'auto';
  });

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const toggleSidebar = () => {
    // If on small screen or mobile mode, toggle drawer
    if (window.innerWidth <= 860 || viewMode === 'mobile') {
      setIsMobileNavOpen((prev) => !prev);
    } else {
      // Desktop collapse toggle
      setIsSidebarCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  };

  const closeMobileNav = () => setIsMobileNavOpen(false);

  // Apply root class to body/container based on viewMode
  useEffect(() => {
    document.documentElement.classList.remove('force-mobile', 'force-desktop', 'mode-auto');
    if (viewMode === 'mobile') {
      document.documentElement.classList.add('force-mobile');
    } else if (viewMode === 'desktop') {
      document.documentElement.classList.add('force-desktop');
    } else {
      document.documentElement.classList.add('mode-auto');
    }
  }, [viewMode]);

  return (
    <UIContext.Provider
      value={{
        viewMode,
        setViewMode,
        isMobileNavOpen,
        setIsMobileNavOpen,
        isSidebarCollapsed,
        toggleSidebar,
        closeMobileNav,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI(): UIContextType {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return ctx;
}
