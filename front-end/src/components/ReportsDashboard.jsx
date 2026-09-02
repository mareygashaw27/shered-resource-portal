import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Download, FileText, BarChart2, PieChart, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function ReportsDashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [utilization, setUtilization] = useState({ perResource: [], perCategory: [] });
  const [deptUsage, setDeptUsage] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const token = sessionStorage.getItem('shered_res_token') || '';
      const headers = {
        'Authorization': token ? `Bearer ${token}` : '',
        'x-simulated-user-id': user?.id || '1',
        'x-simulated-role': user?.role || 'staff',
        'x-simulated-dept': user?.department || 'IT Department'
      };

      const uRes = await fetch(`${API_BASE_URL}/api/reports/utilization`, { headers });
      if (uRes.ok) setUtilization(await uRes.json());

      const dRes = await fetch(`${API_BASE_URL}/api/reports/department-usage`, { headers });
      if (dRes.ok) setDeptUsage(await dRes.json());

      if (['super_admin', 'auditor'].includes(user?.role)) {
        const aRes = await fetch(`${API_BASE_URL}/api/reports/audit-logs`, { headers });
        if (aRes.ok) setAuditLogs(await aRes.json());
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      const token = sessionStorage.getItem('shered_res_token') || '';
      const headers = {
        'Authorization': token ? `Bearer ${token}` : '',
        'x-simulated-user-id': String(user?.id || '1'),
        'x-simulated-role': user?.role || 'super_admin',
        'x-simulated-dept': user?.department || 'Operations'
      };
      const res = await fetch(`${API_BASE_URL}/api/reports/export-csv`, { headers });
      if (!res.ok) {
        alert('Failed to export CSV. Status: ' + res.status);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resource_bookings_report_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV Export Error:', err);
    }
  };

  const canViewAuditLogs = ['super_admin', 'auditor'].includes(user?.role);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{t('reportsTitle')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('reportsDesc')}</p>
        </div>
        {['super_admin', 'resource_manager', 'auditor'].includes(user?.role) && (
          <button className="btn btn-primary" onClick={handleDownloadCSV}>
            <Download size={16} /> {t('exportPdfCsv')}
          </button>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        {/* Resource Utilization */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={16} color="var(--primary)" /> {t('hrsBooked')}
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('resourceName')}</th>
                <th>{t('category')}</th>
                <th>{t('totalBookings')}</th>
                <th>{t('hrsBooked')}</th>
              </tr>
            </thead>
            <tbody>
              {utilization.perResource.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.category}</td>
                  <td>{r.total_bookings}</td>
                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{r.total_hours_booked} hrs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Immutable Audit Logs (Restricted to Super Admin & Auditor) */}
      {canViewAuditLogs && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} color="var(--success)" /> {t('auditLogsTitle')}
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('idHeader')}</th>
                <th>{t('bookedBy')}</th>
                <th>{t('actionsHeader')}</th>
                <th>{t('titleHeader')}</th>
                <th>{t('timeRequested')}</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'monospace' }}>#{log.id}</td>
                  <td>{log.user_name || 'System Auto-Cron'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{log.action}</td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                  </td>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
