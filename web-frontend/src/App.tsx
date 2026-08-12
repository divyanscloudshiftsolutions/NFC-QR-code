import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CheckInPage } from './pages/CheckInPage';
import { QuickAttendanceWebPage } from './pages/QuickAttendanceWebPage';
import { BartenderPage } from './pages/BartenderPage';
import { TablesPage } from './pages/TablesPage';
import { AdminPage } from './pages/AdminPage';

const AppContent: React.FC = () => {
  const { user, toasts, dismissToast } = useAuth();
  const [activeTab, setActiveTabState] = useState<string>(() => {
    return localStorage.getItem('bar_web_active_tab') || 'dashboard';
  });
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    localStorage.setItem('bar_web_active_tab', tab);
  };
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      } else {
        setSidebarCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!user) {
    return <LoginPage />;
  }

  const renderTabContent = () => {
    if (activeTab === 'dashboard') {
      return (
        <DashboardPage 
          onNavigate={(tabId, adminSubtab) => {
            if (tabId === 'admin' && adminSubtab) {
              setActiveTab(`admin/${adminSubtab}`);
            } else if (tabId === 'tables') {
              setActiveTab('tables/layout');
            } else {
              setActiveTab(tabId);
            }
          }} 
        />
      );
    }
    if (activeTab === 'checkin') {
      return <CheckInPage />;
    }
    if (activeTab === 'quick_attendance') {
      return <QuickAttendanceWebPage />;
    }
    if (activeTab.startsWith('bartender')) {
      return <BartenderPage activeTab={activeTab} setActiveTab={setActiveTab} />;
    }
    if (activeTab.startsWith('tables')) {
      return (
        <TablesPage 
          onNavigateToCheckIn={() => setActiveTab('checkin')} 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      );
    }
    if (activeTab.startsWith('admin')) {
      return <AdminPage activeTab={activeTab} setActiveTab={setActiveTab} />;
    }
    return (
      <DashboardPage 
        onNavigate={(tabId, adminSubtab) => {
          if (tabId === 'admin' && adminSubtab) {
            setActiveTab(`admin/${adminSubtab}`);
          } else if (tabId === 'tables') {
            setActiveTab('tables/layout');
          } else {
            setActiveTab(tabId);
          }
        }} 
      />
    );
  };

  const getTabTitle = () => {
    if (activeTab === 'dashboard') return 'Executive Management Dashboard';
    if (activeTab === 'checkin') return 'Reception Check-In & Customer Registration';
    if (activeTab === 'quick_attendance') return 'FaceMark Quick Facial Attendance Kiosk';
    if (activeTab.startsWith('bartender')) return 'Bartender Drink Service Station';
    if (activeTab.startsWith('tables')) return 'Live Seating Floor Plan & Tables';
    if (activeTab.startsWith('admin')) return 'System Administration & Staff Portal';
    return 'Bar Management System';
  };

  return (
    <div className="flex h-[100dvh] dark:bg-gradient-to-br dark:from-[#141225] dark:via-[#1A1333] dark:to-[#080612] bg-gradient-to-br from-[#F5F3FA] via-[#FAF9FF] to-[#EDE9FE] text-text-primary font-sans overflow-hidden relative">
      {/* Multi-Layer Atmospheric Ambient Background Composition */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Orb 1: Warm Amber Top-Left/behind Sidebar */}
        <div className="absolute -top-[15%] -left-[10%] w-[45%] h-[55%] dark:bg-[radial-gradient(circle,rgba(241,147,7,0.06)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(241,147,7,0.04)_0%,transparent_70%)] rounded-full blur-[130px] animate-ambient-slow-1" />

        {/* Orb 2: Primary Brand Purple Header Glow */}
        <div className="absolute -top-[20%] right-[15%] w-[50%] h-[60%] dark:bg-[radial-gradient(circle,rgba(141,108,229,0.16)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(141,108,229,0.12)_0%,transparent_70%)] rounded-full blur-[140px] animate-ambient-slow-2" />

        {/* Orb 3: Deep Indigo Center-Right Depth */}
        <div className="absolute top-[25%] right-[5%] w-[40%] h-[50%] dark:bg-[radial-gradient(circle,rgba(99,102,241,0.10)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(99,102,241,0.06)_0%,transparent_70%)] rounded-full blur-[150px] animate-ambient-slow-1" />

        {/* Orb 4: Deep Indigo Bottom-Right Accent */}
        <div className="absolute -bottom-[15%] right-[10%] w-[40%] h-[50%] dark:bg-[radial-gradient(circle,rgba(99,102,241,0.08)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(99,102,241,0.06)_0%,transparent_70%)] rounded-full blur-[140px] animate-ambient-slow-2" />

        {/* Orb 5: Emerald Bottom-Left Accent */}
        <div className="absolute -bottom-[10%] left-[10%] w-[35%] h-[45%] dark:bg-[radial-gradient(circle,rgba(16,185,129,0.08)_0%,transparent_70%)] bg-[radial-gradient(circle,rgba(16,185,129,0.06)_0%,transparent_70%)] rounded-full blur-[130px] animate-ambient-slow-1" />

        {/* Ambient Vignette Overlay for edge depth */}
        <div className="absolute inset-0 ambient-vignette-overlay" />
      </div>

      {/* Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      <div className="flex-1 flex flex-col min-w-0 h-[100dvh] bg-bg-workspace border border-border-sidebar border-y-0 border-r-0 border-l-[1px] rounded-none overflow-hidden transition-all duration-300 z-10">
        <Header title={getTabTitle()} onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)} isSidebarCollapsed={sidebarCollapsed} />
        
        <main className="p-4 md:p-6 flex-1 overflow-y-auto no-scrollbar">
          {renderTabContent()}
        </main>
      </div>

      {/* Global Toast Alert Notifications Container */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl shadow-lg flex items-center justify-between border backdrop-blur-md transition-all ${
              toast.type === 'success'
                ? 'bg-status-success-bg border-status-success-border text-status-success'
                : toast.type === 'danger'
                ? 'bg-status-danger-bg border-status-danger-border text-status-danger'
                : 'bg-status-info-bg border-status-info-border text-status-info'
            }`}
          >
            <span className="text-xs font-semibold">{toast.message}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="ml-4 text-xs opacity-70 hover:opacity-100 font-bold"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </AuthProvider>
  );
}
