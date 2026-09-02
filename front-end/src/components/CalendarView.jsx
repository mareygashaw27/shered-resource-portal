import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Filter, Info, Wrench, Layers } from 'lucide-react';
import { 
  format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, 
  startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth 
} from 'date-fns';
import { API_BASE_URL } from '../config';

export default function CalendarView({ onSelectSlot }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { socket } = useSocket();
  const [viewMode, setViewMode] = useState('daily'); // 'daily', 'weekly', 'monthly'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [resources, setResources] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [selectedResourceId, setSelectedResourceId] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    fetchCalendarData();
    const interval = setInterval(fetchCalendarData, 15000);
    return () => clearInterval(interval);
  }, [currentDate, viewMode, selectedResourceId, selectedCategory]);

  // Real-time socket updates for calendar
  useEffect(() => {
    if (!socket) return;
    const handleRefresh = () => fetchCalendarData();
    socket.on('booking_created', handleRefresh);
    socket.on('booking_updated', handleRefresh);
    socket.on('approval_updated', handleRefresh);
    socket.on('resource_updated', handleRefresh);
    socket.on('calendar_updated', handleRefresh);
    socket.on('resource_deleted', handleRefresh);
    return () => {
      socket.off('booking_created', handleRefresh);
      socket.off('booking_updated', handleRefresh);
      socket.off('approval_updated', handleRefresh);
      socket.off('resource_updated', handleRefresh);
      socket.off('calendar_updated', handleRefresh);
      socket.off('resource_deleted', handleRefresh);
    };
  }, [socket]);

  const fetchCalendarData = async () => {
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const headers = {
        'Authorization': token ? `Bearer ${token}` : '',
        'x-simulated-user-id': user?.id || '4',
        'x-simulated-role': user?.role || 'staff',
        'x-simulated-dept': user?.department || 'IT Department'
      };

      // Fetch resources
      const resRes = await fetch(`${API_BASE_URL}/api/resources`, { headers });
      if (resRes.ok) {
        const resData = await resRes.json();
        setResources(resData);
      }

      // Fetch bookings
      const bkRes = await fetch(`${API_BASE_URL}/api/bookings`, { headers });
      if (bkRes.ok) {
        const bkData = await bkRes.json();
        setBookings(bkData);
      }

      // Fetch maintenance blocks
      const blkRes = await fetch(`${API_BASE_URL}/api/resources/blocks`, { headers });
      if (blkRes.ok) {
        const blkData = await blkRes.json();
        setBlocks(blkData);
      }
    } catch (err) {
      console.error('Failed to fetch calendar data:', err);
    }
  };

  const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8:00 AM to 6:00 PM

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'daily') {
      setCurrentDate(subDays(currentDate, 1));
    } else if (viewMode === 'weekly') {
      setCurrentDate(subDays(currentDate, 7));
    } else if (viewMode === 'monthly') {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'daily') {
      setCurrentDate(addDays(currentDate, 1));
    } else if (viewMode === 'weekly') {
      setCurrentDate(addDays(currentDate, 7));
    } else if (viewMode === 'monthly') {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  // Get distinct categories from resources
  const categories = Array.from(new Set(resources.map(r => r.category).filter(Boolean)));

  // Filter resources by category, resource ID, and department head scope
  const filteredResources = resources.filter(r => {
    if (user?.role === 'department_head') {
      const dept = (user.department || '').toLowerCase();
      if (dept.includes('meeting room') || dept.includes('room')) {
        if (r.type !== 'meeting_room' && r.type !== 'room') return false;
      } else if (dept.includes('conference')) {
        if (r.type !== 'conference_hall') return false;
      } else if (dept.includes('training') || dept.includes('lab')) {
        if (r.type !== 'training_lab' && r.type !== 'lab') return false;
      } else if (dept.includes('vehicle') || dept.includes('fleet')) {
        if (r.type !== 'vehicle') return false;
      } else if (dept.includes('equipment')) {
        if (r.type !== 'equipment') return false;
      }
    }
    const matchCategory = selectedCategory === 'all' || r.category === selectedCategory;
    const matchResource = selectedResourceId === 'all' || r.id === parseInt(selectedResourceId);
    return matchCategory && matchResource;
  });


  // Calculate week range for weekly view
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Calculate month range for monthly view grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthGridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const monthGridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const monthDays = eachDayOfInterval({ start: monthGridStart, end: monthGridEnd });

  // Helper to check slot status for a specific resource & datetime window
  const getSlotStatus = (resourceId, startStr, endStr) => {
    const s = new Date(startStr);
    const e = new Date(endStr);

    // 1. Check Maintenance Block (GRAY)
    const blockMatch = blocks.find(b => {
      if (b.resource_id !== resourceId) return false;
      const bStart = new Date(b.start_time);
      const bEnd = new Date(b.end_time);
      return (s < bEnd && e > bStart);
    });
    if (blockMatch) {
      return { type: 'maintenance', label: blockMatch.reason || 'Maintenance', data: blockMatch };
    }

    // 2. Check Bookings (RED for confirmed/checked_in, YELLOW for pending)
    const bkMatch = bookings.find(b => {
      if (b.resource_id !== resourceId) return false;
      if (['cancelled', 'rejected', 'no_show'].includes(b.status)) return false;
      const bStart = new Date(b.start_datetime);
      const bEnd = new Date(b.end_datetime);
      return (s < bEnd && e > bStart);
    });

    if (bkMatch) {
      if (bkMatch.status === 'pending') {
        return { type: 'pending', label: bkMatch.title, user: bkMatch.user_name, data: bkMatch };
      }
      if (bkMatch.status === 'on_hold') {
        return { type: 'on_hold', label: `⏸️ ${bkMatch.title}`, user: bkMatch.user_name, data: bkMatch };
      }
      return { type: 'booked', label: bkMatch.title, user: bkMatch.user_name, data: bkMatch };
    }

    // 3. Free (GREEN)
    return { type: 'available', label: t('available') || 'Available' };
  };

  // Helper to calculate daily summary for a date across resources
  const getDaySummaryForResources = (dayDate) => {
    const dayStr = format(dayDate, 'yyyy-MM-dd');
    let bookedCount = 0;
    let pendingCount = 0;
    let maintenanceCount = 0;
    let availableCount = 0;

    filteredResources.forEach(r => {
      // Check if resource has maintenance block on this date
      const hasBlock = blocks.some(b => {
        if (b.resource_id !== r.id) return false;
        const bStartStr = format(new Date(b.start_time), 'yyyy-MM-dd');
        const bEndStr = format(new Date(b.end_time), 'yyyy-MM-dd');
        return dayStr >= bStartStr && dayStr <= bEndStr;
      });

      if (hasBlock) {
        maintenanceCount++;
        return;
      }

      // Check bookings on this date
      const dayBookings = bookings.filter(b => {
        if (b.resource_id !== r.id) return false;
        if (['cancelled', 'rejected', 'no_show'].includes(b.status)) return false;
        const bStartStr = format(new Date(b.start_datetime), 'yyyy-MM-dd');
        const bEndStr = format(new Date(b.end_datetime), 'yyyy-MM-dd');
        return dayStr >= bStartStr && dayStr <= bEndStr;
      });

      if (dayBookings.some(b => b.status === 'confirmed' || b.status === 'checked_in')) {
        bookedCount++;
      } else if (dayBookings.some(b => b.status === 'pending' || b.status === 'on_hold')) {
        pendingCount++;
      } else {
        availableCount++;
      }
    });

    return { bookedCount, pendingCount, maintenanceCount, availableCount };
  };

  return (
    <div>
      {/* Calendar Header Controls */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
        padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16
      }}>
        {/* Navigation buttons and date label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" onClick={handlePrev} title="Previous"><ChevronLeft size={16} /></button>
          <button className="btn btn-secondary" onClick={() => setCurrentDate(new Date())}>{t('today') || 'Today'}</button>
          <button className="btn btn-secondary" onClick={handleNext} title="Next"><ChevronRight size={16} /></button>
          <span style={{ fontSize: 16, fontWeight: 700, marginLeft: 8, minWidth: 200 }}>
            {viewMode === 'daily' && format(currentDate, 'EEEE, MMMM d, yyyy')}
            {viewMode === 'weekly' && `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`}
            {viewMode === 'monthly' && format(currentDate, 'MMMM yyyy')}
          </span>
        </div>


        {/* Filters & View Switcher */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Category Filter */}
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: 13 }}>
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Resource Filter */}
          <select value={selectedResourceId} onChange={(e) => setSelectedResourceId(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: 13 }}>
            <option value="all">{t('allResourcesFilter') || 'All Resources'}</option>
            {resources
              .filter(r => selectedCategory === 'all' || r.category === selectedCategory)
              .map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.resource_uuid})</option>
              ))}
          </select>

          {/* View Switcher Tabs (Daily, Weekly, Monthly) */}
          <div style={{ display: 'flex', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
            <button className={`btn ${viewMode === 'daily' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setViewMode('daily')}>{t('daily') || 'Daily'}</button>
            <button className={`btn ${viewMode === 'weekly' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setViewMode('weekly')}>{t('weekly') || 'Weekly'}</button>
            <button className={`btn ${viewMode === 'monthly' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setViewMode('monthly')}>Monthly</button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. DAILY VIEW: Hour-by-Hour Grid for specific / filtered resources */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'daily' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 220 }}>{t('resourceName') || 'Resource Name'}</th>
                {hours.map(h => (
                  <th key={h} style={{ textAlign: 'center', minWidth: 80 }}>{h < 10 ? '0' + h : h}:00</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={hours.length + 1} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    No resources found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredResources.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      <div>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.resource_uuid} • {r.category}</div>
                    </td>
                    {hours.map(h => {
                      const hourStartStr = `${format(currentDate, 'yyyy-MM-dd')} ${h < 10 ? '0' + h : h}:00:00`;
                      const hourEndStr = `${format(currentDate, 'yyyy-MM-dd')} ${h < 10 ? '0' + h : h}:59:59`;
                      const slot = getSlotStatus(r.id, hourStartStr, hourEndStr);

                      let bg = '#ecfdf5';
                      let color = '#065f46';
                      let border = '1px solid #a7f3d0';

                      if (slot.type === 'booked') {
                        bg = '#fef2f2';
                        color = '#991b1b';
                        border = '1px solid #fecaca';
                      } else if (slot.type === 'pending') {
                        bg = '#fffbeb';
                        color = '#92400e';
                        border = '1px solid #fde68a';
                      } else if (slot.type === 'on_hold') {
                        bg = '#fef3c7';
                        color = '#d97706';
                        border = '1px solid #f59e0b';
                      } else if (slot.type === 'maintenance') {
                        bg = '#f1f5f9';
                        color = '#475569';
                        border = '1px solid #cbd5e1';
                      }

                      return (
                        <td
                          key={h}
                          style={{ padding: 4, textAlign: 'center', cursor: slot.type === 'available' ? 'pointer' : 'default' }}
                          onClick={() => {
                            if (user?.role === 'auditor') {
                              alert(t('readOnlyAuditor') || 'Auditors have read-only access.');
                              return;
                            }
                            if (slot.type === 'available') {
                              onSelectSlot(r, hourStartStr);
                            }
                          }}
                        >
                          <div
                            style={{
                              background: bg,
                              color: color,
                              border: border,
                              borderRadius: 'var(--radius-sm)',
                              padding: '6px 4px',
                              fontSize: 11,
                              fontWeight: slot.type === 'available' ? 400 : 600,
                              minHeight: 34,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'center'
                            }}
                            title={slot.user ? `${slot.label} (by ${slot.user})` : slot.label}
                          >
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 75 }}>
                              {slot.label}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. WEEKLY VIEW: Resources in Category across days of the week */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'weekly' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 220 }}>{t('resourceName') || 'Resource Name'}</th>
                {weekDays.map(day => (
                  <th key={day.toString()} style={{ textAlign: 'center', minWidth: 110, background: isSameDay(day, new Date()) ? 'var(--primary-light)' : 'transparent' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{format(day, 'EEE')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{format(day, 'MMM d')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    No resources found for the selected category/filters.
                  </td>
                </tr>
              ) : (
                filteredResources.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      <div>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.resource_uuid} • {r.category}</div>
                    </td>
                    {weekDays.map(day => {
                      const dayStr = format(day, 'yyyy-MM-dd');

                      // Day status for this resource
                      const hasBlock = blocks.some(b => b.resource_id === r.id && format(new Date(b.start_time), 'yyyy-MM-dd') <= dayStr && format(new Date(b.end_time), 'yyyy-MM-dd') >= dayStr);
                      const dayBookings = bookings.filter(b => b.resource_id === r.id && !['cancelled', 'rejected', 'no_show'].includes(b.status) && format(new Date(b.start_datetime), 'yyyy-MM-dd') <= dayStr && format(new Date(b.end_datetime), 'yyyy-MM-dd') >= dayStr);

                      const confirmedBks = dayBookings.filter(b => b.status === 'confirmed' || b.status === 'checked_in');
                      const pendingBks = dayBookings.filter(b => b.status === 'pending');

                      return (
                        <td
                          key={day.toString()}
                          style={{
                            padding: 8,
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: isSameDay(day, currentDate) ? '#f8fafc' : 'transparent'
                          }}
                          onClick={() => {
                            setCurrentDate(day);
                            setSelectedResourceId(String(r.id));
                            setViewMode('daily');
                          }}
                          title="Click to view daily hour grid"
                        >
                          {hasBlock ? (
                            <div style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, padding: 6, fontSize: 11, fontWeight: 600 }}>
                              🩶 Maintenance
                            </div>
                          ) : confirmedBks.length > 0 ? (
                            <div style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 6, padding: 6, fontSize: 11, fontWeight: 600 }}>
                              🔴 {confirmedBks.length} Booked
                            </div>
                          ) : pendingBks.length > 0 ? (
                            <div style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, padding: 6, fontSize: 11, fontWeight: 600 }}>
                              🟡 {pendingBks.length} Pending
                            </div>
                          ) : (
                            <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 6, padding: 6, fontSize: 11, fontWeight: 600 }}>
                              🟢 Available
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. MONTHLY VIEW: Overview of Busy/Available Days */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'monthly' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          {/* Day of Week Headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8, textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>

          {/* Month Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {monthDays.map(day => {
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, currentDate);

              const summary = getDaySummaryForResources(day);

              return (
                <div
                  key={day.toString()}
                  onClick={() => {
                    setCurrentDate(day);
                    setViewMode('daily');
                  }}
                  style={{
                    background: isCurrentMonth ? 'var(--bg-card)' : 'var(--bg-main)',
                    opacity: isCurrentMonth ? 1 : 0.4,
                    border: `1px solid ${isSelected ? 'var(--primary)' : isToday ? '#2563eb' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: 10,
                    minHeight: 85,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isSelected ? '0 0 0 2px var(--primary-light)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontWeight: isToday ? 800 : 600,
                      fontSize: 13,
                      color: isToday ? '#2563eb' : 'var(--text-main)',
                      background: isToday ? '#eff6ff' : 'transparent',
                      padding: '2px 6px',
                      borderRadius: 10
                    }}>
                      {format(day, 'd')}
                    </span>
                    {summary.maintenanceCount > 0 && (
                      <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                        Gray
                      </span>
                    )}
                  </div>

                  {/* Summary Indicators */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                    {summary.bookedCount > 0 && (
                      <div style={{ fontSize: 10, background: '#fef2f2', color: '#991b1b', padding: '2px 4px', borderRadius: 4, fontWeight: 600 }}>
                        🔴 {summary.bookedCount} Booked
                      </div>
                    )}
                    {summary.pendingCount > 0 && (
                      <div style={{ fontSize: 10, background: '#fffbeb', color: '#92400e', padding: '2px 4px', borderRadius: 4, fontWeight: 600 }}>
                        🟡 {summary.pendingCount} Pending
                      </div>
                    )}
                    {summary.bookedCount === 0 && summary.pendingCount === 0 && summary.maintenanceCount === 0 && (
                      <div style={{ fontSize: 10, background: '#ecfdf5', color: '#065f46', padding: '2px 4px', borderRadius: 4, fontWeight: 600 }}>
                        🟢 Free ({summary.availableCount})
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
