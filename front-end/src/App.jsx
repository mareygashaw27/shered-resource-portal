import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import LoginPage from './components/LoginPage';
import Header from './components/Header';
import Navigation from './components/Navigation';
import ResetPasswordPage from './components/ResetPasswordPage';

import DashboardOverview from './components/DashboardOverview';
import ResourceCatalog from './components/ResourceCatalog';
import CalendarView from './components/CalendarView';
import MyBookingsView from './components/MyBookingsView';
import ApprovalsDashboard from './components/ApprovalsDashboard';
import AdminManagement from './components/AdminManagement';
import ReportsDashboard from './components/ReportsDashboard';

import BookingModal from './components/BookingModal';
import ConflictModal from './components/ConflictModal';

import './App.css';

// Define which tabs each role can access
const ROLE_TABS = {
  super_admin:      ['dashboard', 'discovery', 'calendar', 'my_bookings', 'approvals', 'admin', 'reports'],
  resource_manager: ['dashboard', 'discovery', 'calendar', 'my_bookings', 'approvals', 'admin', 'reports'],
  department_head:  ['dashboard', 'discovery', 'calendar', 'my_bookings', 'approvals', 'reports'],
  staff:            ['dashboard', 'discovery', 'calendar', 'my_bookings'],
  auditor:          ['dashboard', 'calendar', 'reports'],
};

// First allowed tab for a given role (used as landing page after login)
const defaultTabForRole = (role) => {
  const allowed = ROLE_TABS[role] || ROLE_TABS['staff'];
  return allowed[0] || 'dashboard';
};

function MainAppContent() {
  const { user, loggedInUser, token, loading } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Reset activeTab when role changes or on token change if current active tab is disallowed
  useEffect(() => {
    const currentRole = user?.role || loggedInUser?.role || 'staff';
    const allowed = ROLE_TABS[currentRole] || ROLE_TABS['staff'];
    if (!allowed.includes(activeTab)) {
      setActiveTab(defaultTabForRole(currentRole));
    }
  }, [user?.role, token]);

  const [bookingModalResource, setBookingModalResource] = useState(null);
  const [initialSlot, setInitialSlot] = useState(null);
  const [conflictData, setConflictData] = useState(null);
  const [successBanner, setSuccessBanner] = useState('');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-muted)' }}>
        {t('loadingApp')}
      </div>
    );
  }

  // Show login page if unauthenticated
  if (!token || !user) {
    return <LoginPage />;
  }

  // Tab guard: based on previewed/active role (user.role) so navigation is strictly scoped to that role
  const handleSetActiveTab = (tab) => {
    const currentRole = user?.role || loggedInUser?.role || 'staff';
    const allowed = ROLE_TABS[currentRole] || ROLE_TABS['staff'];
    if (allowed.includes(tab)) {
      setActiveTab(tab);
    }
  };

  const handleBookingSuccess = (data) => {
    setSuccessBanner(`${t('bookingConfirmedRef')} ${data.bookingRef}`);
    setTimeout(() => setSuccessBanner(''), 5000);
  };

  return (
    <div className="app-container">
      <div className="sticky-header-container">
        <Header />
        <Navigation activeTab={activeTab} setActiveTab={handleSetActiveTab} />
      </div>

      <main className="main-content">
        {successBanner && (
          <div style={{ background: 'var(--success-light)', color: 'var(--success)', border: '1px solid var(--success)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 20, fontWeight: 600 }}>
            {successBanner}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardOverview
            onSwitchTab={handleSetActiveTab}
            onOpenBookModal={(r) => setBookingModalResource(r)}
          />
        )}

        {activeTab === 'discovery' && (
          <ResourceCatalog
            onSelectResource={(r) => {
              setInitialSlot(null);
              setBookingModalResource(r);
            }}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            onSelectSlot={(r, slot) => {
              setInitialSlot(slot);
              setBookingModalResource(r);
            }}
          />
        )}

        {activeTab === 'my_bookings' && <MyBookingsView />}

        {activeTab === 'approvals' && <ApprovalsDashboard />}

        {activeTab === 'admin' && <AdminManagement />}

        {activeTab === 'reports' && <ReportsDashboard />}
      </main>

      {/* Booking Form Modal */}
      {bookingModalResource && (
        <BookingModal
          resource={bookingModalResource}
          initialStartTime={initialSlot}
          onClose={() => {
            setBookingModalResource(null);
            setInitialSlot(null);
          }}
          onSuccess={handleBookingSuccess}
          onConflict={(conflict) => setConflictData(conflict)}
        />
      )}

      {/* Conflict Suggestions Modal */}
      {conflictData && (
        <ConflictModal
          conflictData={conflictData}
          onClose={() => setConflictData(null)}
          onSelectAlternative={(altResource, start, end) => {
            setConflictData(null);
            setBookingModalResource(altResource);
            setInitialSlot(start);
          }}
          onJoinedWaitlist={() => {
            setSuccessBanner(t('waitlistJoinedSuccess'));
            setTimeout(() => setSuccessBanner(''), 4000);
          }}
        />
      )}

      <footer style={{
        textAlign: 'center',
        padding: '16px 20px',
        fontSize: '12.5px',
        color: 'var(--text-muted, #64748b)',
        borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
        marginTop: 'auto'
      }}>
        © 2026 Shared Resource Portal • Developed by 3rd Year Team
      </footer>
    </div>
  );
}

export default function App() {
  // Detect reset-password token from URL
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('token');
  const isResetPage = window.location.pathname === '/reset-password' && resetToken;

  if (isResetPage) {
    return (
      <LanguageProvider>
        <ThemeProvider>
          <ResetPasswordPage
            token={resetToken}
            onComplete={() => {
              window.history.replaceState({}, '', '/');
              window.location.reload();
            }}
          />
        </ThemeProvider>
      </LanguageProvider>
    );
  }

  return (
    <AuthProvider>
      <SocketProvider>
        <LanguageProvider>
          <ThemeProvider>
            <MainAppContent />
          </ThemeProvider>
        </LanguageProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
