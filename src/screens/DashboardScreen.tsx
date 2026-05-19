'use client';
import React, { useMemo, useState } from 'react';
import { startOfWeek, startOfMonth, startOfQuarter, startOfYear } from 'date-fns';
import { useApp } from '@/contexts/AppContext';
import { useTimeTrackingContext } from '@/hooks/useTimeTracking';
import { useNotificationsContext } from '@/hooks/useNotifications';
import { useInventoryContext } from '@/hooks/useInventory';
import { SkeletonDashboard } from '@/components/ui/SkeletonLoaders';
import { fmtCOP, fmtDate, statusColor, prioColor, taskStColor } from '@/lib/helpers';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import { TrendingUp, FolderKanban, Clock, DollarSign, AlertTriangle, Download, FileText, Zap, CircleHelp, ListChecks, CalendarDays, Users, CheckCircle2, Timer, Plus, ChevronRight } from 'lucide-react';
import { exportGeneralReportPDF } from '@/lib/export-pdf';
import { exportProjectsExcel } from '@/lib/export-excel';
import type { Task, Expense, Invoice, TimeEntry, RFI, Submittal, PunchItem, Meeting, Approval, TeamUser, NotifEntry, Project, Company, FirestoreTimestamp } from '@/lib/types';
import { toDate } from '@/lib/types';

const CHART_COLORS = ['#c8a96e', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899'];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg text-[12px]">
      {label && <div className="font-semibold text-[var(--foreground)] mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-[var(--muted-foreground)]">{p.name}:</span>
          <span className="font-semibold">{typeof p.value === 'number' && p.value > 9999 ? fmtCOP(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Weekly Agenda Helpers ───
function getWeekDates(baseDate: Date): Date[] {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}
function agendaDateKey(d: Date): string { return d.toISOString().slice(0, 10); }

const AGENDA_DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const AGENDA_HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8..17
const AGENDA_SLOT_H = 44; // compact height

const AGENDA_PRIO_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  'Alta':    { bg: 'bg-red-500/10 dark:bg-red-500/15', border: 'border-l-red-500', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  'Media':   { bg: 'bg-amber-500/10 dark:bg-amber-500/15', border: 'border-l-amber-500', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  'Baja':    { bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', border: 'border-l-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Crítica': { bg: 'bg-purple-500/10 dark:bg-purple-500/15', border: 'border-l-purple-500', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
};

function agendaFormatHour(h: number): string {
  if (h === 0 || h === 12) return h === 0 ? '12am' : '12pm';
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}

function agendaFormatHourRange(hours: number[]): string {
  if (!hours.length) return '';
  const min = Math.min(...hours);
  const max = Math.max(...hours);
  return `${agendaFormatHour(min)} - ${agendaFormatHour(max + 1)}`;
}

function agendaFmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardScreen() {
  const {
    loading, projects, tasks, pendingCount, navigateTo, openProject, getUserName,
    activeTasks, completedTasks, expenses, teamUsers, authUser,
    showToast, visibleProjects, companies, meetings,
    rfis, submittals, punchItems, overdueTasks, userName,
    approvals, dailyLogs, openModal, setForms, suppliers,
  } = useApp();
  const { invoices, timeEntries, timeSession } = useTimeTrackingContext();
  const { unreadCount, notifHistory } = useNotificationsContext();
  const { invLowStock, invAlerts } = useInventoryContext();

  // ─── Date Range State ───
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date = now;
    switch (dateRange) {
      case 'week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'month':
        start = startOfMonth(now);
        break;
      case 'quarter':
        start = startOfQuarter(now);
        break;
      case 'year':
        start = startOfYear(now);
        break;
      case 'custom':
        start = customStart ? new Date(customStart + 'T00:00:00') : startOfMonth(now);
        end = customEnd ? new Date(customEnd + 'T23:59:59') : now;
        break;
    }
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [dateRange, customStart, customEnd]);

  // Helper: check if a date string falls within the selected range
  const inRange = (dateStr: string | undefined | null) => {
    if (!dateStr) return false;
    return dateStr >= startDate && dateStr <= endDate;
  };

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const todayOnly = new Date(new Date().toDateString());

  // ─── Computed data (filtered by date range) ───
  const rangeTasks = useMemo(() => tasks.filter((t: Task) => inRange(t.data.dueDate) || (t.data.status === 'Completado' && t.data.updatedAt && inRange(toDate(t.data.updatedAt).toISOString().split('T')[0])) || (t.data.createdAt && inRange(toDate(t.data.createdAt).toISOString().split('T')[0]))), [tasks, startDate, endDate]);
  const rangeExpenses = useMemo(() => expenses.filter((e: Expense) => inRange(e.data.date)), [expenses, startDate, endDate]);
  const rangeInvoices = useMemo(() => invoices.filter((inv: Invoice) => inRange(inv.data.issueDate)), [invoices, startDate, endDate]);
  const rangeTimeEntries = useMemo(() => timeEntries.filter((te: TimeEntry) => inRange(te.data.date)), [timeEntries, startDate, endDate]);
  const totalExpenses = useMemo(() => rangeExpenses.reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0), [rangeExpenses]);
  const totalInvoiced = useMemo(() => rangeInvoices.reduce((s: number, inv: Invoice) => s + (Number(inv.data.total) || 0), 0), [rangeInvoices]);
  const totalPaid = useMemo(() => rangeInvoices.filter((i: Invoice) => i.data.status === 'Pagada').reduce((s: number, i: Invoice) => s + (Number(i.data.total) || 0), 0), [rangeInvoices]);
  const overdueCount = overdueTasks.filter((t: Task) => inRange(t.data.dueDate)).length;

  // Quick access metrics
  const openRFIs = useMemo(() => rfis.filter((r: RFI) => (r.data.status === 'Abierto' || r.data.status === 'En revisión') && inRange(r.data.dueDate)).length, [rfis, startDate, endDate]);
  const pendingSubmittals = useMemo(() => submittals.filter((s: Submittal) => s.data.status === 'En revisión' && s.data.createdAt && inRange(toDate(s.data.createdAt).toISOString().split('T')[0])).length, [submittals, startDate, endDate]);
  const openPunchItems = useMemo(() => punchItems.filter((p: PunchItem) => p.data.status === 'Pendiente' && p.data.createdAt && inRange(toDate(p.data.createdAt).toISOString().split('T')[0])).length, [punchItems, startDate, endDate]);
  const overdueRFIs = useMemo(() => rfis.filter((r: RFI) => r.data.dueDate && r.data.status !== 'Cerrado' && r.data.status !== 'Respondido' && new Date(r.data.dueDate) < new Date() && inRange(r.data.dueDate)).length, [rfis, startDate, endDate]);
  const execProjects = useMemo(() => projects.filter((p: Project) => p.data.status === 'Ejecucion').length, [projects]);

  // Today's meetings
  const todayMeetings = useMemo(() => meetings.filter((m: Meeting) => m.data.date === todayStr).sort((a: Meeting, b: Meeting) => (a.data.time || '').localeCompare(b.data.time || '')), [meetings, todayStr]);

  // Tasks due today (not completed)
  const todayDueTasks = useMemo(() => tasks.filter((t: Task) => t.data.dueDate === todayStr && t.data.status !== 'Completado'), [tasks, todayStr]);

  // Range-filtered KPI counts
  const rangeCompletedTasks = useMemo(() => rangeTasks.filter((t: Task) => t.data.status === 'Completado').length, [rangeTasks]);
  const rangeActiveTasks = useMemo(() => rangeTasks.filter((t: Task) => t.data.status === 'En progreso' || t.data.status === 'Revision').length, [rangeTasks]);
  const rangeTotalTime = useMemo(() => rangeTimeEntries.reduce((s: number, te: TimeEntry) => s + (te.data.duration || 0), 0), [rangeTimeEntries]);

  // Pending approvals
  const pendingApprovals = useMemo(() => approvals.filter((a: Approval) => a.data.status === 'Pendiente').length, [approvals]);

  // Time formatting helper
  const fmtHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Overdue invoices count
  const overdueInvoices = useMemo(() => invoices.filter((inv: Invoice) => {
    if (inv.data.status !== 'Enviada' || !inv.data.dueDate) return false;
    return new Date(inv.data.dueDate) < new Date();
  }).length, [invoices]);

  // Total budget across all projects
  const totalBudget = useMemo(() => projects.reduce((s: number, p: Project) => s + (p.data.budget || 0), 0), [projects]);

  // Tasks due this week (within 7 days, not completed, not overdue)
  const weekTasks = useMemo(() => tasks.filter((t: Task) => {
    if (!t.data.dueDate || t.data.status === 'Completado') return false;
    const diff = Math.ceil((new Date(t.data.dueDate).getTime() - today.getTime()) / 86400000);
    return diff >= 0 && diff <= 7;
  }), [tasks, today]);

  // Revenue trend (last 6 months)
  const revenueTrend = useMemo(() => {
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const data: { name: string; facturado: number; cobrado: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthInvoiced = invoices.filter((inv: Invoice) => inv.data.issueDate && inv.data.status !== 'Cancelada' && inv.data.issueDate.startsWith(key)).reduce((s, inv) => s + (inv.data.total || 0), 0);
      const monthPaid = invoices.filter((inv: Invoice) => inv.data.paidDate).reduce((s, inv: Invoice) => {
        try { const pd = toDate(inv.data.paidDate); return `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}` === key ? s + (inv.data.total || 0) : s; } catch { return s; }
      }, 0);
      data.push({ name: monthNames[d.getMonth()], facturado: monthInvoiced, cobrado: monthPaid });
    }
    return data;
  }, [invoices]);

  // Team workload (filtered by range)
  const teamWorkload = useMemo(() => {
    const byUser: Record<string, { total: number; active: number; done: number }> = {};
    teamUsers.forEach(u => { byUser[u.id] = { total: 0, active: 0, done: 0 }; });
    rangeTasks.forEach((t: Task) => {
      if (t.data.assigneeId && byUser[t.data.assigneeId]) {
        byUser[t.data.assigneeId].total++;
        if (t.data.status === 'En progreso' || t.data.status === 'Revision') byUser[t.data.assigneeId].active++;
        if (t.data.status === 'Completado') byUser[t.data.assigneeId].done++;
      }
    });
    return Object.entries(byUser).filter(([_, v]) => v.total > 0).sort((a, b) => b[1].active - a[1].active).slice(0, 8).map(([uid, data]) => {
      const user = teamUsers.find((u: TeamUser) => u.id === uid);
      return { name: (user?.data.name || 'Sin nombre').split(' ')[0], activas: data.active, completadas: data.done, pendientes: data.total - data.active - data.done };
    });
  }, [rangeTasks, teamUsers]);

  // Task status distribution (for donut, filtered by range)
  const taskStatusData = useMemo(() => {
    const statuses: Record<string, number> = {};
    rangeTasks.forEach((t: Task) => { statuses[t.data.status] = (statuses[t.data.status] || 0) + 1; });
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [rangeTasks]);

  // Recent activity
  const recentActivity = useMemo(() => {
    const items: { id: string; type: string; title: string; subtitle: string; time: FirestoreTimestamp | undefined; icon: string; color: string }[] = [];
    tasks.filter((t: Task) => t.data.status === 'Completado' && t.data.updatedAt).slice(0, 4).forEach((t: Task) => {
      const proj = projects.find((p: Project) => p.id === t.data.projectId);
      items.push({ id: t.id, type: 'task', title: t.data.title, subtitle: `Completada · ${proj?.data?.name || ''}`, time: t.data.updatedAt, icon: '✓', color: 'bg-emerald-500' });
    });
    rfis.filter((r: RFI) => r.data.status !== 'Cerrado').slice(0, 3).forEach((r: RFI) => {
      const proj = projects.find((p: Project) => p.id === r.data.projectId);
      items.push({ id: r.id, type: 'rfi', title: r.data.subject || r.data.number, subtitle: `RFI ${r.data.status} · ${proj?.data?.name || ''}`, time: r.data.createdAt, icon: '?', color: 'bg-blue-500' });
    });
    submittals.filter((s: Submittal) => s.data.status === 'En revisión').slice(0, 2).forEach((s: Submittal) => {
      const proj = projects.find((p: Project) => p.id === s.data.projectId);
      items.push({ id: s.id, type: 'submittal', title: s.data.title || s.data.number, subtitle: `Submittal en revisión · ${proj?.data?.name || ''}`, time: s.data.createdAt, icon: '📋', color: 'bg-purple-500' });
    });
    punchItems.filter((p: PunchItem) => p.data.status !== 'Completado').slice(0, 2).forEach((p: PunchItem) => {
      items.push({ id: p.id, type: 'punch', title: p.data.title, subtitle: `Punch ${p.data.status} · ${p.data.location || ''}`, time: p.data.createdAt, icon: '✅', color: 'bg-teal-500' });
    });
    items.sort((a, b) => {
      const ta = a.time ? toDate(a.time) : new Date(0);
      const tb = b.time ? toDate(b.time) : new Date(0);
      return tb.getTime() - ta.getTime();
    });
    return items.slice(0, 8);
  }, [tasks, projects, rfis, submittals, punchItems]);

  // Unread notifications (most recent first)
  const unreadNotifs = useMemo(() => notifHistory.filter((n: NotifEntry) => !n.read).slice(0, 5), [notifHistory]);
  const readNotifs = useMemo(() => notifHistory.filter((n: NotifEntry) => n.read).slice(0, 3), [notifHistory]);

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const h = today.getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }, []);

  // Date formatted in Spanish
  const dateFormatted = today.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ─── Weekly Agenda Data ───
  const agendaTasks = useMemo(() =>
    (tasks || []).filter((t: Task) => t.data.agendaMeta),
    [tasks]
  );
  const agendaWeekDates = useMemo(() => getWeekDates(new Date()), []);
  const agendaWeekLabel = useMemo(() => {
    const start = agendaWeekDates[0];
    const end = agendaWeekDates[6];
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${start.toLocaleDateString('es-CO', opts)} — ${end.toLocaleDateString('es-CO', opts)}`;
  }, [agendaWeekDates]);
  const agendaTodayKey = agendaDateKey(new Date());
  const agendaProjectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach((p: Project) => { m[p.id] = p.data.name; });
    return m;
  }, [projects]);
  const agendaOccupiedSlots = useMemo(() => {
    const s = new Set<string>();
    agendaTasks.forEach((t: Task) => {
      const meta = t.data.agendaMeta;
      if (!meta) return;
      meta.hourSlots.forEach((h: number) => s.add(`${meta.dayKey}:${h}`));
    });
    return s;
  }, [agendaTasks]);
  const agendaTasksByDayAndStartHour = useMemo(() => {
    const map: Record<string, Task[]> = {};
    agendaTasks.forEach((t: Task) => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      const firstHour = Math.min(...meta.hourSlots);
      const key = `${meta.dayKey}:${firstHour}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [agendaTasks]);
  const agendaTaskStartHoursByDay = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    agendaTasks.forEach((t: Task) => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      if (!map[meta.dayKey]) map[meta.dayKey] = new Set();
      map[meta.dayKey].add(Math.min(...meta.hourSlots));
    });
    return map;
  }, [agendaTasks]);

  return (
    <div className="animate-fadeIn space-y-4">
      {loading && <SkeletonDashboard />}
      {!loading && (<>

      {/* ════════════ Date Range Selector ════════════ */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 sm:p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mr-1">Periodo:</span>
          {([['week', 'Esta semana'], ['month', 'Este mes'], ['quarter', 'Este trimestre'], ['year', 'Este año']] as const).map(([key, label]) => (
            <button
              key={key}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all border ${
                dateRange === key
                  ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                  : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/20'
              }`}
              onClick={() => setDateRange(key)}
            >
              {label}
            </button>
          ))}
          <button
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all border ${
              dateRange === 'custom'
                ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/20'
            }`}
            onClick={() => setDateRange('custom')}
          >
            Personalizado
          </button>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 ml-1 animate-fadeIn">
              <input
                type="date"
                className="text-[11px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
              />
              <span className="text-[11px] text-[var(--af-text3)]">a</span>
              <input
                type="date"
                className="text-[11px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
              />
            </div>
          )}
          <span className="text-[10px] text-[var(--af-text3)] ml-auto hidden sm:inline">{startDate} — {endDate}</span>
        </div>
      </div>

      {/* ════════════ ROW 0: Personalized Header ════════════ */}
      <div className="bg-gradient-to-br from-[var(--card)] via-[var(--af-bg3)] to-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 relative overflow-hidden">
        {/* Subtle decorative gradient blob */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-[var(--af-accent)]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          {/* Top row: greeting + actions */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-[11px] text-[var(--af-text3)] mb-1 capitalize">{dateFormatted}</div>
              <div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg sm:text-xl">
                {greeting}, <span className="text-[var(--af-accent)]">{userName}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {unreadCount > 0 && (
                <div className="relative">
                  <button className="w-9 h-9 rounded-xl bg-[var(--af-bg4)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg3)] transition-colors" onClick={() => navigateTo('chat')}>
                    <span className="text-sm">🔔</span>
                  </button>
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
                </div>
              )}
              <button className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--af-accent)] transition-colors px-2 py-1.5 rounded-lg bg-[var(--af-bg4)] border border-[var(--border)]" onClick={() => { try { exportGeneralReportPDF({ projects, tasks, expenses, invoices, teamUsers, timeEntries }); showToast('Reporte PDF descargado'); } catch { showToast('Error', 'error'); } }}>
                <FileText size={11} /> PDF
              </button>
              <button className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--af-accent)] transition-colors px-2 py-1.5 rounded-lg bg-[var(--af-bg4)] border border-[var(--border)]" onClick={() => { try { exportProjectsExcel(projects, tasks, expenses); showToast('Excel descargado'); } catch { showToast('Error', 'error'); } }}>
                <Download size={11} /> Excel
              </button>
            </div>
          </div>

          {/* Quick summary pills */}
          <div className="flex flex-wrap gap-2">
            {overdueCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/15 transition-colors" onClick={() => navigateTo('tasks')}>
                <AlertTriangle size={12} className="text-red-400" />
                <span className="text-[11px] text-red-400 font-medium">{overdueCount} tarea{overdueCount !== 1 ? 's' : ''} vencida{overdueCount !== 1 ? 's' : ''}</span>
              </div>
            )}
            {todayMeetings.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 cursor-pointer hover:bg-purple-500/15 transition-colors" onClick={() => navigateTo('calendar')}>
                <CalendarDays size={12} className="text-purple-400" />
                <span className="text-[11px] text-purple-400 font-medium">{todayMeetings.length} reunión{todayMeetings.length !== 1 ? 'es' : ''} hoy</span>
              </div>
            )}
            {todayDueTasks.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-colors" onClick={() => navigateTo('tasks')}>
                <Clock size={12} className="text-amber-400" />
                <span className="text-[11px] text-amber-400 font-medium">{todayDueTasks.length} vence{todayDueTasks.length !== 1 ? 'n' : ''} hoy</span>
              </div>
            )}
            {overdueRFIs > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:bg-blue-500/15 transition-colors" onClick={() => navigateTo('rfis')}>
                <CircleHelp size={12} className="text-blue-400" />
                <span className="text-[11px] text-blue-400 font-medium">{overdueRFIs} RFI{overdueRFIs !== 1 ? 's' : ''} vencida{overdueRFIs !== 1 ? 's' : ''}</span>
              </div>
            )}
            {overdueInvoices > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-colors" onClick={() => navigateTo('invoices')}>
                <DollarSign size={12} className="text-amber-400" />
                <span className="text-[11px] text-amber-400 font-medium">{overdueInvoices} factura{overdueInvoices !== 1 ? 's' : ''} vencida{overdueInvoices !== 1 ? 's' : ''}</span>
              </div>
            )}
            {overdueCount === 0 && todayMeetings.length === 0 && todayDueTasks.length === 0 && overdueRFIs === 0 && overdueInvoices === 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span className="text-[11px] text-emerald-400 font-medium">Todo al día</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════ ROW 1: KPI Cards (8) ════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
        {[
          { val: projects.length, lbl: 'Proyectos', icon: <FolderKanban size={15} />, bg: 'bg-blue-500/10', iconC: 'text-blue-400', sub: `${execProjects} en ejecución`, click: 'projects' },
          { val: rangeTasks.filter((t: Task) => t.data.status !== 'Completado').length, lbl: 'Pendientes', icon: <Clock size={15} />, bg: 'bg-orange-500/10', iconC: 'text-orange-400', sub: `${rangeActiveTasks} activas`, click: 'tasks' },
          { val: overdueCount, lbl: 'Vencidas', icon: <AlertTriangle size={15} />, bg: overdueCount > 0 ? 'bg-red-500/10' : 'bg-[var(--af-bg4)]', iconC: overdueCount > 0 ? 'text-red-400' : 'text-emerald-400', sub: overdueCount > 0 ? 'Requieren atención' : 'Sin vencidas', click: 'tasks', alert: overdueCount > 0 },
          { val: todayMeetings.length, lbl: 'Reuniones hoy', icon: <CalendarDays size={15} />, bg: 'bg-purple-500/10', iconC: 'text-purple-400', sub: weekTasks.length > 0 ? `${weekTasks.length} tareas esta semana` : '', click: 'calendar' },
          { val: openRFIs + pendingSubmittals, lbl: 'RFIs + Subs', icon: <CircleHelp size={15} />, bg: 'bg-blue-500/10', iconC: 'text-blue-400', sub: `${openRFIs} RFIs · ${pendingSubmittals} subs`, click: 'rfis', alert: overdueRFIs > 0 },
          { val: openPunchItems, lbl: 'Punch List', icon: <ListChecks size={15} />, bg: 'bg-teal-500/10', iconC: 'text-teal-400', sub: `${punchItems.length} items totales`, click: 'punchList' },
          { val: totalBudget > 0 ? Math.round((totalExpenses / totalBudget) * 100) + '%' : '—', lbl: 'Presupuesto', icon: <DollarSign size={15} />, bg: totalBudget > 0 && totalExpenses > totalBudget * 0.9 ? 'bg-red-500/10' : 'bg-emerald-500/10', iconC: totalBudget > 0 && totalExpenses > totalBudget * 0.9 ? 'text-red-400' : 'text-emerald-400', sub: totalBudget > 0 ? `${fmtCOP(totalExpenses)} / ${fmtCOP(totalBudget)}` : 'Sin presupuesto', click: 'budget', alert: totalBudget > 0 && totalExpenses > totalBudget },
          { val: rangeTotalTime > 0 ? fmtHours(rangeTotalTime) : '—', lbl: 'Tiempo', icon: <Timer size={15} />, bg: 'bg-indigo-500/10', iconC: 'text-indigo-400', sub: `${rangeTimeEntries.length} registros`, click: 'timeTracking' },
        ].map((m, i) => (
          <div key={i} className={`af-kpi-card p-3.5 sm:p-4 animate-fadeInUp stagger-${Math.min(i + 1, 8)} hover:border-[var(--af-accent)]/30 transition-all cursor-pointer group`} onClick={() => navigateTo(m.click)}>
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center ${m.iconC}`}>{m.icon}</div>
              {m.alert && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            </div>
            <div className="text-lg sm:text-xl font-bold leading-tight">{m.val}</div>
            <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)] mt-1">{m.lbl}</div>
            <div className="text-[9px] sm:text-[10px] text-[var(--af-text3)] mt-0.5 truncate">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ════════════ Quick Actions ════════════ */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Acciones:</span>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-colors" onClick={() => navigateTo('weeklyAgenda')}>
          <CalendarDays size={12} /> Agenda
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-colors" onClick={() => { setForms(p => ({ ...p, taskTitle: '', taskProject: '', taskDue: new Date().toISOString().split('T')[0], taskStatus: 'Por hacer' })); openModal('task'); }}>
          <Plus size={12} /> Tarea
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-colors" onClick={() => { setForms(p => ({ ...p, expConcept: '', expProject: '', expAmount: '', expDate: new Date().toISOString().split('T')[0], expCategory: 'Materiales', expPaymentMethod: 'Efectivo', expVendor: '', expNotes: '' })); openModal('expense'); }}>
          <DollarSign size={12} /> Gasto
        </button>
        {pendingApprovals > 0 && (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15 transition-colors" onClick={() => navigateTo('approvals')}>
            <AlertTriangle size={12} /> {pendingApprovals} aprobación{pendingApprovals !== 1 ? 'es' : ''}
          </button>
        )}
        {invLowStock.length > 0 && (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors" onClick={() => navigateTo('inventory')}>
            <AlertTriangle size={12} /> {invLowStock.length} stock bajo
          </button>
        )}
      </div>

      {/* ════════════ ROW 2: Today's Agenda + Projects ════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Today's Agenda (3 cols) */}
        <div className="lg:col-span-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] sm:text-[15px] font-semibold flex items-center gap-2">
              <CalendarDays size={16} className="text-[var(--af-accent)]" />
              Agenda de Hoy
              <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline ml-1" onClick={() => navigateTo('weeklyAgenda')}>Ver agenda completa →</button>
            </div>
            <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline flex items-center gap-1" onClick={() => navigateTo('calendar')}>
              Calendario <ChevronRight size={12} />
            </button>
          </div>

          {todayMeetings.length === 0 && todayDueTasks.length === 0 && overdueCount === 0 ? (
            <div className="text-center py-8 text-[var(--af-text3)]">
              <div className="text-3xl mb-2">🏖️</div>
              <div className="text-sm">Sin actividades para hoy</div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">Tu día está libre o todo está al día</div>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              {/* Overdue tasks (urgent, show first) */}
              {overdueCount > 0 && (
                <div className="mb-1">
                  <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <AlertTriangle size={10} /> {overdueCount} vencida{overdueCount !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-1">
                    {overdueTasks.slice(0, 4).map((t: Task) => {
                      const proj = projects.find((p: Project) => p.id === t.data.projectId);
                      const daysOver = Math.floor((todayOnly.getTime() - new Date(t.data.dueDate).getTime()) / 86400000);
                      return (
                        <div key={t.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-red-500/5 border border-red-500/15 cursor-pointer hover:bg-red-500/10 transition-colors" onClick={() => navigateTo('tasks')}>
                          <div className="w-6 h-6 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 text-[10px]">⚡</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate">{t.data.title}</div>
                            <div className="text-[10px] text-[var(--af-text3)]">{proj?.data?.name || ''} · Venció hace {daysOver}d</div>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${prioColor(t.data.priority)}`}>{t.data.priority}</span>
                        </div>
                      );
                    })}
                    {overdueCount > 4 && <div className="text-[10px] text-red-400/70 pl-9">+{overdueCount - 4} más</div>}
                  </div>
                </div>
              )}

              {/* Today's meetings */}
              {todayMeetings.length > 0 && (
                <div className="mb-1">
                  <div className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <CalendarDays size={10} /> {todayMeetings.length} reunión{todayMeetings.length !== 1 ? 'es' : ''}
                  </div>
                  <div className="space-y-1">
                    {todayMeetings.map((m: Meeting) => {
                      const proj = projects.find((p: Project) => p.id === m.data.projectId);
                      return (
                        <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-purple-500/5 border border-purple-500/15 cursor-pointer hover:bg-purple-500/10 transition-colors" onClick={() => navigateTo('calendar')}>
                          <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 text-[10px] font-bold">{m.data.time ? m.data.time.split(':')[0] : '📅'}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate">{m.data.title}</div>
                            <div className="text-[10px] text-[var(--af-text3)]">{proj?.data?.name || ''} · {m.data.time || '09:00'} · {m.data.duration || 60}min</div>
                          </div>
                          {m.data.attendees && Array.isArray(m.data.attendees) && m.data.attendees.length > 0 && (
                            <span className="text-[9px] text-[var(--af-text3)] flex-shrink-0">👥 {m.data.attendees.length}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tasks due today */}
              {todayDueTasks.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Timer size={10} /> {todayDueTasks.length} vence{todayDueTasks.length !== 1 ? 'n' : ''} hoy
                  </div>
                  <div className="space-y-1">
                    {todayDueTasks.map((t: Task) => {
                      const proj = projects.find((p: Project) => p.id === t.data.projectId);
                      return (
                        <div key={t.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15 cursor-pointer hover:bg-amber-500/10 transition-colors" onClick={() => navigateTo('tasks')}>
                          <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 text-[10px]">📝</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate">{t.data.title}</div>
                            <div className="text-[10px] text-[var(--af-text3)]">{proj?.data?.name || ''} · {t.data.status}</div>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${prioColor(t.data.priority)}`}>{t.data.priority}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Projects (2 cols) */}
        <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] sm:text-[15px] font-semibold flex items-center gap-2">
              <FolderKanban size={16} className="text-blue-400" />
              Proyectos
            </div>
            <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline flex items-center gap-1" onClick={() => navigateTo('projects')}>
              Ver todos <ChevronRight size={12} />
            </button>
          </div>
          {(() => {
            const projs = visibleProjects().slice(0, 6);
            return projs.length === 0 ? (
              <div className="text-center py-8 text-[var(--af-text3)] text-sm">Crea tu primer proyecto</div>
            ) : (
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                {projs.map((p: Project) => {
                  const d = p.data, prog = d.progress || 0;
                  const compName = companies.find((c: Company) => c.id === d.companyId)?.data?.name;
                  return (
                    <div key={p.id} className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-3 cursor-pointer transition-all hover:border-[var(--input)] hover:-translate-y-0.5" onClick={() => openProject(p.id)}>
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(d.status)}`}>{d.status || 'Concepto'}</span>
                          {compName && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--af-text3)]">{compName}</span>}
                        </div>
                        <div className="text-sm font-bold">{prog}%</div>
                      </div>
                      <div className="text-[13px] font-medium truncate mb-0.5">{d.name}</div>
                      <div className="text-[10px] text-[var(--af-text3)] mb-2">{d.location ? d.location : ''}{d.client ? ' · ' + d.client : ''}</div>
                      <div className="h-1 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${prog >= 80 ? 'bg-emerald-500' : prog >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500'}`} style={{ width: prog + '%' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ════════════ ROW 3: Sprint Progress + Financial Summary ════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Sprint Progress Ring */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-3 flex items-center gap-2">
            <Zap size={14} className="text-[var(--af-accent)]" /> Progreso Sprint
          </div>
          <div className="flex items-center justify-center">
            <div className="relative w-[90px] h-[90px]">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--af-bg4)" strokeWidth="2.5" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={rangeTasks.length > 0 ? (rangeCompletedTasks / rangeTasks.length) >= 0.8 ? '#10b981' : (rangeCompletedTasks / rangeTasks.length) >= 0.4 ? '#c8a96e' : '#f59e0b' : 'var(--af-bg4)'} strokeWidth="2.5" strokeDasharray={`${rangeTasks.length > 0 ? ((rangeCompletedTasks / rangeTasks.length) * 100).toFixed(1) : 0}, 100`} strokeLinecap="round" className="transition-all duration-700" style={{ filter: 'drop-shadow(0 0 6px rgba(200,169,110,0.3))' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[18px] font-bold">{rangeTasks.length > 0 ? Math.round((rangeCompletedTasks / rangeTasks.length) * 100) : 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2 text-center">
            <div className="text-[11px] text-[var(--muted-foreground)]">{rangeCompletedTasks} de {rangeTasks.length} tareas</div>
            <div className="flex items-center justify-center gap-3 mt-1.5">
              <span className="text-[10px] text-blue-400">{rangeActiveTasks} activas</span>
              <span className="text-[10px] text-[var(--af-text3)]">·</span>
              <span className="text-[10px] text-emerald-400">{rangeCompletedTasks} completadas</span>
            </div>
            {rangeTotalTime > 0 && (
              <div className="flex items-center justify-center gap-1.5 mt-1 pt-2 border-t border-[var(--border)]">
                <Timer size={10} className="text-blue-400" />
                <span className="text-[10px] text-blue-400 font-medium">{fmtHours(rangeTotalTime)} registradas</span>
                <span className="text-[10px] text-[var(--af-text3)]">({rangeTimeEntries.length} entradas)</span>
              </div>
            )}
          </div>
          {/* Task distribution legend */}
          {taskStatusData.length > 0 && (
            <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-3 pt-3 border-t border-[var(--border)] justify-center">
              {taskStatusData.map((d: { name: string; value: number }, i: number) => (
                <div key={i} className="flex items-center gap-1 text-[9px]">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-[var(--muted-foreground)]">{d.name}</span>
                  <span className="font-semibold">{d.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Financial Summary (consolidated) */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-3 flex items-center gap-2">
            <DollarSign size={14} className="text-emerald-400" /> Resumen Financiero
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--af-accent)]" /><span className="text-[12px]">Facturado</span></div>
              <span className="text-[12px] font-semibold">{fmtCOP(totalInvoiced)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[12px]">Cobrado</span></div>
              <span className="text-[12px] font-semibold text-emerald-400">{fmtCOP(totalPaid)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-[12px]">Gastado</span></div>
              <span className="text-[12px] font-semibold text-red-400">{fmtCOP(totalExpenses)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-[12px]">Por cobrar</span></div>
              <span className="text-[12px] font-semibold text-blue-400">{fmtCOP(totalInvoiced - totalPaid)}</span>
            </div>
            {totalBudget > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--af-text3)]" /><span className="text-[12px]">Presupuesto total</span></div>
                <span className="text-[12px] font-semibold">{fmtCOP(totalBudget)}</span>
              </div>
            )}
            {overdueInvoices > 0 && (
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2"><AlertTriangle size={10} className="text-red-400" /><span className="text-[11px] text-red-400 font-medium">Facturas vencidas</span></div>
                <span className="text-[11px] font-semibold text-red-400">{overdueInvoices}</span>
              </div>
            )}
          </div>
          {/* Balance bar */}
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-[var(--muted-foreground)]">Balance neto</span>
              <span className={`text-[14px] font-bold ${totalInvoiced - totalExpenses >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtCOP(totalInvoiced - totalExpenses)}</span>
            </div>
            {(totalInvoiced > 0 || totalExpenses > 0) && (
              <div className="h-1.5 bg-[var(--af-bg4)] rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, totalInvoiced > 0 ? (totalPaid / totalInvoiced * 100) : 0)}%` }} />
              </div>
            )}
          </div>
          <button className="w-full mt-3 text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline text-center" onClick={() => navigateTo('invoices')}>Ver facturas y presupuesto →</button>
        </div>

        {/* Team quick view */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] font-semibold flex items-center gap-2">
              <Users size={14} className="text-purple-400" /> Equipo
            </div>
            <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline flex items-center gap-1" onClick={() => navigateTo('team')}>
              Equipo <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {teamWorkload.length === 0 ? (
              <div className="text-center py-6 text-[var(--af-text3)] text-[11px]">Sin tareas asignadas</div>
            ) : (
              teamWorkload.map((w, i) => {
                const total = w.activas + w.completadas + w.pendientes;
                const pct = total > 0 ? Math.round((w.completadas / total) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-[10px] font-bold text-purple-400 flex-shrink-0">{w.name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-medium">{w.name}</span>
                        <span className="text-[9px] text-[var(--af-text3)]">{w.completadas}/{total}</span>
                      </div>
                      <div className="h-1 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500/60 transition-all" style={{ width: pct + '%' }} />
                      </div>
                    </div>
                    {w.activas > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 flex-shrink-0">{w.activas}</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ════════════ ROW 4: Charts ════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Trend */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] font-semibold flex items-center gap-2">
              <TrendingUp size={14} className="text-[var(--af-accent)]" /> Tendencia de Ingresos
            </div>
            <span className="text-[9px] text-[var(--af-text3)] px-2 py-0.5 rounded-full bg-[var(--af-bg4)]">6 meses</span>
          </div>
          {revenueTrend.some(d => d.facturado > 0 || d.cobrado > 0) ? (
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={revenueTrend} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="facturado" name="Facturado" stroke="#c8a96e" fill="rgba(200,169,110,0.1)" strokeWidth={2} />
                <Area type="monotone" dataKey="cobrado" name="Cobrado" stroke="#10b981" fill="rgba(16,185,129,0.08)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin datos de facturación aún</div>
          )}
        </div>

        {/* Team Workload Chart */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] font-semibold flex items-center gap-2">
              <Users size={14} className="text-purple-400" /> Carga de Trabajo
            </div>
            <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline flex items-center gap-1" onClick={() => navigateTo('reports')}>
              Reportes <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
          {teamWorkload.length === 0 ? (
            <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin tareas asignadas al equipo</div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={teamWorkload} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="activas" name="Activas" fill="#3b82f6" radius={[2, 2, 0, 0]} stackId="a" barSize={14} />
                <Bar dataKey="completadas" name="Completadas" fill="#10b981" radius={[0, 0, 0, 0]} stackId="a" barSize={14} />
                <Bar dataKey="pendientes" name="Pendientes" fill="rgba(200,169,110,0.4)" radius={[2, 2, 0, 0]} stackId="a" barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ════════════ ROW 5: Activity + Notifications ════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] font-semibold flex items-center gap-2">
              <TrendingUp size={14} className="text-emerald-400" /> Actividad Reciente
            </div>
          </div>
          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-[var(--af-text3)] text-sm">Sin actividad reciente</div>
          ) : (
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              {recentActivity.map(item => (
                <div key={item.id + item.type} className="flex items-start gap-2.5 group cursor-pointer hover:bg-[var(--af-bg3)] rounded-lg p-2 -mx-1 transition-colors" onClick={() => {
                  if (item.type === 'rfi') navigateTo('rfis');
                  else if (item.type === 'submittal') navigateTo('submittals');
                  else if (item.type === 'punch') navigateTo('punchList');
                  else if (item.type === 'task') navigateTo('tasks');
                }}>
                  <div className={`w-6 h-6 rounded-lg ${item.color} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5`}>{item.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{item.title}</div>
                    <div className="text-[10px] text-[var(--af-text3)] truncate">{item.subtitle}</div>
                  </div>
                  <span className="text-[9px] text-[var(--af-text3)] flex-shrink-0 mt-0.5">{fmtDate(item.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] font-semibold flex items-center gap-2">
              <span className="text-sm">🔔</span> Notificaciones
            </div>
            {unreadCount > 0 && <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">{unreadCount} sin leer</span>}
          </div>
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {unreadNotifs.length === 0 && readNotifs.length === 0 ? (
              <div className="text-center py-8 text-[var(--af-text3)] text-sm">Sin notificaciones</div>
            ) : (
              <>
                {unreadNotifs.map((n: NotifEntry) => (
                  <div key={n.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-[var(--af-accent)]/5 border border-[var(--af-accent)]/10 cursor-pointer hover:bg-[var(--af-accent)]/8 transition-colors">
                    <span className="text-[13px] mt-0.5 flex-shrink-0">{n.icon || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate">{n.title}</div>
                      <div className="text-[10px] text-[var(--af-text3)] truncate">{n.body}</div>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)] mt-2 flex-shrink-0" />
                  </div>
                ))}
                {readNotifs.map((n: NotifEntry) => (
                  <div key={n.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--af-bg3)] transition-colors cursor-pointer">
                    <span className="text-[13px] mt-0.5 flex-shrink-0 opacity-60">{n.icon || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-[var(--muted-foreground)] truncate">{n.title}</div>
                      <div className="text-[10px] text-[var(--af-text3)] truncate">{n.body}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ════════════ ROW 6: Weekly Agenda ════════════ */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-[var(--af-accent)]" />
            <h3 className="text-[14px] sm:text-[15px] font-semibold">Agenda Semanal</h3>
            <span className="text-[11px] text-[var(--muted-foreground)] hidden sm:inline">{agendaWeekLabel}</span>
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] bg-[var(--af-bg3)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            onClick={() => navigateTo('weeklyAgenda')}
          >
            Ver agenda completa <ChevronRight size={12} />
          </button>
        </div>

        {/* Agenda Grid */}
        <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '48px repeat(7, minmax(110px, 1fr))',
            border: '1.5px solid var(--border)',
            borderRadius: '10px',
            overflow: 'hidden',
            background: 'var(--card)',
            minWidth: '700px',
          }}>
            {/* Column Headers */}
            <div style={{ background: 'var(--af-bg3)', borderBottom: '1.5px solid var(--border)', borderRight: '1px solid var(--border)' }} />
            {agendaWeekDates.map((d, i) => {
              const dk = agendaDateKey(d);
              const isToday = dk === agendaTodayKey;
              return (
                <div key={dk} style={{
                  background: isToday ? 'var(--primary)' : 'var(--af-bg3)',
                  borderBottom: '1.5px solid var(--border)',
                  borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                  color: isToday ? 'var(--primary-foreground)' : 'var(--foreground)',
                  padding: '6px 4px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {AGENDA_DAY_NAMES[i]}
                  </div>
                  <div style={{ fontSize: '10px', marginTop: 1, color: isToday ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                    {agendaFmtDay(d)}
                  </div>
                </div>
              );
            })}

            {/* Time Rows */}
            {AGENDA_HOURS.map(hour => (
              <React.Fragment key={hour}>
                {/* Time label */}
                <div style={{
                  background: 'var(--af-bg3)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  padding: '2px 4px',
                  textAlign: 'right',
                  fontSize: '9px',
                  color: 'var(--muted-foreground)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-end',
                  height: `${AGENDA_SLOT_H}px`,
                }}>
                  {agendaFormatHour(hour)}
                </div>

                {/* Day cells */}
                {agendaWeekDates.map((d, di) => {
                  const dk = agendaDateKey(d);
                  const isToday = dk === agendaTodayKey;
                  const isOccupied = agendaOccupiedSlots.has(`${dk}:${hour}`);
                  const isTaskStart = agendaTaskStartHoursByDay[dk]?.has(hour);
                  const tasksStarting = isTaskStart ? (agendaTasksByDayAndStartHour[`${dk}:${hour}`] || []) : [];

                  return (
                    <div
                      key={dk}
                      style={{
                        borderRight: di < 6 ? '1px solid var(--border)' : 'none',
                        borderBottom: '1px solid var(--border)',
                        minHeight: `${AGENDA_SLOT_H}px`,
                        height: `${AGENDA_SLOT_H}px`,
                        background: isOccupied
                          ? 'var(--af-bg3)'
                          : isToday
                            ? 'var(--accent)'
                            : 'var(--card)',
                        position: 'relative' as const,
                        cursor: 'pointer',
                        overflow: isTaskStart ? ('visible' as const) : ('hidden' as const),
                      }}
                      className="group/agenda-slot"
                      onClick={() => navigateTo('weeklyAgenda')}
                    >
                      {/* Render tall activity blocks at their start hour */}
                      {tasksStarting.map((task: Task) => {
                        const meta = task.data.agendaMeta;
                        if (!meta) return null;
                        const minH = Math.min(...meta.hourSlots);
                        const maxH = Math.max(...meta.hourSlots);
                        const spanCount = maxH - minH + 1;
                        const blockHeight = spanCount * AGENDA_SLOT_H;
                        const pc = AGENDA_PRIO_COLORS[task.data.priority] || AGENDA_PRIO_COLORS['Media'];

                        return (
                          <div
                            key={task.id}
                            className={`${pc.bg} ${pc.border}`}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 2,
                              right: 2,
                              height: `${blockHeight - 4}px`,
                              borderLeftWidth: '3px',
                              borderLeftStyle: 'solid',
                              borderRadius: '6px',
                              padding: '3px 5px',
                              fontSize: '10px',
                              lineHeight: 1.3,
                              cursor: 'pointer',
                              zIndex: 10,
                              overflow: 'hidden',
                            }}
                            onClick={(e) => { e.stopPropagation(); navigateTo('weeklyAgenda'); }}
                          >
                            {/* Title + priority dot */}
                            <div className="flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${pc.dot} flex-shrink-0`} />
                              <span style={{ fontWeight: 600, color: 'var(--foreground)' }} className="truncate text-[10px]">
                                {task.data.title}
                              </span>
                            </div>

                            {/* Time range */}
                            <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '9px' }}>
                              <Clock className="w-2.5 h-2.5" />
                              <span>{agendaFormatHourRange(meta.hourSlots)}</span>
                            </div>

                            {/* Project */}
                            {task.data.projectId && (
                              <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '9px' }}>
                                <FolderKanban className="w-2.5 h-2.5" />
                                <span className="truncate">{agendaProjectMap[task.data.projectId] || '—'}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {agendaTasks.length === 0 && (
          <div className="text-center py-6 text-[var(--af-text3)]">
            <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div className="text-sm">Sin actividades en la agenda</div>
            <div className="text-[11px] text-[var(--muted-foreground)] mt-1">Ve a la agenda semanal para crear actividades</div>
          </div>
        )}
      </div>

      </>)}
    </div>
  );
}
