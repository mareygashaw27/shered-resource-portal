import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { Layers, Calendar, Activity, AlertTriangle, Clock, ArrowUpRight, Plus, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function DashboardOverview({ onOpenBookModal, onSwitchTab }) {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const { socket } = useSocket();

  const [kpis, setKpis] = useState({
    totalResources: 0,
    totalBookingsToday: 0,
    utilizationRate: '0.0%',
    noShowRate: '0.0%',
    pendingApprovals: 0
  });

  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);

  // Label describing data scope for current role
  const scopeLabel = {
    super_admin: lang === 'am' ? 'የስርዓቱ አጠቃላይ አፈፃፀም' : 'System-Wide Metrics',
    resource_manager: lang === 'am' ? 'የስርዓቱ አጠቃላይ አፈፃፀም' : 'System-Wide Metrics',
    auditor: lang === 'am' ? 'ኦዲት እና ትንተና' : 'Audit & Analytics View',
    department_head: lang === 'am' ? `ክፍል፡ ${user?.department || 'Department'}` : `Dept: ${user?.department || 'Department'}`,
    staff: lang === 'am' ? 'የእኔ ቀጠሮዎች' : 'My Personal Bookings'
  }[user?.role] || '';

  const formatUserRole = (u) => {
    if (!u) return '';
    if (u.role === 'department_head') {
      return lang === 'am' ? `የክፍል ኃላፊ (${u.department || ''})` : `Dept Head (${u.department || ''})`;
    }
    return t(u.role) || u.role;
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [user]);

  // Real-time socket sync for Dashboard KPIs
  useEffect(() => {
    if (!socket) return;
    const handleRefresh = () => fetchDashboardData();
    socket.on('booking_created', handleRefresh);
    socket.on('booking_updated', handleRefresh);
    socket.on('approval_updated', handleRefresh);
    socket.on('resource_updated', handleRefresh);
    socket.on('resource_deleted', handleRefresh);
    return () => {
      socket.off('booking_created', handleRefresh);
      socket.off('booking_updated', handleRefresh);
      socket.off('approval_updated', handleRefresh);
      socket.off('resource_updated', handleRefresh);
      socket.off('resource_deleted', handleRefresh);
    };
  }, [socket]);

  const fetchDashboardData = async () => {
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const headers = {
        'Authorization': token ? `Bearer ${token}` : '',
        'x-simulated-user-id': user?.id || '4',
        'x-simulated-role': user?.role || 'staff',
        'x-simulated-dept': user?.department || 'IT Department'
      };

      const kpiRes = await fetch(`${API_BASE_URL}/api/reports/kpis`, { headers });
      if (kpiRes.ok) {
        const data = await kpiRes.json();
        setKpis(data);
      }

      const bkRes = await fetch(`${API_BASE_URL}/api/bookings`, { headers });
      if (bkRes.ok) {
        const bkData = await bkRes.json();
        setUpcoming(bkData.slice(0, 6));
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Consistent 5-KPI Cards Grid for All Roles */}
      <div className="kpi-grid">
        {/* KPI 1: Active Resources */}
        <div className="kpi-card">
          <div>
            <div className="kpi-val">{kpis.totalResources}</div>
            <div className="kpi-label">{t('activeResources')}</div>
          </div>
          <div className="kpi-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            <Layers size={22} />
          </div>
        </div>

        {/* KPI 2: Bookings Today */}
        <div className="kpi-card">
          <div>
            <div className="kpi-val">{kpis.totalBookingsToday}</div>
            <div className="kpi-label">{t('bookingsToday')}</div>
          </div>
          <div className="kpi-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            <Calendar size={22} />
          </div>
        </div>

        {/* KPI 3: Capacity Utilization */}
        <div className="kpi-card">
          <div>
            <div className="kpi-val">{kpis.utilizationRate}</div>
            <div className="kpi-label">{t('capacityUtilization')}</div>
          </div>
          <div className="kpi-icon" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
            <Activity size={22} />
          </div>
        </div>

        {/* KPI 4: No-Show Rate */}
        <div className="kpi-card">
          <div>
            <div className="kpi-val">{kpis.noShowRate}</div>
            <div className="kpi-label">{t('noShowRate')}</div>
          </div>
          <div className="kpi-icon" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
            <AlertTriangle size={22} />
          </div>
        </div>

        {/* KPI 5: Pending Approvals */}
        <div className="kpi-card">
          <div>
            <div className="kpi-val">{kpis.pendingApprovals}</div>
            <div className="kpi-label">{t('pendingApprovals')}</div>
          </div>
          <div className="kpi-icon" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
            <Clock size={22} />
          </div>
        </div>
      </div>

      {/* Upcoming Schedule Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              {t('activeUpcomingReservations')}
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {lang === 'am' ? 'የቅርብ ጊዜ ቀጠሮዎች ዝርዝር' : 'Real-time booking transactions'}
            </div>
          </div>

          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px', fontWeight: 600 }} onClick={() => onSwitchTab(user?.role === 'staff' ? 'my_bookings' : 'calendar')}>
            <span>{user?.role === 'staff' ? t('nav_my_bookings') : t('viewCalendar')}</span>
            <ArrowUpRight size={14} />
          </button>
        </div>

        {upcoming.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>
            {t('noUpcomingBookings')}
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('bookingRef')}</th>
                  <th>{t('resourceName')}</th>
                  <th>{t('category')}</th>
                  <th>{t('bookedBy')}</th>
                  <th>{t('timeWindow')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((bk) => (
                  <tr key={bk.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{bk.booking_ref}</td>
                    <td style={{ fontWeight: 600 }}>{bk.resource_name}</td>
                    <td>
                      <span className="feature-tag" style={{ margin: 0 }}>
                        {bk.resource_category || 'Resource'}
                      </span>
                    </td>
                    <td>{bk.user_name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(bk.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(bk.end_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <span className={`badge badge-${bk.status === 'confirmed' ? 'available' : (bk.status === 'pending' ? 'pending' : 'booked')}`}>
                        {bk.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

