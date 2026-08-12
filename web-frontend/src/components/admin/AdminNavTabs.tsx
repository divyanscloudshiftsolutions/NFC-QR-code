import React from 'react';
import { 
 Grid3X3, 
 Users, 
 BarChart3, 
 DollarSign, 
 Clock 
} from 'lucide-react';

export type AdminSubTab = 
 | 'tables' 
 | 'staff' 
 | 'chart' 
 | 'rates' 
 | 'customers';

interface AdminNavTabsProps {
 activeTab: AdminSubTab;
 setActiveTab: (tab: AdminSubTab) => void;
}

export const AdminNavTabs: React.FC<AdminNavTabsProps> = ({ activeTab, setActiveTab }) => {
 const tabs: { id: AdminSubTab; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
 { id: 'tables', label: 'Tables Floor Plan', icon: Grid3X3 },
 { id: 'staff', label: 'Staff Directory', icon: Users },
 { id: 'chart', label: 'Revenue Analytics', icon: BarChart3 },
 { id: 'rates', label: 'Rate Cards', icon: DollarSign },
 { id: 'customers', label: 'Customer Sessions', icon: Clock },
 ];

 return (
 <div className="glass-panel p-1.5 sm:p-2 rounded-2xl flex flex-nowrap overflow-x-auto no-scrollbar gap-1.5 sm:gap-2">
 {tabs.map(t => {
 const Icon = t.icon;
 const isSel = activeTab === t.id;
 return (
 <button
 key={t.id}
 onClick={() => setActiveTab(t.id)}
 className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-xs transition-all premium-tab-secondary shrink-0 whitespace-nowrap active:scale-95 ${
 isSel ? 'active' : ''
 }`}
 >
 <div className="nav-icon-badge">
 <Icon size={12} />
 </div>
 <span>{t.label}</span>
 </button>
 );
 })}
 </div>
 );
};
