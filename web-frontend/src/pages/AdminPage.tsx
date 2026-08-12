import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminNavTabs, type AdminSubTab } from '../components/admin/AdminNavTabs';
import { TableManagement } from '../components/admin/TableManagement';
import { StaffManagement } from '../components/admin/StaffManagement';
import { RevenueAnalyticsChart } from '../components/admin/RevenueAnalyticsChart';
import { RateManagement } from '../components/admin/RateManagement';
import { CustomerSessionsManager } from '../components/admin/CustomerSessionsManager';

interface AdminPageProps {
 activeTab: string;
 setActiveTab: (tab: string) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ activeTab: routePath, setActiveTab: setRoutePath }) => {
 const { user } = useAuth();
 
 // Extract subtab from path (e.g. 'admin/staff' -> 'staff')
 const activeTab = (routePath.split('/')[1] as AdminSubTab) || 'tables';
 
 const setActiveTab = (tab: AdminSubTab) => {
 setRoutePath(`admin/${tab}`);
 };

 // Role Security Check matching BarContext.tsx
 const userRole = user?.role ? user.role.toLowerCase() : '';
 const isAuthorized = userRole === 'admin' || userRole === 'manager';

 if (!isAuthorized) {
 return (
 <div className="glass-panel p-8 rounded-3xl border border-red-500/30 text-center space-y-4 max-w-md mx-auto my-12">
 <div className="w-16 h-16 rounded-full dark:bg-red-500/20 bg-red-500/10 dark:text-red-400 text-red-700 border border-red-500/40 flex items-center justify-center mx-auto text-2xl">
 <ShieldAlert size={36} />
 </div>
 <h3 className="text-xl font-bold dark:text-red-400 text-red-700">Access Restricted</h3>
 <p className="text-xs text-text-muted">
 The System Administration & Staff Portal is restricted strictly to Administrator and Manager shift accounts.
 </p>
 </div>
 );
 }

 const renderTabContent = () => {
 switch (activeTab) {
 case 'tables':
 return <TableManagement />;
 case 'staff':
 return <StaffManagement />;
 case 'chart':
 return <RevenueAnalyticsChart />;
 case 'rates':
 return <RateManagement />;
 case 'customers':
 return <CustomerSessionsManager />;
 default:
 return <TableManagement />;
 }
 };

 return (
 <div className="space-y-4 sm:space-y-6">
 {/* Sub-Tab Navigation Bar */}
 <AdminNavTabs activeTab={activeTab} setActiveTab={setActiveTab} />

 {/* Sub-Tab Active Module */}
 <div>{renderTabContent()}</div>
 </div>
 );
};
