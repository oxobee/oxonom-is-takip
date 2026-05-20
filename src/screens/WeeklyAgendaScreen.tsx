'use client';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getFirebase } from '@/lib/firebase-service';
import { scrubUndefined } from '@/lib/helpers';
import {
  ChevronLeft, ChevronRight, Plus, Printer, CalendarDays,
  Trash2, Edit3, StickyNote, Clock, User,
  Flag, FolderOpen, MessageSquare, CheckCircle2, X,
  Link2, Search, Users, ListChecks, AlertTriangle
} from 'lucide-react';
import type { Task } from '@/lib/types';

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface WeekNote {
  id: string;
  text: string;
  color: string;
}

interface DragState {
  dayKey: string;
  startHour: number;
  currentHour: number;
  active: boolean;
}

interface ActivityForm {
  title: string;
  projectId: string;
  assigneeId: string;
  participantIds: string[];
  priority: string;
  status: string;
  observations: string;
  hours: number[];
  subtasks: { text: string; done: boolean }[];
}

type FormTab = 'new' | 'link';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const DAY_NAMES = ['Lun', 'Mar', 'Mi\u00e9', 'Jue', 'Vie', 'S\u00e1b', 'Dom'];
const DAY_FULL = ['Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado', 'Domingo'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8..17
const SLOT_H = 56; // px height per slot

const PRIO_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  'Alta':    { bg: 'bg-red-500/10 dark:bg-red-500/15', border: 'border-l-red-500', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  'Media':   { bg: 'bg-amber-500/10 dark:bg-amber-500/15', border: 'border-l-amber-500', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  'Baja':    { bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', border: 'border-l-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Cr\u00edtica': { bg: 'bg-purple-500/10 dark:bg-purple-500/15', border: 'border-l-purple-500', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  'Por hacer': <Clock className="w-3 h-3 text-slate-400" />,
  'En progreso': <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />,
  'Revision': <Flag className="w-3 h-3 text-amber-500" />,
  'Completado': <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
};

const NOTE_COLORS = [
  'var(--note-amber)', 'var(--note-blue)', 'var(--note-pink)',
  'var(--note-green)', 'var(--note-purple)', 'var(--note-yellow)',
];

const PRIORITIES = ['Alta', 'Media', 'Baja', 'Cr\u00edtica'];
const STATUSES = ['Por hacer', 'En progreso', 'Revision', 'Completado'];

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

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

function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatHour(h: number): string {
  if (h === 0 || h === 12) return h === 0 ? '12:00 am' : '12:00 pm';
  return h > 12 ? `${h - 12}:00 pm` : `${h}:00 am`;
}

function formatHourShort(h: number): string {
  if (h === 0 || h === 12) return h === 0 ? '12am' : '12pm';
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}

function formatHourRange(hours: number[]): string {
  if (!hours.length) return '';
  const min = Math.min(...hours);
  const max = Math.max(...hours);
  return `${formatHour(min)} - ${formatHour(max + 1)}`;
}

const EMPTY_FORM: ActivityForm = {
  title: '',
  projectId: '',
  assigneeId: '',
  participantIds: [],
  priority: 'Media',
  status: 'Por hacer',
  observations: '',
  hours: [],
  subtasks: [],
};

/* ═══════════════════════════════════════════════════════════════
   WEEKLY AGENDA SCREEN
   ═══════════════════════════════════════════════════════════════ */

export default function WeeklyAgendaScreen() {
  const { projects, teamUsers, tasks: ctxTasks, authUser, activeTenantId } = useApp();

  /* ─── State ─── */
  const [baseDate, setBaseDate] = useState(new Date());
  const [weekNotes, setWeekNotes] = useState<WeekNote[]>([]);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [formTab, setFormTab] = useState<FormTab>('new');
  const [formDayKey, setFormDayKey] = useState('');
  const [form, setForm] = useState<ActivityForm>({ ...EMPTY_FORM });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [linkTaskId, setLinkTaskId] = useState<string>('');
  const [linkSearch, setLinkSearch] = useState('');
  const [linkFilterProject, setLinkFilterProject] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mobileDayIdx, setMobileDayIdx] = useState(() => {
    const today = new Date().getDay();
    return today === 0 ? 6 : today - 1; // 0=Mon..6=Sun
  });
  const [isMobile, setIsMobile] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  /* ─── Derived data ─── */
  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  const weekLabel = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${start.toLocaleDateString('es-CO', opts)} \u2014 ${end.toLocaleDateString('es-CO', opts)}`;
  }, [weekDates]);

  const todayKey = dateKey(new Date());

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach(p => { m[p.id] = p.data.name; });
    return m;
  }, [projects]);

  const userMap = useMemo(() => {
    const m: Record<string, { name: string; photoUrl?: string }> = {};
    teamUsers.forEach(u => { m[u.id] = { name: u.data?.name || 'Sin nombre', photoUrl: u.data?.photoURL }; });
    if (authUser?.uid) m[authUser.uid] = { name: authUser.displayName || authUser.email || 'Yo', photoUrl: authUser.photoURL || undefined };
    return m;
  }, [teamUsers, authUser]);

  const allUserOptions = useMemo(() => {
    const opts: { id: string; name: string }[] = [];
    teamUsers.forEach(u => opts.push({ id: u.id, name: u.data?.name || 'Usuario' }));
    if (authUser?.uid && !opts.find(o => o.id === authUser.uid)) {
      opts.push({ id: authUser.uid, name: authUser.displayName || authUser.email || 'Yo' });
    }
    return opts;
  }, [teamUsers, authUser]);

  /* ─── Agenda tasks from Firestore ─── */
  const agendaTasks = useMemo(() =>
    (ctxTasks || []).filter(t => t.data.agendaMeta),
    [ctxTasks]
  );

  /* ─── Overlap layout algorithm ───
     For each day, compute which "column" each task occupies when tasks overlap.
     Tasks that don't overlap share the full width. Overlapping tasks split into columns.
     Returns a map: taskId -> { col, totalCols } where col is 0-based column index
     and totalCols is the total number of columns in that overlap group.
  */
  interface OverlapInfo { col: number; totalCols: number }
  const overlapLayout = useMemo(() => {
    const layout: Record<string, OverlapInfo> = {};

    // Group tasks by dayKey
    const tasksByDay: Record<string, Task[]> = {};
    agendaTasks.forEach(t => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      if (!tasksByDay[meta.dayKey]) tasksByDay[meta.dayKey] = [];
      tasksByDay[meta.dayKey].push(t);
    });

    // For each day, compute columns using greedy interval scheduling
    Object.entries(tasksByDay).forEach(([, dayTasks]) => {
      // Sort by start hour, then by duration (longer first for stability)
      const sorted = [...dayTasks].sort((a, b) => {
        const aStart = Math.min(...a.data.agendaMeta!.hourSlots);
        const bStart = Math.min(...b.data.agendaMeta!.hourSlots);
        if (aStart !== bStart) return aStart - bStart;
        const aDur = a.data.agendaMeta!.hourSlots.length;
        const bDur = b.data.agendaMeta!.hourSlots.length;
        return bDur - aDur;
      });

      // Assign columns greedily — track which column each task is in
      interface ColSlot { endHour: number; task: Task }
      const columns: ColSlot[] = [];

      // First pass: assign column indices
      const taskColumns: Record<string, number> = {};
      sorted.forEach(task => {
        const meta = task.data.agendaMeta!;
        const startH = Math.min(...meta.hourSlots);
        const endH = Math.max(...meta.hourSlots) + 1; // exclusive end

        // Find first column where this task doesn't overlap
        let placed = false;
        for (let c = 0; c < columns.length; c++) {
          if (columns[c].endHour <= startH) {
            // No overlap — reuse this column
            columns[c] = { endHour: endH, task };
            taskColumns[task.id] = c;
            placed = true;
            break;
          }
        }
        if (!placed) {
          // Need a new column
          taskColumns[task.id] = columns.length;
          columns.push({ endHour: endH, task });
        }
      });

      // Second pass: for each task, compute how many tasks it actually overlaps with
      // Two tasks overlap if their hour slots intersect
      sorted.forEach(task => {
        const meta = task.data.agendaMeta!;
        const taskStart = Math.min(...meta.hourSlots);
        const taskEnd = Math.max(...meta.hourSlots) + 1;
        const myCol = taskColumns[task.id];

        // Find the max concurrent columns at any hour this task spans
        // by checking how many other tasks overlap at each hour
        const maxConcurrent = [myCol]; // always include own column
        sorted.forEach(other => {
          if (other.id === task.id) return;
          const oMeta = other.data.agendaMeta!;
          const oStart = Math.min(...oMeta.hourSlots);
          const oEnd = Math.max(...oMeta.hourSlots) + 1;
          // Check if they overlap
          if (oStart < taskEnd && oStart >= taskStart || oEnd > taskStart && oEnd <= taskEnd || oStart <= taskStart && oEnd >= taskEnd) {
            maxConcurrent.push(taskColumns[other.id]);
          }
        });

        // totalCols = number of unique columns that overlap with this task
        const uniqueCols = new Set(maxConcurrent);
        layout[task.id] = { col: myCol, totalCols: uniqueCols.size };
      });
    });

    return layout;
  }, [agendaTasks]);

  /* Group tasks by "dayKey:firstHour" for rendering tall blocks */
  const tasksByDayAndStartHour = useMemo(() => {
    const map: Record<string, Task[]> = {};
    agendaTasks.forEach(t => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      const firstHour = Math.min(...meta.hourSlots);
      const key = `${meta.dayKey}:${firstHour}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [agendaTasks]);

  /* For a given dayKey, compute which hours are the START of a task block */
  const taskStartHoursByDay = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    agendaTasks.forEach(t => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      if (!map[meta.dayKey]) map[meta.dayKey] = new Set();
      map[meta.dayKey].add(Math.min(...meta.hourSlots));
    });
    return map;
  }, [agendaTasks]);

  /* ─── Responsive detection ─── */
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* ─── Navigation ─── */
  const prevWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d); };
  const nextWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d); };
  const goToday = () => { setBaseDate(new Date()); const today = new Date().getDay(); setMobileDayIdx(today === 0 ? 6 : today - 1); };

  /* ─── Drag selection ─── */
  const handleCellMouseDown = (dayKey: string, hour: number) => {
    // Always allow drag to start — overlapping activities are supported
    setDrag({ dayKey, startHour: hour, currentHour: hour, active: true });
  };

  const handleCellMouseEnter = (dayKey: string, hour: number) => {
    if (!drag || !drag.active || drag.dayKey !== dayKey) return;
    setDrag(prev => prev ? { ...prev, currentHour: hour } : null);
  };

  const handleCellMouseUp = () => {
    if (!drag || !drag.active) return;
    const minH = Math.min(drag.startHour, drag.currentHour);
    const maxH = Math.max(drag.startHour, drag.currentHour);
    const selectedHours = HOURS.filter(h => h >= minH && h <= maxH);
    // Allow all selected hours — overlapping activities are supported
    if (selectedHours.length > 0) {
      openCreateForm(drag.dayKey, selectedHours);
    }
    setDrag(null);
  };

  const handleCellClick = (dayKey: string, hour: number) => {
    // Mobile: simple tap opens form with single hour — always allow
    openCreateForm(dayKey, [hour]);
  };

  /* ─── Form management ─── */
  const openCreateForm = (dayKey: string, hours: number[]) => {
    setEditingTask(null);
    setFormTab('new');
    setFormDayKey(dayKey);
    setForm({
      ...EMPTY_FORM,
      hours,
      projectId: filterProject !== 'all' ? filterProject : '',
    });
    setLinkTaskId('');
    setLinkSearch('');
    setLinkFilterProject('');
    setShowForm(true);
  };

  const openEditForm = (task: Task) => {
    const meta = task.data.agendaMeta;
    setEditingTask(task);
    setFormTab('new'); // edit always uses new tab
    setFormDayKey(meta?.dayKey || '');
    setForm({
      title: task.data.title || '',
      projectId: task.data.projectId || '',
      assigneeId: task.data.assigneeId || '',
      participantIds: meta?.participantIds || [],
      priority: task.data.priority || 'Media',
      status: task.data.status || 'Por hacer',
      observations: task.data.description || '',
      hours: meta?.hourSlots || [],
      subtasks: task.data.subtasks || [],
    });
    setLinkTaskId('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTask(null);
    setLinkTaskId('');
    setSaving(false);
  };

  /* ─── Hour slot management in form ─── */
  const addHourToForm = (h: number) => {
    setForm(f => {
      if (f.hours.includes(h)) return f;
      return { ...f, hours: [...f.hours, h].sort((a, b) => a - b) };
    });
  };

  const removeHourFromForm = (h: number) => {
    setForm(f => ({ ...f, hours: f.hours.filter(x => x !== h) }));
  };

  /* ─── Subtask management ─── */
  const addSubtask = () => {
    setForm(f => ({ ...f, subtasks: [...f.subtasks, { text: '', done: false }] }));
  };

  const updateSubtask = (idx: number, field: 'text' | 'done', value: string | boolean) => {
    setForm(f => ({
      ...f,
      subtasks: f.subtasks.map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  };

  const removeSubtask = (idx: number) => {
    setForm(f => ({ ...f, subtasks: f.subtasks.filter((_, i) => i !== idx) }));
  };

  /* ─── Firestore operations ─── */
  const handleSaveNew = async () => {
    if (!form.title.trim() || !authUser || !activeTenantId || !form.hours.length) return;
    setSaving(true);
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const cleanedSubtasks = form.subtasks
        .filter(s => s.text.trim())
        .map(s => ({ text: s.text.trim(), done: Boolean(s.done) }));
      await db.collection('tasks').add(scrubUndefined({
        title: form.title.trim(),
        description: form.observations || '',
        projectId: form.projectId || '',
        assigneeId: form.assigneeId || '',
        assigneeIds: [form.assigneeId, ...form.participantIds].filter(Boolean),
        priority: form.priority,
        status: form.status,
        dueDate: formDayKey,
        subtasks: cleanedSubtasks.length > 0 ? cleanedSubtasks : undefined,
        tags: ['Agenda'],
        tenantId: activeTenantId,
        agendaMeta: {
          dayKey: formDayKey,
          hourSlots: form.hours,
          participantIds: form.participantIds,
          isAgendaItem: true,
        },
        createdAt: ts,
        createdBy: authUser.uid,
        updatedAt: ts,
        updatedBy: authUser.uid,
      }));
      closeForm();
    } catch (err) {
      console.error('[Archii Agenda] Error creating task:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleLinkExisting = async () => {
    if (!linkTaskId || !authUser || !form.hours.length) return;
    setSaving(true);
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const existingTask = ctxTasks.find(t => t.id === linkTaskId);
      const existingTags = existingTask?.data.tags || [];
      await db.collection('tasks').doc(linkTaskId).update(scrubUndefined({
        agendaMeta: {
          dayKey: formDayKey,
          hourSlots: form.hours,
          participantIds: form.participantIds,
          isAgendaItem: false,
        },
        tags: [...new Set([...existingTags, 'Agenda'])],
        updatedAt: ts,
        updatedBy: authUser.uid,
      }));
      closeForm();
    } catch (err) {
      console.error('[Archii Agenda] Error linking task:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTask = async () => {
    if (!editingTask || !form.title.trim() || !authUser || !form.hours.length) return;
    setSaving(true);
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const cleanedSubtasks = form.subtasks
        .filter(s => s.text.trim())
        .map(s => ({ text: s.text.trim(), done: Boolean(s.done) }));
      await db.collection('tasks').doc(editingTask.id).update(scrubUndefined({
        title: form.title.trim(),
        description: form.observations || '',
        projectId: form.projectId || '',
        assigneeId: form.assigneeId || '',
        assigneeIds: [form.assigneeId, ...form.participantIds].filter(Boolean),
        priority: form.priority,
        status: form.status,
        dueDate: formDayKey,
        subtasks: cleanedSubtasks.length > 0 ? cleanedSubtasks : undefined,
        agendaMeta: {
          dayKey: formDayKey,
          hourSlots: form.hours,
          participantIds: form.participantIds,
          isAgendaItem: editingTask.data.agendaMeta?.isAgendaItem ?? true,
        },
        updatedAt: ts,
        updatedBy: authUser.uid,
      }));
      closeForm();
    } catch (err) {
      console.error('[Archii Agenda] Error updating task:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (task: Task) => {
    if (!authUser) return;
    const meta = task.data.agendaMeta;
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      if (meta?.isAgendaItem) {
        // Delete the entire task
        await db.collection('tasks').doc(task.id).delete();
      } else {
        // Only remove agendaMeta, keep the task
        const existingTags = (task.data.tags || []).filter(t => t !== 'Agenda');
        await db.collection('tasks').doc(task.id).update(scrubUndefined({
          agendaMeta: getFirebase().firestore.FieldValue.delete(),
          tags: existingTags.length > 0 ? existingTags : undefined,
          updatedAt: ts,
          updatedBy: authUser.uid,
        }));
      }
      setConfirmDelete(null);
      closeForm();
    } catch (err) {
      console.error('[Archii Agenda] Error deleting:', err);
    }
  };

  /* ─── Notes ─── */
  const addNote = () => {
    setWeekNotes(prev => [...prev, { id: uid(), text: '', color: NOTE_COLORS[prev.length % NOTE_COLORS.length] }]);
  };
  const updateNote = (id: string, text: string) => {
    setWeekNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  };
  const deleteNote = (id: string) => {
    setWeekNotes(prev => prev.filter(n => n.id !== id));
  };

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
        .slot { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 2px 3px; min-height: 44px; position: relative; }
        .task-card { border-left: 3px solid; border-radius: 4px; padding: 3px 6px; margin-bottom: 2px; font-size: 9px; line-height: 1.3; }
        .task-card .task-title { font-weight: 600; }
        .task-card .task-meta { color: #6b7280; }
        .prio-Alta { background: #fef2f2; border-color: #ef4444; }
        .prio-Media { background: #fffbeb; border-color: #f59e0b; }
        .prio-Baja { background: #ecfdf5; border-color: #10b981; }
        .prio-Cr\u00edtica { background: #faf5ff; border-color: #a855f7; }
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

  /* ─── Global mouse up listener ─── */
  useEffect(() => {
    const handler = () => {
      if (drag?.active) {
        handleCellMouseUp();
      }
    };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  });

  /* ─── Compute drag-selected hours ─── */
  const dragSelectedHours = useMemo(() => {
    if (!drag?.active) return new Set<string>();
    const minH = Math.min(drag.startHour, drag.currentHour);
    const maxH = Math.max(drag.startHour, drag.currentHour);
    const s = new Set<string>();
    for (let h = minH; h <= maxH; h++) {
      s.add(`${drag.dayKey}:${h}`);
    }
    return s;
  }, [drag]);

  /* ─── Linkable tasks (existing tasks without agendaMeta) ─── */
  const linkableTasks = useMemo(() => {
    return (ctxTasks || [])
      .filter(t => !t.data.agendaMeta)
      .filter(t => !linkFilterProject || t.data.projectId === linkFilterProject)
      .filter(t => {
        if (!linkSearch) return true;
        const q = linkSearch.toLowerCase();
        return (
          (t.data.title || '').toLowerCase().includes(q) ||
          (projectMap[t.data.projectId] || '').toLowerCase().includes(q)
        );
      });
  }, [ctxTasks, linkFilterProject, linkSearch, projectMap]);

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="h-full flex flex-col" ref={printRef}>
      {/* ─── Header Toolbar ─── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-3 md:px-6 py-2 md:py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <CalendarDays className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
        <h2 className="text-sm font-semibold mr-2 hidden sm:block">Agenda Semanal</h2>

        {/* Week nav */}
        <button onClick={prevWeek} className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" aria-label="Semana anterior">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[10px] sm:text-xs font-medium min-w-[100px] sm:min-w-[180px] text-center">{weekLabel}</span>
        <button onClick={nextWeek} className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" aria-label="Semana siguiente">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={goToday} className="text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 active:scale-95 transition-transform">
          Hoy
        </button>

        <div className="flex-1" />

        {/* Project filter */}
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="text-[10px] sm:text-xs rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 py-1.5 max-w-[120px] sm:max-w-[160px] truncate no-print">
          <option value="all">Todos los proyectos</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
        </select>

        {/* Print — hidden on mobile */}
        <button onClick={handlePrint}
          className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] items-center justify-center hover:scale-105 active:scale-95 transition-transform no-print hidden sm:flex"
          aria-label="Imprimir agenda">
          <Printer className="w-4 h-4" />
        </button>
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-auto p-2 md:p-4">
        <div className="flex flex-col lg:flex-row gap-3">

          {/* ─── Mobile Day Selector ─── */}
          {isMobile && (
            <div className="flex items-center gap-1 mb-2 overflow-x-auto no-print pb-1" style={{ scrollbarWidth: 'none' }}>
              {weekDates.map((d, i) => {
                const dk = dateKey(d);
                const isToday = dk === todayKey;
                const isActive = i === mobileDayIdx;
                const dayTasks = agendaTasks.filter(t => t.data.agendaMeta?.dayKey === dk);
                return (
                  <button
                    key={dk}
                    onClick={() => setMobileDayIdx(i)}
                    className="flex flex-col items-center px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
                    style={{
                      background: isActive ? 'var(--primary)' : isToday ? 'var(--accent)' : 'var(--af-bg3)',
                      color: isActive ? 'var(--primary-foreground)' : 'var(--foreground)',
                      border: isActive ? 'none' : '1px solid var(--border)',
                      minWidth: '48px',
                    }}
                  >
                    <span className="text-[9px] font-semibold uppercase">{DAY_NAMES[i]}</span>
                    <span className="text-sm font-bold">{d.getDate()}</span>
                    {dayTasks.length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full mt-0.5" style={{ background: isActive ? 'var(--primary-foreground)' : 'var(--primary)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ─── Agenda Grid ─── */}
          <div className="flex-1 agenda-grid-container" style={{ minWidth: 0 }}>
            <div
              className="agenda-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? '48px 1fr'
                  : '54px repeat(7, minmax(130px, 1fr))',
                border: '1.5px solid var(--border)',
                borderRadius: '10px',
                overflow: 'hidden',
                background: 'var(--card)',
              }}
            >
              {/* ─── Column Headers ─── */}
              {!isMobile && <div style={{ background: 'var(--af-bg3)', borderBottom: '1.5px solid var(--border)', borderRight: '1px solid var(--border)' }} />}
              {isMobile && (() => {
                const d = weekDates[mobileDayIdx];
                const dk = dateKey(d);
                const isToday = dk === todayKey;
                return (
                  <div key={dk} style={{
                    background: isToday ? 'var(--primary)' : 'var(--af-bg3)',
                    borderBottom: '1.5px solid var(--border)',
                    color: isToday ? 'var(--primary-foreground)' : 'var(--foreground)',
                    padding: '8px 4px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {DAY_FULL[mobileDayIdx]}
                    </div>
                    <div style={{ fontSize: '11px', marginTop: 2, color: isToday ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                      {fmtDay(d)}
                    </div>
                  </div>
                );
              })()}
              {!isMobile && weekDates.map((d, i) => {
                const dk = dateKey(d);
                const isToday = dk === todayKey;
                return (
                  <div key={dk} style={{
                    background: isToday ? 'var(--primary)' : 'var(--af-bg3)',
                    borderBottom: '1.5px solid var(--border)',
                    borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                    color: isToday ? 'var(--primary-foreground)' : 'var(--foreground)',
                    padding: '8px 4px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {DAY_NAMES[i]}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: 2, color: isToday ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
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
                    background: 'var(--af-bg3)',
                    borderRight: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    padding: isMobile ? '4px 4px' : '4px 6px',
                    textAlign: 'right',
                    fontSize: isMobile ? '9px' : '10px',
                    color: 'var(--muted-foreground)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    height: `${SLOT_H}px`,
                  }}>
                    {isMobile ? formatHourShort(hour) : formatHour(hour)}
                  </div>

                  {/* Day cells — mobile: single day, desktop: all 7 */}
                  {(isMobile ? [weekDates[mobileDayIdx]] : weekDates).map((d, di) => {
                    const dk = dateKey(d);
                    const isToday = dk === todayKey;
                    const isDragSelected = dragSelectedHours.has(`${dk}:${hour}`);
                    const isTaskStart = taskStartHoursByDay[dk]?.has(hour);

                    // Get tasks that start at this hour on this day
                    const tasksStarting = isTaskStart ? (tasksByDayAndStartHour[`${dk}:${hour}`] || []) : [];

                    return (
                      <div
                        key={dk}
                        style={{
                          borderRight: !isMobile && di < 6 ? '1px solid var(--border)' : 'none',
                          borderBottom: '1px solid var(--border)',
                          minHeight: `${SLOT_H}px`,
                          height: `${SLOT_H}px`,
                          background: isDragSelected
                            ? 'var(--accent)'
                            : isToday
                              ? 'var(--accent)'
                              : 'var(--card)',
                          position: 'relative' as const,
                          cursor: 'pointer',
                          overflow: isTaskStart ? 'visible' as const : 'hidden' as const,
                        }}
                        className="group/slot"
                        onMouseDown={() => handleCellMouseDown(dk, hour)}
                        onMouseEnter={() => handleCellMouseEnter(dk, hour)}
                        onMouseUp={() => handleCellMouseUp()}
                        onClick={() => {
                          // Always allow click — overlapping activities supported
                          if (!drag?.active) {
                            handleCellClick(dk, hour);
                          }
                        }}
                      >
                        {/* Render tall activity blocks at their start hour, with overlap columns */}
                        {tasksStarting.map(task => {
                          const meta = task.data.agendaMeta;
                          if (!meta) return null;
                          const minH = Math.min(...meta.hourSlots);
                          const maxH = Math.max(...meta.hourSlots);
                          const spanCount = maxH - minH + 1;
                          const blockHeight = spanCount * SLOT_H;
                          const pc = PRIO_COLORS[task.data.priority] || PRIO_COLORS['Media'];
                          const doneSubtasks = (task.data.subtasks || []).filter(s => s.done).length;
                          const totalSubtasks = (task.data.subtasks || []).length;

                          // Overlap layout: compute left/width based on column assignment
                          const info = overlapLayout[task.id] || { col: 0, totalCols: 1 };
                          const GAP = 2; // px between columns
                          const cellPadding = 4; // total horizontal padding (2px each side)
                          const availWidth = `calc((100% - ${cellPadding}px - ${(info.totalCols - 1) * GAP}px) / ${info.totalCols})`;
                          const leftPos = `calc(2px + ${info.col} * (${availWidth} + ${GAP}px))`;

                          // When overlapping, show less detail to save space
                          const isNarrow = info.totalCols >= 3;
                          const isMedium = info.totalCols === 2;

                          return (
                            <div
                              key={task.id}
                              className={`${pc.bg} ${pc.border} group-hover/slot:opacity-70 hover:!opacity-100 no-print-hover transition-opacity`}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: leftPos,
                                width: availWidth,
                                height: `${blockHeight - 4}px`,
                                borderLeftWidth: '3px',
                                borderLeftStyle: 'solid',
                                borderRadius: '6px',
                                padding: isNarrow ? '2px 3px' : '4px 6px',
                                fontSize: isNarrow ? '8px' : '10px',
                                lineHeight: 1.3,
                                cursor: 'pointer',
                                zIndex: 10,
                                overflow: 'hidden',
                              }}
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); openEditForm(task); }}
                            >
                              {/* Title + priority dot */}
                              <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${pc.dot} flex-shrink-0`} />
                                <span style={{ fontWeight: 600, color: 'var(--foreground)' }} className="truncate text-[11px]">
                                  {task.data.title}
                                </span>
                              </div>

                              {/* Time range — hide on very narrow columns */}
                              {!isNarrow && (
                                <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '9px' }}>
                                  <Clock className="w-2.5 h-2.5" />
                                  <span>{formatHourRange(meta.hourSlots)}</span>
                                </div>
                              )}

                              {/* Project — hide on narrow/medium overlap */}
                              {!isNarrow && !isMedium && task.data.projectId && (
                                <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '9px' }}>
                                  <FolderOpen className="w-2.5 h-2.5" />
                                  <span className="truncate">{projectMap[task.data.projectId] || '\u2014'}</span>
                                </div>
                              )}

                              {/* Responsable + participants — hide on narrow */}
                              {!isNarrow && (
                                <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: '9px' }}>
                                  {STATUS_ICON[task.data.status]}
                                  <span className="truncate" style={{ color: 'var(--muted-foreground)' }}>
                                    {userMap[task.data.assigneeId]?.name || ''}
                                  </span>
                                  {!isMedium && meta.participantIds.length > 0 && (
                                    <span className="flex items-center gap-0.5 ml-1" style={{ color: 'var(--muted-foreground)' }}>
                                      <Users className="w-2.5 h-2.5" />
                                      {meta.participantIds.length}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Subtasks — hide on narrow/medium */}
                              {!isNarrow && !isMedium && totalSubtasks > 0 && (
                                <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '9px' }}>
                                  <ListChecks className="w-2.5 h-2.5" />
                                  <span>{doneSubtasks}/{totalSubtasks}</span>
                                </div>
                              )}

                              {/* Agenda badge — hide on narrow */}
                              {!isNarrow && meta.isAgendaItem && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold"
                                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                                  Agenda
                                </span>
                              )}

                              {/* Delete button — top-left of card, larger on mobile */}
                              <button
                                className={`absolute rounded flex items-center justify-center opacity-0 hover:!opacity-100 transition-opacity z-[15] ${isMobile ? 'top-0.5 left-0.5 w-7 h-7' : 'top-1 left-1 w-5 h-5'}`}
                                style={{ background: 'rgba(239,68,68,0.8)', color: '#fff', fontSize: isMobile ? '10px' : '8px' }}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); setConfirmDelete(task.id); }}
                                aria-label="Eliminar actividad"
                              >
                                <X className={isMobile ? 'w-4 h-4' : 'w-3 h-3'} />
                              </button>
                            </div>
                          );
                        })}

                        {/* + button to create new activity — larger on mobile for touch */}
                        <button
                          className={`absolute right-0.5 rounded-full flex items-center justify-center opacity-0 group-hover/slot:opacity-80 hover:!opacity-100 transition-opacity no-print z-[15] ${isMobile ? 'top-0.5 w-8 h-8' : 'top-0.5 w-5 h-5'}`}
                          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: isMobile ? '12px' : '10px' }}
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation();
                            handleCellClick(dk, hour);
                          }}
                          aria-label="Crear actividad"
                        >
                          <Plus className={isMobile ? 'w-4 h-4' : 'w-3 h-3'} />
                        </button>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* ─── Notes Panel — hidden on mobile ─── */}
          <div className="lg:w-52 flex-shrink-0 flex-col gap-2 no-print lg:min-w-[200px] hidden md:flex" style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2 px-2 flex-shrink-0 lg:flex-shrink">
              <StickyNote className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold whitespace-nowrap">Notas</span>
              <div className="flex-1 hidden lg:block" />
              <button onClick={addNote} className="w-6 h-6 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" aria-label="Agregar nota">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {weekNotes.map(note => (
              <div key={note.id} style={{ background: note.color }} className="rounded-lg p-2.5 relative group/note w-44 lg:w-auto flex-shrink-0 lg:flex-shrink">
                <textarea
                  value={note.text}
                  onChange={e => updateNote(note.id, e.target.value)}
                  placeholder="Escribe una nota..."
                  className="w-full bg-transparent text-xs resize-none outline-none placeholder:text-[var(--muted-foreground)] min-h-[60px]"
                  style={{ color: 'var(--foreground)' }}
                  rows={3}
                />
                <button
                  onClick={() => deleteNote(note.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded bg-black/10 dark:bg-white/10 text-[var(--muted-foreground)] flex items-center justify-center opacity-0 group-hover/note:opacity-100 transition-opacity hover:bg-red-200 dark:hover:bg-red-800"
                  aria-label="Eliminar nota"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}

            {weekNotes.length === 0 && (
              <div className="text-center py-4 px-2 w-44 lg:w-auto flex-shrink-0 lg:flex-shrink">
                <StickyNote className="w-6 h-6 text-amber-500/50 dark:text-amber-400/40 mx-auto mb-1" />
                <p className="text-[10px] text-[var(--muted-foreground)]">Sin notas esta semana</p>
              </div>
            )}

            {/* Legend - hidden on mobile, visible on desktop */}
            <div className="mt-auto border-t border-[var(--border)] pt-3 px-1 hidden lg:block">
              <p className="text-[10px] font-semibold mb-2 text-[var(--muted-foreground)] uppercase tracking-wider">Prioridades</p>
              {Object.entries(PRIO_COLORS).map(([key, pc]) => (
                <div key={key} className="flex items-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${pc.dot}`} />
                  <span className="text-[10px]">{key}</span>
                </div>
              ))}
              <p className="text-[10px] font-semibold mt-3 mb-2 text-[var(--muted-foreground)] uppercase tracking-wider">Estados</p>
              {STATUSES.map(s => (
                <div key={s} className="flex items-center gap-2 mb-1">
                  {STATUS_ICON[s]}
                  <span className="text-[10px]">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Confirm Delete Dialog ─── */}
      {confirmDelete && (() => {
        const taskToDelete = agendaTasks.find(t => t.id === confirmDelete);
        const meta = taskToDelete?.data.agendaMeta;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 no-print" onClick={() => setConfirmDelete(null)}>
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-2xl w-full max-w-sm p-5 af-modal-mobile" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Eliminar actividad</h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {meta?.isAgendaItem
                      ? 'Se eliminara la tarea completa del sistema.'
                      : 'Solo se quitara de la agenda. La tarea permanecera en Tareas.'}
                  </p>
                </div>
              </div>
              {taskToDelete && (
                <p className="text-xs mb-4 px-1" style={{ color: 'var(--foreground)' }}>
                  <strong>{taskToDelete.data.title}</strong>
                </p>
              )}
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)}
                  className="text-xs px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--af-bg3)] transition-colors">
                  Cancelar
                </button>
                <button onClick={() => taskToDelete && handleDelete(taskToDelete)}
                  className="text-xs px-4 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 active:scale-95 transition-all">
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Create / Edit / Link Modal ─── */}
      {showForm && (
        <div className={`fixed inset-0 z-50 flex no-print ${isMobile ? 'items-end' : 'items-center justify-center p-4'} bg-black/40`} onClick={closeForm}>
          <div
            className={`bg-[var(--card)] border border-[var(--border)] shadow-2xl w-full ${isMobile ? 'rounded-t-2xl border-b-0 max-h-[92vh] flex flex-col' : 'rounded-xl max-w-lg'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            {isMobile && (
              <div className="flex justify-center pt-2 pb-1 cursor-grab" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--muted-foreground)', opacity: 0.3 }} />
              </div>
            )}
            {/* Modal Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary)', opacity: 0.12 }}>
                {editingTask ? (
                  <Edit3 className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                ) : (
                  <Plus className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold">
                  {editingTask ? 'Editar actividad' : 'Nueva actividad'}
                </h3>
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  {formDayKey && (() => {
                    const dayIdx = weekDates.findIndex(d => dateKey(d) === formDayKey);
                    const dayName = dayIdx >= 0 ? DAY_FULL[dayIdx] : formDayKey;
                    const hours = form.hours;
                    if (hours.length === 1) {
                      return `${dayName} \u00b7 ${formatHour(hours[0])}`;
                    }
                    return `${dayName} \u00b7 ${formatHourRange(hours)}`;
                  })()}
                </p>
              </div>
              <div className="flex-1" />
              <button onClick={closeForm} className="w-8 h-8 rounded-lg hover:bg-[var(--af-bg3)] flex items-center justify-center" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs (only when creating new, not editing) */}
            {!editingTask && (
              <div className="flex border-b border-[var(--border)]">
                <button
                  onClick={() => setFormTab('new')}
                  className="flex-1 px-4 py-2.5 text-xs font-medium text-center transition-colors"
                  style={{
                    borderBottom: formTab === 'new' ? '2px solid var(--primary)' : '2px solid transparent',
                    color: formTab === 'new' ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5 inline mr-1.5" />
                  Nueva tarea
                </button>
                <button
                  onClick={() => setFormTab('link')}
                  className="flex-1 px-4 py-2.5 text-xs font-medium text-center transition-colors"
                  style={{
                    borderBottom: formTab === 'link' ? '2px solid var(--primary)' : '2px solid transparent',
                    color: formTab === 'link' ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  <Link2 className="w-3.5 h-3.5 inline mr-1.5" />
                  Vincular existente
                </button>
              </div>
            )}

            {/* Modal Body */}
            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">

              {/* ══════ TAB: Nueva tarea ══════ */}
              {(formTab === 'new' || editingTask) && (
                <>
                  {/* Title */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <MessageSquare className="w-3 h-3" /> Titulo *
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Nombre de la actividad"
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                      style={{ color: 'var(--foreground)' }}
                      autoFocus
                    />
                  </div>

                  {/* Project */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <FolderOpen className="w-3 h-3" /> Proyecto
                    </label>
                    <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none"
                      style={{ color: 'var(--foreground)' }}>
                      <option value="">Sin proyecto</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
                    </select>
                  </div>

                  {/* Responsable */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <User className="w-3 h-3" /> Responsable
                    </label>
                    <select value={form.assigneeId} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none"
                      style={{ color: 'var(--foreground)' }}>
                      <option value="">Sin asignar</option>
                      {allUserOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>

                  {/* Participantes */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Users className="w-3 h-3" /> Participantes
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--input)] min-h-[36px]">
                      {allUserOptions.map(u => {
                        const isSelected = form.participantIds.includes(u.id);
                        // Don't show the assignee as a separate participant option to avoid confusion
                        // but still allow selecting them
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setForm(f => ({
                                ...f,
                                participantIds: isSelected
                                  ? f.participantIds.filter(id => id !== u.id)
                                  : [...f.participantIds, u.id],
                              }));
                            }}
                            className="text-[10px] px-2 py-1 rounded-md transition-colors"
                            style={{
                              background: isSelected ? 'var(--primary)' : 'var(--af-bg3)',
                              color: isSelected ? 'var(--primary-foreground)' : 'var(--foreground)',
                              border: isSelected ? 'none' : '1px solid var(--border)',
                            }}
                          >
                            {u.name}
                          </button>
                        );
                      })}
                      {allUserOptions.length === 0 && (
                        <span className="text-[10px] text-[var(--muted-foreground)]">No hay miembros en el equipo</span>
                      )}
                    </div>
                  </div>

                  {/* Priority + Status row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                        <Flag className="w-3 h-3" /> Prioridad
                      </label>
                      <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                        className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none"
                        style={{ color: 'var(--foreground)' }}>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                        <CheckCircle2 className="w-3 h-3" /> Estado
                      </label>
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                        className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none"
                        style={{ color: 'var(--foreground)' }}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
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
                      style={{ color: 'var(--foreground)' }}
                      rows={2}
                    />
                  </div>

                  {/* Horas programadas */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3" /> Horas programadas
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {form.hours.sort((a, b) => a - b).map(h => (
                        <span key={h} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                          {formatHourShort(h)}
                          <button
                            type="button"
                            onClick={() => removeHourFromForm(h)}
                            className="hover:opacity-70 transition-opacity"
                            aria-label={`Quitar ${formatHourShort(h)}`}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                      {/* Add hour button */}
                      <div className="relative">
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) addHourToForm(Number(e.target.value));
                          }}
                          className="text-[10px] px-2 py-1 rounded-md border border-dashed border-[var(--border)] bg-[var(--af-bg3)] outline-none cursor-pointer"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          <option value="">+ Agregar hora</option>
                          {HOURS.filter(h => !form.hours.includes(h)).map(h => (
                            <option key={h} value={h}>{formatHourShort(h)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {form.hours.length === 0 && (
                      <p className="text-[10px] text-red-400 mt-1">Selecciona al menos una hora</p>
                    )}
                  </div>

                  {/* Subtareas */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <ListChecks className="w-3 h-3" /> Subtareas {form.subtasks.length > 0 ? `(${form.subtasks.filter(s => s.done).length}/${form.subtasks.length})` : ''}
                    </label>
                    <div className="space-y-2">
                      {form.subtasks.map((st, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={st.done}
                            onChange={e => updateSubtask(idx, 'done', e.target.checked)}
                            className="w-3.5 h-3.5 rounded flex-shrink-0 accent-[var(--af-accent)]"
                            style={{ accentColor: 'var(--af-accent)' }}
                          />
                          <input
                            type="text"
                            value={st.text}
                            onChange={e => updateSubtask(idx, 'text', e.target.value)}
                            placeholder={`Subtarea ${idx + 1}`}
                            className={`flex-1 text-[12px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--af-accent)]/50 ${st.done ? 'line-through' : ''}`}
                            style={{ color: st.done ? 'var(--muted-foreground)' : 'var(--foreground)' }}
                          />
                          <button
                            type="button"
                            className="text-[var(--muted-foreground)] hover:text-red-400 cursor-pointer bg-transparent border-none p-0 flex-shrink-0"
                            onClick={() => removeSubtask(idx)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:underline bg-transparent border-none p-0 font-medium"
                        style={{ color: 'var(--af-accent)' }}
                        onClick={addSubtask}
                      >
                        <Plus className="w-3 h-3" /> Agregar subtarea
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ══════ TAB: Vincular existente ══════ */}
              {formTab === 'link' && !editingTask && (
                <>
                  {/* Project filter */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <FolderOpen className="w-3 h-3" /> Filtrar por proyecto
                    </label>
                    <select value={linkFilterProject} onChange={e => setLinkFilterProject(e.target.value)}
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none"
                      style={{ color: 'var(--foreground)' }}>
                      <option value="">Todos los proyectos</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
                    </select>
                  </div>

                  {/* Search */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Search className="w-3 h-3" /> Buscar tarea
                    </label>
                    <input
                      type="text"
                      value={linkSearch}
                      onChange={e => setLinkSearch(e.target.value)}
                      placeholder="Buscar por titulo o proyecto..."
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                      style={{ color: 'var(--foreground)' }}
                    />
                  </div>

                  {/* Task list */}
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)]" style={{ background: 'var(--af-bg3)' }}>
                    {linkableTasks.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-[10px] text-[var(--muted-foreground)]">No hay tareas disponibles para vincular</p>
                      </div>
                    ) : (
                      linkableTasks.slice(0, 20).map(t => {
                        const isSelected = linkTaskId === t.id;
                        const pc = PRIO_COLORS[t.data.priority] || PRIO_COLORS['Media'];
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setLinkTaskId(isSelected ? '' : t.id);
                              if (!isSelected) {
                                setForm(f => ({
                                  ...f,
                                  title: t.data.title,
                                  projectId: t.data.projectId || '',
                                  assigneeId: t.data.assigneeId || '',
                                  priority: t.data.priority || 'Media',
                                  status: t.data.status || 'Por hacer',
                                  observations: t.data.description || '',
                                  subtasks: t.data.subtasks || [],
                                }));
                              }
                            }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-b border-[var(--border)] last:border-b-0"
                            style={{
                              background: isSelected ? 'var(--accent)' : 'transparent',
                            }}
                          >
                            <span className={`w-2 h-2 rounded-full ${pc.dot} flex-shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--foreground)' }}>{t.data.title}</p>
                              <p className="text-[9px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                                {projectMap[t.data.projectId] || 'Sin proyecto'} &middot; {userMap[t.data.assigneeId]?.name || 'Sin asignar'}
                              </p>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
                            )}
                          </button>
                        );
                      })
                    )}
                    {linkableTasks.length > 20 && (
                      <p className="text-[9px] text-center py-1" style={{ color: 'var(--muted-foreground)' }}>
                        Mostrando 20 de {linkableTasks.length} tareas
                      </p>
                    )}
                  </div>

                  {/* Selected task info */}
                  {linkTaskId && (() => {
                    const selTask = ctxTasks.find(t => t.id === linkTaskId);
                    if (!selTask) return null;
                    const pc = PRIO_COLORS[selTask.data.priority] || PRIO_COLORS['Media'];
                    return (
                      <div className={`rounded-lg p-3 ${pc.bg} border-l-4 ${pc.border}`}>
                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>{selTask.data.title}</p>
                        <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                          <span className="flex items-center gap-1"><FolderOpen className="w-2.5 h-2.5" />{projectMap[selTask.data.projectId] || 'Sin proyecto'}</span>
                          <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" />{userMap[selTask.data.assigneeId]?.name || 'Sin asignar'}</span>
                          <span className={pc.text}>{selTask.data.priority}</span>
                        </div>
                        {((selTask.data.subtasks || [])).length > 0 && (
                          <p className="text-[9px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                            Subtareas: {(selTask.data.subtasks || []).filter(s => s.done).length}/{(selTask.data.subtasks || []).length}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Participantes adicionales (link) */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Users className="w-3 h-3" /> Participantes adicionales
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--input)] min-h-[36px]">
                      {allUserOptions.map(u => {
                        const isSelected = form.participantIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setForm(f => ({
                                ...f,
                                participantIds: isSelected
                                  ? f.participantIds.filter(id => id !== u.id)
                                  : [...f.participantIds, u.id],
                              }));
                            }}
                            className="text-[10px] px-2 py-1 rounded-md transition-colors"
                            style={{
                              background: isSelected ? 'var(--primary)' : 'var(--af-bg3)',
                              color: isSelected ? 'var(--primary-foreground)' : 'var(--foreground)',
                              border: isSelected ? 'none' : '1px solid var(--border)',
                            }}
                          >
                            {u.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Horas programadas (link) */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3" /> Horas programadas
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {form.hours.sort((a, b) => a - b).map(h => (
                        <span key={h} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                          {formatHourShort(h)}
                          <button type="button" onClick={() => removeHourFromForm(h)} className="hover:opacity-70 transition-opacity">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                      <select
                        value=""
                        onChange={e => {
                          if (e.target.value) addHourToForm(Number(e.target.value));
                        }}
                        className="text-[10px] px-2 py-1 rounded-md border border-dashed border-[var(--border)] bg-[var(--af-bg3)] outline-none cursor-pointer"
                        style={{ color: 'var(--muted-foreground)' }}
                      >
                        <option value="">+ Agregar hora</option>
                        {HOURS.filter(h => !form.hours.includes(h)).map(h => (
                          <option key={h} value={h}>{formatHourShort(h)}</option>
                        ))}
                      </select>
                    </div>
                    {form.hours.length === 0 && (
                      <p className="text-[10px] text-red-400 mt-1">Selecciona al menos una hora</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border)]">
              {editingTask && (
                <button
                  onClick={() => setConfirmDelete(editingTask.id)}
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors mr-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              )}
              <div className="flex-1" />
              <button onClick={closeForm}
                className="text-xs px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--af-bg3)] transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (editingTask) {
                    handleUpdateTask();
                  } else if (formTab === 'new') {
                    handleSaveNew();
                  } else {
                    handleLinkExisting();
                  }
                }}
                disabled={saving || !form.title.trim() || form.hours.length === 0 || (formTab === 'link' && !linkTaskId)}
                className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {saving ? 'Guardando...' : editingTask ? 'Guardar' : formTab === 'new' ? 'Crear' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
