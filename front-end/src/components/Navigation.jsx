import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LayoutDashboard, Compass, Calendar as CalendarIcon, BookmarkCheck, CheckSquare, Settings, BarChart2 } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab }) {
  const { user, loggedInUser } = useAuth();
  const { t } = useLanguage();

  const tabs = [
    { id: 'dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard, roles: ['super_admin', 'resource_manager', 'department_head', 'staff', 'auditor'] },
    { id: 'discovery', labelKey: 'nav_discovery', icon: Compass, roles: ['super_admin', 'resource_manager', 'department_head', 'staff'] },
    { id: 'calendar', labelKey: 'nav_calendar', icon: CalendarIcon, roles: ['super_admin', 'resource_manager', 'department_head', 'staff', 'auditor'] },
    { id: 'my_bookings', labelKey: 'nav_my_bookings', icon: BookmarkCheck, roles: ['super_admin', 'resource_manager', 'department_head', 'staff'] },
    { id: 'approvals', labelKey: 'nav_approvals', icon: CheckSquare, roles: ['super_admin', 'resource_manager', 'department_head'] },
    { id: 'admin', labelKey: 'nav_admin', icon: Settings, roles: ['super_admin', 'resource_manager'] },
    { id: 'reports', labelKey: 'nav_reports', icon: BarChart2, roles: ['super_admin', 'resource_manager', 'department_head', 'auditor'] }
  ];

  // Use active/previewed role (user.role) for tab visibility so clicking another role
  // shows ONLY that role's navigation tabs while the admin top bar stays intact.
  const activeRole = user?.role || loggedInUser?.role || 'staff';
  const visibleTabs = tabs.filter(t => t.roles.includes(activeRole));

  return (
    <nav className="nav-tabs-bar">
      {visibleTabs.map(tab => {
        const IconComponent = tab.icon;
        return (
          <button
            key={tab.id}
            className={`nav-tab-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <IconComponent size={16} />
            <span>{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
