import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { Search, Filter, MapPin, Users, CheckCircle, ShieldAlert, Clock, ArrowRight, Eye, X, Edit, Trash2, Check, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { getResourceImage, getDefaultResourceImage, normalizeImageUrl } from '../utils/imageUtils';
import { API_BASE_URL } from '../config';


export default function ResourceCatalog({ onSelectResource }) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const { socket } = useSocket();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailResource, setDetailResource] = useState(null);
  const [editingResource, setEditingResource] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [minCapacity, setMinCapacity] = useState('');

  const isAdmin = ['super_admin', 'resource_manager', 'department_head'].includes(user?.role);

  useEffect(() => {
    fetchResources();
    const interval = setInterval(fetchResources, 15000);
    return () => clearInterval(interval);
  }, [user, selectedType, minCapacity, searchTerm]);

  useEffect(() => {
    if (!socket) return;
    const handleRefresh = () => fetchResources();
    socket.on('booking_created', handleRefresh);
    socket.on('booking_updated', handleRefresh);
    socket.on('approval_updated', handleRefresh);
    socket.on('resource_updated', handleRefresh);
    socket.on('calendar_updated', handleRefresh);
    return () => {
      socket.off('booking_created', handleRefresh);
      socket.off('booking_updated', handleRefresh);
      socket.off('approval_updated', handleRefresh);
      socket.off('resource_updated', handleRefresh);
      socket.off('calendar_updated', handleRefresh);
    };
  }, [socket]);

  const fetchResources = async () => {
    try {
      let url = `${API_BASE_URL}/api/resources?`;
      if (minCapacity) url += `minCapacity=${minCapacity}&`;
      if (searchTerm) url += `search=${searchTerm}&`;


      const token = sessionStorage.getItem('shered_res_token');
      const headers = {
        'Authorization': token ? `Bearer ${token}` : '',
        'x-simulated-user-id': user?.id || '4',
        'x-simulated-role': user?.role || 'staff',
        'x-simulated-dept': user?.department || 'IT Department'
      };

      const res = await fetch(url, { headers });
      let bkData = [];
      try {
        const bkRes = await fetch(`${API_BASE_URL}/api/bookings`, { headers });
        if (bkRes.ok) bkData = await bkRes.json();
      } catch (e) {
        // ignore
      }

      if (res.ok) {
        const data = await res.json();
        const now = new Date();

        const enriched = data.map(r => {
          // If backend already computed current_status, use it directly
          if (r.current_status) return r;

          // Fallback: compute status from live bookings data
          const rBookings = bkData.filter(b => b.resource_id === r.id);

          // Currently in use RIGHT NOW (confirmed/checked_in booking overlapping now)
          const inUse = rBookings.find(b =>
            (b.status === 'confirmed' || b.status === 'checked_in') &&
            new Date(b.start_datetime) <= now &&
            new Date(b.end_datetime) > now
          );

          const confirmedUpcoming = rBookings.find(b =>
            (b.status === 'confirmed' || b.status === 'checked_in') &&
            new Date(b.end_datetime) > now
          );

          // Pending approval (any pending booking waiting for authorization)
          const pending = rBookings.find(b =>
            b.status === 'pending' &&
            new Date(b.end_datetime) > now
          );

          // Next upcoming booking (for info display)
          const upcoming = rBookings
            .filter(b =>
              ['confirmed', 'checked_in', 'pending'].includes(b.status) &&
              new Date(b.start_datetime) > now
            )
            .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))[0] || null;

          if (inUse) {
            return {
              ...r,
              current_status: 'in_use',
              available_after: inUse.end_datetime,
              active_booking: inUse,
              upcoming_booking: upcoming,
              has_pending_request: !!pending
            };
          } else if (pending) {
            return {
              ...r,
              current_status: 'pending',
              available_after: pending.end_datetime,
              active_booking: pending,
              upcoming_booking: upcoming,
              has_pending_request: true
            };
          } else if (confirmedUpcoming) {
            return {
              ...r,
              current_status: 'in_use',
              available_after: confirmedUpcoming.end_datetime,
              active_booking: confirmedUpcoming,
              upcoming_booking: upcoming,
              has_pending_request: !!pending
            };
          } else {
            return {
              ...r,
              current_status: 'available',
              available_after: null,
              upcoming_booking: upcoming,
              has_pending_request: false
            };
          }
        });

        setResources(enriched);
      }
    } catch (err) {
      console.error('Failed to fetch resources:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeOnly = (dtStr) => {
    if (!dtStr) return '';
    try {
      const dt = new Date(dtStr);
      if (isNaN(dt.getTime())) return dtStr;
      return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return dtStr;
    }
  };

  const types = [
    { key: 'all', labelKey: 'allResources' },
    { key: 'meeting_room', labelKey: 'meetingRooms' },
    { key: 'conference_hall', labelKey: 'conferenceHalls' },
    { key: 'training_lab', labelKey: 'trainingLabs' },
    { key: 'vehicle', labelKey: 'fleetVehicles' },
    { key: 'equipment', labelKey: 'equipment' }
  ];

  const handleDeleteResource = async (id, rName) => {
    if (!window.confirm(`${t('confirmDeleteResource')} ("${rName}")`)) return;
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const res = await fetch(`${API_BASE_URL}/api/resources/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'x-simulated-user-id': user?.id || '1',
          'x-simulated-role': user?.role || 'super_admin'
        }
      });
      if (res.ok) {
        setDetailResource(null);
        fetchResources();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Convert and compress file to lightweight base64 data URL
  const handleImageFile = (file, setter) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 800;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setter(compressedDataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateResource = async (e) => {
    e.preventDefault();
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const res = await fetch(`${API_BASE_URL}/api/resources/${editingResource.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          'x-simulated-user-id': user?.id || '1',
          'x-simulated-role': user?.role || 'super_admin'
        },
        body: JSON.stringify({
          name: editingResource.name,
          type: editingResource.type,
          category: editingResource.category,
          capacity: parseInt(editingResource.capacity),
          location: editingResource.location || '',
          operating_hours_start: editingResource.operating_hours_start || '08:00',
          operating_hours_end: editingResource.operating_hours_end || '18:00',
          department_restriction: editingResource.department_restriction || null,
          requires_approval: editingResource.requires_approval ? 1 : 0,
          requires_checkin: editingResource.requires_checkin ? 1 : 0,
          image_url: normalizeImageUrl(editingResource.image_url) || null
        })
      });

      if (res.ok) {
        setEditingResource(null);
        if (detailResource?.id === editingResource.id) {
          setDetailResource(null);
        }
        fetchResources();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{t('resourceCatalogTitle')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('resourceCatalogDesc')}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-dim)' }} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', paddingLeft: 36 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {types.map(tp => (
            <button
              key={tp.key}
              className={`btn ${selectedType === tp.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => setSelectedType(tp.key)}
            >
              {t(tp.labelKey)}
            </button>
          ))}
        </div>

      </div>

      {/* Filter resources on client for seamless responsiveness */}
      {(() => {
        const filteredResources = resources.filter(r => {
          if (selectedType === 'all') return true;

          const rType = (r.type || '').toLowerCase();
          const rCat = (r.category || '').toLowerCase();
          const rUuid = (r.resource_uuid || '').toUpperCase();

          if (selectedType === 'meeting_room') {
            return rType === 'meeting_room' || rType === 'room' || rCat.includes('meeting') || rCat.includes('room') || rUuid.startsWith('MR-');
          }
          if (selectedType === 'training_lab') {
            return rType === 'training_lab' || rType === 'lab' || rCat.includes('training') || rCat.includes('lab') || rUuid.startsWith('TL-');
          }
          if (selectedType === 'conference_hall') {
            return rType === 'conference_hall' || rType === 'conference' || rCat.includes('conference') || rCat.includes('hall') || rUuid.startsWith('CH-');
          }
          if (selectedType === 'vehicle') {
            return rType === 'vehicle' || rType === 'car' || rCat.includes('vehicle') || rCat.includes('car') || rCat.includes('suv') || rCat.includes('sedan') || rCat.includes('fleet') || rUuid.startsWith('VH-');
          }
          if (selectedType === 'equipment') {
            return rType === 'equipment' || rCat.includes('equipment') || rCat.includes('presentation') || rCat.includes('gear') || rUuid.startsWith('EQ-');
          }
          return rType === selectedType || rCat.includes(selectedType.toLowerCase());
        });


        if (filteredResources.length === 0) {
          return (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              {t('noResourcesFound')}
            </div>
          );
        }

        return (
          <div className="resource-grid">
            {filteredResources.map((r) => (
              <div key={r.id} className="resource-card" style={{ display: 'flex', flexDirection: 'column' }}>

              <div
                className="resource-img-box"
                style={{ cursor: 'pointer', position: 'relative' }}
                onClick={() => setDetailResource(r)}
                title={t('viewDetails')}
              >
                <img
                  src={getResourceImage(r)}
                  alt={r.name}
                  className="resource-img"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.target.src = getDefaultResourceImage(r.type, r.category);
                  }}
                />


                {/* Resource Code Badge in Top-Left of Image */}
                <span
                  style={{
                    position: 'absolute', top: 12, left: 12, fontSize: 11, fontWeight: 700,
                    fontFamily: 'monospace', padding: '4px 10px', borderRadius: '20px',
                    background: 'rgba(15, 23, 42, 0.85)', color: '#f8fafc',
                    border: '1px solid rgba(255, 255, 255, 0.25)', backdropFilter: 'blur(6px)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)', zIndex: 3
                  }}
                >
                  {r.resource_uuid}
                </span>

                {/* Color-Coded Status Badge directly ON THE IMAGE (Top-Right) */}
                {r.current_status === 'available' && (
                  <span
                    style={{
                      position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                      padding: '5px 12px', borderRadius: '20px',
                      background: 'linear-gradient(135deg, #059669, #10b981)', color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ክፍት (Available)' : 'Available'}
                  </span>
                )}

                {r.current_status === 'in_use' && (
                  <span
                    style={{
                      position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                      padding: '5px 12px', borderRadius: '20px',
                      background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ተይዟል (Booked)' : 'Booked'}
                  </span>
                )}

                {r.current_status === 'pending' && (
                  <span
                    style={{
                      position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                      padding: '5px 12px', borderRadius: '20px',
                      background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
                      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ማጽደቅ የሚጠብቅ' : 'Pending Approval'}
                  </span>
                )}

                {r.current_status === 'maintenance' && (
                  <span
                    style={{
                      position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                      padding: '5px 12px', borderRadius: '20px',
                      background: 'linear-gradient(135deg, #475569, #64748b)', color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(100, 116, 139, 0.4)',
                      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ጥገና ላይ' : 'Maintenance'}
                  </span>
                )}
              </div>

              <div className="resource-card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Title Line */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div
                    className="resource-title"
                    style={{ cursor: 'pointer', fontSize: 16, fontWeight: 700, margin: 0, flex: 1 }}
                    onClick={() => setDetailResource(r)}
                    title={t('viewDetails')}
                  >
                    {r.name}
                  </div>
                </div>

                {/* Dynamic Status Time Subtitle */}
                {r.current_status === 'in_use' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: '#fca5a5', fontSize: 12, fontWeight: 600,
                    marginBottom: 10, background: 'rgba(239, 68, 68, 0.12)',
                    padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}>
                    <Clock size={13} style={{ color: '#ef4444' }} />
                    <span>
                      {r.available_after
                        ? (lang === 'am'
                            ? `ተይዟል • ከ ${formatTimeOnly(r.available_after)} በኋላ ክፍት ይሆናል`
                            : `Booked • Available after ${formatTimeOnly(r.available_after)}`)
                        : (lang === 'am' ? 'በአሁኑ ሰዓት ተይዟል (In Use)' : 'Currently in use')}
                    </span>
                  </div>
                )}

                {r.current_status === 'maintenance' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: '#cbd5e1', fontSize: 12, fontWeight: 600,
                    marginBottom: 10, background: 'rgba(100, 116, 139, 0.15)',
                    padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(148, 163, 184, 0.3)'
                  }}>
                    <ShieldAlert size={13} style={{ color: '#94a3b8' }} />
                    <span>
                      {lang === 'am'
                        ? `የተበላሸ/ጥገና ላይ (${r.active_booking?.title || 'Maintenance'})`
                        : `Out of Service / Maintenance (${r.active_booking?.title || 'Scheduled Maintenance'})`}
                    </span>
                  </div>
                )}

                {r.current_status === 'pending' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: '#fcd34d', fontSize: 12, fontWeight: 600,
                    marginBottom: 10, background: 'rgba(245, 158, 11, 0.12)',
                    padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(245, 158, 11, 0.3)'
                  }}>
                    <Clock size={13} style={{ color: '#f59e0b' }} />
                    <span>
                      {lang === 'am'
                        ? 'የተያዘ (ማጽደቅ በመጠባበቅ ላይ)'
                        : 'Booked (Pending approval)'}
                    </span>
                  </div>
                )}

                {r.current_status === 'available' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: '#6ee7b7', fontSize: 12, fontWeight: 600,
                    marginBottom: 10, background: 'rgba(16, 185, 129, 0.12)',
                    padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}>
                    <CheckCircle size={13} style={{ color: '#10b981' }} />
                    <span>
                      {r.upcoming_booking
                        ? (lang === 'am'
                            ? `አሁን ክፍት ነው • ቀጣይ፡ ከ ${formatTimeOnly(r.upcoming_booking.start_datetime)}`
                            : `Available now • Next: ${formatTimeOnly(r.upcoming_booking.start_datetime)}`)
                        : r.has_pending_request
                        ? (lang === 'am' ? 'አሁን ክፍት ነው (የወደፊት ጥያቄ አለው)' : 'Available now (Upcoming request)')
                        : (lang === 'am' ? 'አሁን ለማስያዝ ክፍት ነው' : 'Available now')}
                    </span>
                  </div>
                )}

                <div className="resource-meta">
                  <span><MapPin size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{r.location || '-'}</span>
                  <span><Users size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{t('capacity')}: {r.capacity}</span>
                </div>

                <div style={{ marginBottom: 16 }}>
                  {Array.isArray(r.features) && r.features.map((f, idx) => (
                    <span key={idx} className="feature-tag">{f}</span>
                  ))}
                </div>



                <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={() => setDetailResource(r)}
                    title={t('viewDetails')}
                  >
                    <Eye size={14} />
                    {t('viewDetails')}
                  </button>

                  {user?.role === 'auditor' ? (
                    <div style={{ flex: 1, textAlign: 'center', padding: '8px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {t('readOnlyAuditor')}
                    </div>
                  ) : (
                    <button
                      className={`btn ${r.current_status === 'in_use' ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      onClick={() => onSelectResource(r)}
                    >
                      {r.current_status === 'in_use' && r.available_after
                        ? (lang === 'am' ? `ከ ${formatTimeOnly(r.available_after)} በኋላ ያዙ` : `Book after ${formatTimeOnly(r.available_after)}`)
                        : (t('reserveResource') || 'Reserve Resource')}
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        );
      })()}


      {/* Resource Detail Modal */}
      {detailResource && (
        <div className="modal-overlay" onClick={() => setDetailResource(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <div className="modal-title" style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {detailResource.name}
                  <span style={{
                    background: 'var(--bg-main)',
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--border-color)'
                  }}>
                    {detailResource.resource_uuid}
                  </span>
                  {detailResource.current_status === 'available' && (
                    <span className="status-badge-pill status-badge-green" style={{ fontSize: 11 }}>
                      <span className="status-dot-indicator dot-green"></span>
                      {t('statusAvailable')}
                    </span>
                  )}
                  {detailResource.current_status === 'pending' && (
                    <span className="status-badge-pill status-badge-yellow" style={{ fontSize: 11 }}>
                      <span className="status-dot-indicator dot-yellow"></span>
                      {t('statusPending')}
                    </span>
                  )}
                  {detailResource.current_status === 'in_use' && (
                    <span className="status-badge-pill status-badge-red" style={{ fontSize: 11 }}>
                      <span className="status-dot-indicator dot-red"></span>
                      {t('statusInUse')}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {t('resourceDetailsTitle')}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                style={{ padding: 4 }}
                onClick={() => setDetailResource(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div>
              {/* Live Status Bar in Modal */}
              <div style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: detailResource.current_status === 'in_use'
                  ? 'rgba(239, 68, 68, 0.12)'
                  : detailResource.current_status === 'pending'
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(16, 185, 129, 0.12)',
                border: detailResource.current_status === 'in_use'
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : detailResource.current_status === 'pending'
                  ? '1px solid rgba(245, 158, 11, 0.35)'
                  : '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={16} style={{
                    color: detailResource.current_status === 'in_use' ? '#ef4444' : detailResource.current_status === 'pending' ? '#f59e0b' : '#10b981'
                  }} />
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: detailResource.current_status === 'in_use' ? '#fca5a5' : detailResource.current_status === 'pending' ? '#fcd34d' : '#6ee7b7'
                  }}>
                    {detailResource.current_status === 'in_use' && (
                      detailResource.available_after
                        ? (lang === 'am' ? `ከ ${formatTimeOnly(detailResource.available_after)} በኋላ ክፍት ይሆናል` : `Available after ${formatTimeOnly(detailResource.available_after)}`)
                        : (lang === 'am' ? 'በአሁኑ ሰዓት ተይዟል / በስራ ላይ ነው' : 'Currently in use / booked')
                    )}
                    {detailResource.current_status === 'pending' && (
                      lang === 'am' ? 'የተያዘ (ማጽደቅ በመጠባበቅ ላይ)' : 'Booked (Awaiting manager approval)'
                    )}
                    {detailResource.current_status === 'available' && (
                      lang === 'am' ? 'አሁን ለማስያዝ ሙሉ በሙሉ ክፍት ነው' : 'Available and ready for reservation'
                    )}
                  </span>
                </div>
                {detailResource.active_booking && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {detailResource.active_booking.title} {detailResource.active_booking.user_name ? `(${detailResource.active_booking.user_name})` : ''}
                  </span>
                )}
              </div>

              {/* Image banner */}
              <div style={{ marginBottom: 18, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', maxHeight: 240, position: 'relative' }}>
                <img
                  src={getResourceImage(detailResource)}
                  alt={detailResource.name}
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
                  onError={(e) => {
                    e.target.src = getDefaultResourceImage(detailResource.type, detailResource.category);
                  }}
                />
                {detailResource.current_status === 'available' && (
                  <span style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #059669, #10b981)', color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ክፍት (Available)' : 'Available'}
                  </span>
                )}
                {detailResource.current_status === 'in_use' && (
                  <span style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ተይዟል (Booked)' : 'Booked'}
                  </span>
                )}
                {detailResource.current_status === 'pending' && (
                  <span style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
                    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ማጽደቅ የሚጠብቅ' : 'Pending Approval'}
                  </span>
                )}
                {detailResource.current_status === 'maintenance' && (
                  <span style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #475569, #64748b)', color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(100, 116, 139, 0.4)',
                    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ጥገና ላይ' : 'Maintenance'}
                  </span>
                )}
              </div>

              {/* Attributes Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
                marginBottom: 18
              }}>


                <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{t('capacity')}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={14} style={{ color: 'var(--primary)' }} />
                    {detailResource.capacity} {lang === 'am' ? 'ሰዎች' : 'people'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{t('locationHeader')}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={14} style={{ color: 'var(--primary)' }} />
                    {detailResource.location || '-'}
                  </div>
                </div>



                <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border-color)', gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <LinkIcon size={13} style={{ color: 'var(--primary)' }} />
                    <strong>{lang === 'am' ? 'የምስል ሊንክ / አድራሻ (Image URL):' : 'Image URL / Source:'}</strong>
                  </div>
                  {detailResource.image_url ? (
                    detailResource.image_url.startsWith('data:image') ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="badge badge-available">📁 {lang === 'am' ? 'ከኮምፒውተር የተጫነ ፋይል (Base64 File)' : 'Uploaded File (Base64 Data)'}</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, wordBreak: 'break-all' }}>
                        <a
                          href={detailResource.image_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {detailResource.image_url}
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {lang === 'am' ? 'ምንም ምስል አልተሰጠም (ባዶ)' : 'No Image URL provided (Default icon used)'}
                    </div>
                  )}
                </div>
              </div>

              {/* Department Restriction if present */}
              {detailResource.department_restriction && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  marginBottom: 18,
                  fontSize: 12,
                  color: 'var(--primary)'
                }}>
                  🔒 <strong>{lang === 'am' ? 'የክፍል ገደብ' : 'Department Restricted'}:</strong> {detailResource.department_restriction}
                </div>
              )}

              {/* Features Tags */}
              {Array.isArray(detailResource.features) && detailResource.features.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {lang === 'am' ? 'መለዋወጫዎች እና ዝርዝር ነገሮች' : 'Features & Amenities'}:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {detailResource.features.map((f, i) => (
                      <span key={i} className="feature-tag">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons: Book, Edit (admin), Delete (admin), Close */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--border-color)',
                paddingTop: 16,
                marginTop: 8
              }}>
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleDeleteResource(detailResource.id, detailResource.name)}
                  >
                    <Trash2 size={15} />
                    {t('deleteResource')}
                  </button>
                ) : <div />}

                <div style={{ display: 'flex', gap: 10 }}>
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => {
                        const r = detailResource;
                        setDetailResource(null);
                        setEditingResource({ ...r });
                      }}
                    >
                      <Edit size={14} />
                      {t('editResource')}
                    </button>
                  )}

                  {user?.role !== 'auditor' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => {
                        const r = detailResource;
                        setDetailResource(null);
                        onSelectResource(r);
                      }}
                    >
                      {t('reserveResource')}
                      <ArrowRight size={14} />
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDetailResource(null)}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Resource Modal (For Admin from Catalog) */}
      {editingResource && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">Edit Resource: {editingResource.name}</div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setEditingResource(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleUpdateResource}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('resourceName')}</label>
                <input
                  type="text"
                  value={editingResource.name || ''}
                  onChange={(e) => setEditingResource({ ...editingResource, name: e.target.value })}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('resourceType')}</label>
                  <select
                    value={editingResource.type || 'meeting_room'}
                    onChange={(e) => {
                      const newType = e.target.value;
                      let newCat = editingResource.category;
                      if (newType === 'meeting_room') newCat = 'Meeting Rooms';
                      else if (newType === 'conference_hall') newCat = 'Conference Halls';
                      else if (newType === 'training_lab') newCat = 'Training Labs';
                      else if (newType === 'vehicle') newCat = 'Vehicles';
                      else if (newType === 'equipment') newCat = 'Equipment';
                      setEditingResource({ ...editingResource, type: newType, category: newCat });
                    }}
                    style={{ width: '100%' }}
                  >
                    <option value="meeting_room">{t('meetingRooms')}</option>
                    <option value="conference_hall">{t('conferenceHalls')}</option>
                    <option value="training_lab">{t('trainingLabs')}</option>
                    <option value="vehicle">{t('fleetVehicles')}</option>
                    <option value="equipment">{t('equipment')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {lang === 'am' ? 'ምድብ' : 'Category'}
                  </label>
                  <select
                    value={editingResource.category || 'Meeting Rooms'}
                    onChange={(e) => setEditingResource({ ...editingResource, category: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="Meeting Rooms">{lang === 'am' ? 'የስብሰባ ክፍሎች' : 'Meeting Rooms'}</option>
                    <option value="Conference Halls">{lang === 'am' ? 'የኮንፈረንስ አዳራሾች' : 'Conference Halls'}</option>
                    <option value="Training Labs">{lang === 'am' ? 'የስልጠና ላብራቶሪዎች' : 'Training Labs'}</option>
                    <option value="Vehicles">{lang === 'am' ? 'ተሽከርካሪዎች' : 'Vehicles'}</option>
                    <option value="Equipment">{lang === 'am' ? 'መሳሪያዎች' : 'Equipment'}</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('capacity')}</label>
                  <input
                    type="number"
                    min={1}
                    value={editingResource.capacity || 1}
                    onChange={(e) => setEditingResource({ ...editingResource, capacity: e.target.value })}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('locationHeader')}</label>
                  <input
                    type="text"
                    value={editingResource.location || ''}
                    onChange={(e) => setEditingResource({ ...editingResource, location: e.target.value })}
                    placeholder="e.g. Building A - Floor 3"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Operating Hours */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {lang === 'am' ? 'የሥራ መጀመሪያ ሰዓት' : 'Operating Hours Start'}
                  </label>
                  <input
                    type="time"
                    value={editingResource.operating_hours_start || '08:00'}
                    onChange={(e) => setEditingResource({ ...editingResource, operating_hours_start: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {lang === 'am' ? 'የሥራ ማብቂያ ሰዓት' : 'Operating Hours End'}
                  </label>
                  <input
                    type="time"
                    value={editingResource.operating_hours_end || '18:00'}
                    onChange={(e) => setEditingResource({ ...editingResource, operating_hours_end: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Department Restriction */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {lang === 'am' ? 'የክፍል ገደብ (ከተፈለገ ብቻ)' : 'Department Restriction (Optional)'}
                </label>
                <input
                  type="text"
                  value={editingResource.department_restriction || ''}
                  onChange={(e) => setEditingResource({ ...editingResource, department_restriction: e.target.value })}
                  placeholder="e.g. IT Department (Leave empty for public access)"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!!editingResource.requires_approval}
                    onChange={(e) => setEditingResource({ ...editingResource, requires_approval: e.target.checked })}
                  />
                  {t('requiresApprovalCheck')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!!editingResource.requires_checkin}
                    onChange={(e) => setEditingResource({ ...editingResource, requires_checkin: e.target.checked })}
                  />
                  {t('requiresCheckinCheck')}
                </label>
              </div>

              {/* Image: URL input + file picker */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {lang === 'am' ? 'ምስል (URL ወይም ከፋይል)' : 'Image (URL or File)'}
                </label>

                {editingResource.image_url && editingResource.image_url.startsWith('data:') ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: 6 }}>
                    <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600, flex: 1 }}>
                      📁 {lang === 'am' ? 'የተመረጠ ምስል ፋይል' : 'Uploaded Image File Ready'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingResource({ ...editingResource, image_url: '' })}
                      style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                    >
                      {lang === 'am' ? 'ሰርዝ' : 'Remove'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={editingResource.image_url || ''}
                      onChange={(e) => setEditingResource({ ...editingResource, image_url: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                      style={{ flex: 1 }}
                    />
                    <label
                      title="ፋይል ምረጥ"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                        background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 600,
                        border: 'none'
                      }}
                    >
                      📁 {lang === 'am' ? 'ፋይል' : 'Browse'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleImageFile(e.target.files[0], (v) => setEditingResource({ ...editingResource, image_url: v }));
                          }
                        }}
                      />
                    </label>
                  </div>
                )}

                {/* Live Preview */}
                {editingResource.image_url && (
                  <div style={{ marginTop: 10, position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    <img
                      src={editingResource.image_url} alt="preview"
                      style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    {!editingResource.image_url.startsWith('data:') && (
                      <button type="button"
                        onClick={() => setEditingResource({ ...editingResource, image_url: '' })}
                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}
                        title="Remove image"
                      >✕</button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingResource(null)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
