'use client';
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import {
  ChevronLeft, ChevronRight, Plus, Printer, CalendarDays,
  GripVertical, Trash2, Edit3, StickyNote, Clock, User,
  Flag, FolderOpen, MessageSquare, CheckCircle2, X
} from 'lucide-react';

/* ─── Types ─── */
interface AgendaTask {
  id: string;
  title: string;
  projectId: string;
  assigneeId: string;
  priority: 'Alta' | 'Media' | 'Baja' | 'Crítica';
  status: 'Por hacer' | 'En progreso' | 'Revision' | 'Completado';
  observations: string;
  dayKey: string;   // 'YYYY-MM-DD'
  hourSlot: number; // 8..17
}

interface WeekNote {
  id: string;
  text: string;
  color: string;
}

/* ─── Constants ─── */
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8..17
const SLOT_H = 56; // px height per slot

const PRIO_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  'Alta':    { bg: 'bg-red-50', border: 'border-l-red-500', text: 'text-red-700', dot: 'bg-red-500' },
  'Media':   { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700', dot: 'bg-amber-500' },
  'Baja':    { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Crítica': { bg: 'bg-purple-50', border: 'border-l-purple-500', text: 'text-purple-700', dot: 'bg-purple-500' },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  'Por hacer': <Clock className="w-3 h-3 text-slate-400" />,
  'En progreso': <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />,
  'Revision': <Flag className="w-3 h-3 text-amber-500" />,
  'Completado': <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
};

const NOTE_COLORS = ['#fef3c7', '#dbeafe', '#fce7f3', '#d1fae5', '#ede9fe', '#fef9c3'];

/* ─── Helpers ─── */
function getWeekDates(baseDate: Date): Date[] {
  const d = new Date(baseDate);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday offset
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}

function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ═══════════════════════════════════════════
   WEEKLY AGENDA SCREEN
   ═══════════════════════════════════════════ */
export default function WeeklyAgendaScreen() {
  const { projects, teamUsers, tasks: ctxTasks, saveTask, authUser } = useApp();
  const [baseDate, setBaseDate] = useState(new Date());
  const [agendaTasks, setAgendaTasks] = useState<AgendaTask[]>([]);
  const [weekNotes, setWeekNotes] = useState<WeekNote[]>([]);
  const [editingTask, setEditingTask] = useState<AgendaTask | null>(null);
  const [creating, setCreating] = useState<{ dayKey: string; hour: number } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterProject, setFilterProject] = useState<string>('all');
  const printRef = useRef<HTMLDivElement>(null);

  // Form state
  const [form, setForm] = useState({
    title: '', projectId: '', assigneeId: '', priority: 'Media' as AgendaTask['priority'],
    status: 'Por hacer' as AgendaTask['status'], observations: '',
  });

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  const weekLabel = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${start.toLocaleDateString('es-CO', opts)} — ${end.toLocaleDateString('es-CO', opts)}`;
  }, [weekDates]);

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach(p => { m[p.id] = p.data.name; });
    return m;
  }, [projects]);

  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    teamUsers.forEach(u => { m[u.id] = u.data?.name || 'Sin nombre'; });
    if (authUser?.uid) m[authUser.uid] = authUser.displayName || authUser.email || 'Yo';
    return m;
  }, [teamUsers, authUser]);

  /* ─── Navigation ─── */
  const prevWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d); };
  const nextWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d); };
  const goToday = () => setBaseDate(new Date());

  /* ─── CRUD ─── */
  const openCreate = (dayKey: string, hour: number) => {
    setCreating({ dayKey, hour });
    setEditingTask(null);
    setForm({ title: '', projectId: filterProject !== 'all' ? filterProject : '', assigneeId: '', priority: 'Media', status: 'Por hacer', observations: '' });
    setShowForm(true);
  };

  const openEdit = (task: AgendaTask) => {
    setEditingTask(task);
    setCreating(null);
    setForm({ title: task.title, projectId: task.projectId, assigneeId: task.assigneeId, priority: task.priority, status: task.status, observations: task.observations });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    if (editingTask) {
      setAgendaTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...form } : t));
    } else if (creating) {
      const newTask: AgendaTask = {
        id: uid(), ...form, dayKey: creating.dayKey, hourSlot: creating.hour,
      };
      setAgendaTasks(prev => [...prev, newTask]);
    }
    setShowForm(false);
    setEditingTask(null);
    setCreating(null);
  };

  const handleDelete = (id: string) => {
    setAgendaTasks(prev => prev.filter(t => t.id !== id));
  };

  const addNote = () => {
    setWeekNotes(prev => [...prev, { id: uid(), text: '', color: NOTE_COLORS[prev.length % NOTE_COLORS.length] }]);
  };

  const updateNote = (id: string, text: string) => {
    setWeekNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  };

  const deleteNote = (id: string) => {
    setWeekNotes(prev => prev.filter(n => n.id !== id));
  };

  /* ─── Filtered tasks ─── */
  const getTasksForSlot = useCallback((dayKey: string, hour: number) => {
    return agendaTasks.filter(t => t.dayKey === dayKey && t.hourSlot === hour &&
      (filterProject === 'all' || t.projectId === filterProject));
  }, [agendaTasks, filterProject]);

  /* ─── Print ─── */
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Agenda Semanal — Archii</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'DM Sans', system-ui, sans-serif; background: #fff; color: #1a1a1a; padding: 20px; }
        .agenda-grid { display: grid; grid-template-columns: 54px repeat(7, 1fr); gap: 0; border: 1.5px solid #d1d5db; border-radius: 10px; overflow: hidden; }
        .col-header { background: #f9fafb; border-bottom: 1.5px solid #d1d5db; border-right: 1px solid #e5e7eb; padding: 8px 4px; text-align: center; font-size: 11px; }
        .col-header .day-name { font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #374151; }
        .col-header .day-date { font-size: 10px; color: #6b7280; margin-top: 2px; }
        .time-label { background: #f9fafb; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 4px 6px; text-align: right; font-size: 10px; color: #6b7280; display: flex; align-items: flex-start; justify-content: flex-end; }
        .slot { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 2px 3px; min-height: 44px; }
        .task-card { border-left: 3px solid; border-radius: 4px; padding: 3px 6px; margin-bottom: 2px; font-size: 9px; line-height: 1.3; }
        .task-card .task-title { font-weight: 600; }
        .task-card .task-meta { color: #6b7280; }
        .prio-Alta { background: #fef2f2; border-color: #ef4444; }
        .prio-Media { background: #fffbeb; border-color: #f59e0b; }
        .prio-Baja { background: #ecfdf5; border-color: #10b981; }
        .prio-Crítica { background: #faf5ff; border-color: #a855f7; }
        .notes-section { margin-top: 16px; border: 1.5px solid #d1d5db; border-radius: 10px; padding: 12px; }
        .notes-section h3 { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
        .note-block { background: #fef9c3; border-radius: 6px; padding: 8px; margin-bottom: 6px; font-size: 11px; white-space: pre-wrap; }
        .agenda-title { text-align: center; font-size: 18px; font-weight: 700; margin-bottom: 4px; }
        .agenda-subtitle { text-align: center; font-size: 12px; color: #6b7280; margin-bottom: 16px; }
        @media print { body { padding: 10px; } .no-print { display: none !important; } }
      </style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  /* ─── Today detection ─── */
  const todayKey = dateKey(new Date());

  return (
    <div className="h-full flex flex-col" ref={printRef}>
      {/* ─── Header Toolbar ─── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 md:px-6 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <CalendarDays className="w-5 h-5 text-[var(--primary)]" />
        <h2 className="text-sm font-semibold mr-2 hidden sm:block">Agenda Semanal</h2>

        {/* Week nav */}
        <button onClick={prevWeek} className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" aria-label="Semana anterior">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-medium min-w-[180px] text-center">{weekLabel}</span>
        <button onClick={nextWeek} className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" aria-label="Semana siguiente">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={goToday} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 active:scale-95 transition-transform">
          Hoy
        </button>

        <div className="flex-1" />

        {/* Project filter */}
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="text-xs rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 py-1.5 max-w-[160px] truncate">
          <option value="all">Todos los proyectos</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
        </select>

        {/* Print */}
        <button onClick={handlePrint}
          className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform no-print"
          aria-label="Imprimir agenda">
          <Printer className="w-4 h-4" />
        </button>
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-auto p-2 md:p-4">
        <div className="flex gap-3 min-w-max">

          {/* ─── Agenda Grid ─── */}
          <div className="flex-1 agenda-grid-container">
            <div
              className="agenda-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: `54px repeat(7, minmax(130px, 1fr))`,
                border: '1.5px solid #d1d5db',
                borderRadius: '10px',
                overflow: 'hidden',
                background: '#ffffff',
              }}
            >
              {/* ─── Column Headers ─── */}
              <div className="col-header" style={{ background: '#f9fafb', borderBottom: '1.5px solid #d1d5db', borderRight: '1px solid #e5e7eb' }} />
              {weekDates.map((d, i) => {
                const dk = dateKey(d);
                const isToday = dk === todayKey;
                return (
                  <div key={dk} className="col-header" style={{
                    background: isToday ? 'var(--primary)' : '#f9fafb',
                    borderBottom: '1.5px solid #d1d5db',
                    borderRight: i < 6 ? '1px solid #e5e7eb' : 'none',
                    color: isToday ? '#fff' : undefined,
                    padding: '8px 4px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {DAY_NAMES[i]}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: 2, opacity: isToday ? 0.9 : 0.6 }}>
                      {fmtDay(d)}
                    </div>
                  </div>
                );
              })}

              {/* ─── Time Rows ─── */}
              {HOURS.map(hour => (
                <React.Fragment key={hour}>
                  {/* Time label */}
                  <div style={{
                    background: '#f9fafb',
                    borderRight: '1px solid #e5e7eb',
                    borderBottom: '1px solid #e5e7eb',
                    padding: '4px 6px',
                    textAlign: 'right',
                    fontSize: '10px',
                    color: '#6b7280',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    height: `${SLOT_H}px`,
                  }}>
                    {hour > 12 ? `${hour - 12}:00 pm` : `${hour}:00 am`}
                  </div>

                  {/* Day cells */}
                  {weekDates.map((d, di) => {
                    const dk = dateKey(d);
                    const isToday = dk === todayKey;
                    const slotTasks = getTasksForSlot(dk, hour);
                    return (
                      <div key={dk} style={{
                        borderRight: di < 6 ? '1px solid #e5e7eb' : 'none',
                        borderBottom: '1px solid #e5e7eb',
                        padding: '2px 3px',
                        minHeight: `${SLOT_H}px`,
                        background: isToday ? 'rgba(var(--primary), 0.02)' : '#ffffff',
                        position: 'relative' as const,
                        cursor: 'pointer',
                      }}
                        className="group/slot"
                        onClick={() => openCreate(dk, hour)}
                      >
                        {/* Existing tasks */}
                        {slotTasks.map(t => {
                          const pc = PRIO_COLORS[t.priority] || PRIO_COLORS['Media'];
                          return (
                            <div
                              key={t.id}
                              className={`task-card ${pc.bg} ${pc.border} no-print-hover`}
                              style={{
                                borderLeftWidth: '3px',
                                borderLeftStyle: 'solid',
                                borderRadius: '4px',
                                padding: '3px 6px',
                                marginBottom: '2px',
                                fontSize: '10px',
                                lineHeight: 1.3,
                                cursor: 'pointer',
                                position: 'relative' as const,
                              }}
                              onClick={e => { e.stopPropagation(); openEdit(t); }}
                            >
                              <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${pc.dot} flex-shrink-0`} />
                                <span style={{ fontWeight: 600 }} className="truncate">{t.title}</span>
                              </div>
                              {t.projectId && (
                                <div className="flex items-center gap-1 mt-0.5" style={{ color: '#6b7280', fontSize: '9px' }}>
                                  <FolderOpen className="w-2.5 h-2.5" />
                                  <span className="truncate">{projectMap[t.projectId] || '—'}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 mt-0.5" style={{ color: '#6b7280', fontSize: '9px' }}>
                                {STATUS_ICON[t.status]}
                                <span className="truncate">{userMap[t.assigneeId] || ''}</span>
                              </div>
                              {/* Delete on hover */}
                              <button
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover/task:opacity-100 transition-opacity"
                                style={{ fontSize: '8px' }}
                                onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                                aria-label="Eliminar tarea"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          );
                        })}

                        {/* + button on hover */}
                        {slotTasks.length === 0 && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-60 transition-opacity pointer-events-none no-print">
                            <Plus className="w-4 h-4 text-[var(--muted-foreground)]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* ─── Notes Panel ─── */}
          <div className="w-52 flex-shrink-0 flex flex-col gap-2 no-print" style={{ minWidth: '200px' }}>
            <div className="flex items-center gap-2 px-2">
              <StickyNote className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold">Notas de la semana</span>
              <div className="flex-1" />
              <button onClick={addNote} className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" aria-label="Agregar nota">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {weekNotes.map(note => (
              <div key={note.id} style={{ background: note.color }} className="rounded-lg p-2.5 relative group/note">
                <textarea
                  value={note.text}
                  onChange={e => updateNote(note.id, e.target.value)}
                  placeholder="Escribe una nota..."
                  className="w-full bg-transparent text-xs resize-none outline-none placeholder:text-black/30 min-h-[60px]"
                  rows={3}
                />
                <button
                  onClick={() => deleteNote(note.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded bg-black/10 text-black/50 flex items-center justify-center opacity-0 group-hover/note:opacity-100 transition-opacity hover:bg-red-200"
                  aria-label="Eliminar nota"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}

            {weekNotes.length === 0 && (
              <div className="text-center py-6 px-2">
                <StickyNote className="w-8 h-8 text-amber-300 mx-auto mb-2" />
                <p className="text-[10px] text-[var(--muted-foreground)]">Agrega notas, recordatorios o ideas para la semana</p>
              </div>
            )}

            {/* Legend */}
            <div className="mt-auto border-t border-[var(--border)] pt-3 px-1">
              <p className="text-[10px] font-semibold mb-2 text-[var(--muted-foreground)] uppercase tracking-wider">Prioridades</p>
              {Object.entries(PRIO_COLORS).map(([key, pc]) => (
                <div key={key} className="flex items-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${pc.dot}`} />
                  <span className="text-[10px]">{key}</span>
                </div>
              ))}
              <p className="text-[10px] font-semibold mt-3 mb-2 text-[var(--muted-foreground)] uppercase tracking-wider">Estados</p>
              {['Por hacer', 'En progreso', 'Revision', 'Completado'].map(s => (
                <div key={s} className="flex items-center gap-2 mb-1">
                  {STATUS_ICON[s]}
                  <span className="text-[10px]">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Task Creation / Edit Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 no-print" onClick={() => setShowForm(false)}>
          <div
            className="bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-2xl w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
              <div className="w-9 h-9 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                <Edit3 className="w-4 h-4 text-[var(--primary)]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{editingTask ? 'Editar actividad' : 'Nueva actividad'}</h3>
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  {creating ? `${DAY_FULL[weekDates.findIndex(d => dateKey(d) === creating.dayKey)]} · ${creating.hour > 12 ? creating.hour - 12 : creating.hour}:00 ${creating.hour >= 12 ? 'pm' : 'am'}` : ''}
                </p>
              </div>
              <div className="flex-1" />
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg hover:bg-[var(--af-bg3)] flex items-center justify-center" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                  <MessageSquare className="w-3 h-3" /> Título
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Nombre de la actividad"
                  className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  autoFocus
                />
              </div>

              {/* Project */}
              <div>
                <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                  <FolderOpen className="w-3 h-3" /> Proyecto
                </label>
                <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none">
                  <option value="">Sin proyecto</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
                </select>
              </div>

              {/* Assignee */}
              <div>
                <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                  <User className="w-3 h-3" /> Responsable
                </label>
                <select value={form.assigneeId} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none">
                  <option value="">Sin asignar</option>
                  {teamUsers.map(u => <option key={u.id} value={u.id}>{u.data?.name || 'Usuario'}</option>)}
                  {authUser && <option value={authUser.uid}>{authUser.displayName || authUser.email || 'Yo'}</option>}
                </select>
              </div>

              {/* Priority + Status row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                    <Flag className="w-3 h-3" /> Prioridad
                  </label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as AgendaTask['priority'] }))}
                    className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none">
                    {['Alta', 'Media', 'Baja', 'Crítica'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                    <CheckCircle2 className="w-3 h-3" /> Estado
                  </label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AgendaTask['status'] }))}
                    className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none">
                    {['Por hacer', 'En progreso', 'Revision', 'Completado'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Observations */}
              <div>
                <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                  <MessageSquare className="w-3 h-3" /> Observaciones
                </label>
                <textarea
                  value={form.observations}
                  onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                  placeholder="Notas adicionales..."
                  className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]/30 resize-none"
                  rows={3}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border)]">
              {editingTask && (
                <button onClick={() => { handleDelete(editingTask.id); setShowForm(false); }}
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors mr-auto">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              )}
              <div className="flex-1" />
              <button onClick={() => setShowForm(false)}
                className="text-xs px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--af-bg3)] transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave}
                className="text-xs px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 active:scale-95 transition-all">
                {editingTask ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
