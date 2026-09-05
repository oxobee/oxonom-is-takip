'use client';
import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { useNotificationsContext } from '@/hooks/useNotifications';
import { avatarColor } from '@/lib/helpers';
import { useUIStore } from '@/stores/ui-store';
import { ChevronLeft, Bell, Plus, Menu, LayoutGrid, Building2, ChevronDown, Crown, Users, Shield, Settings } from 'lucide-react';
import ManageMembersModal from './ManageMembersModal';

export default function TopBar() {
  const {
    screen, navigateTo, setSidebarOpen, currentProject,
    modals, setForms, setEditingId, openModal, editingId, authUser, isAdmin,
    initials, pendingCount,
    projects, userName, companies, screenTitles,
    activeTenantName, activeTenantRole, activeTenantId, setShowTenantSelector, doLogout, isEmailAdmin,
    showToast,
  } = useApp();
  const { setShowNotifPanel, unreadCount, notifPermission, showNotifPanel } = useNotificationsContext();
  const settingsOpen = useUIStore(s => s.settingsOpen);
  const setSettingsOpen = useUIStore(s => s.setSettingsOpen);

  const [showTenantMenu, setShowTenantMenu] = React.useState(false);
  const [showManageMembers, setShowManageMembers] = React.useState(false);
  const [fixingRole, setFixingRole] = React.useState(false);
  const [tenantMenuPos, setTenantMenuPos] = React.useState<{ top: number; right: number } | null>(null);
  const tenantBtnRef = React.useRef<HTMLButtonElement>(null);

  const handleFixRole = async () => {
    setFixingRole(true);
    setShowTenantMenu(false);
    try {
      const token = authUser ? await authUser.getIdToken() : '';
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fix-my-role' }),
      });
      const data = await res.json();
      if (data.fixed?.length > 0 || data.addedToMembers?.length > 0) {
        showToast(`Rol ${data.fixed?.length || 0} alanda güncellendi`, 'success');
        // Reload page to pick up corrected role
        setTimeout(() => window.location.reload(), 1500);
      } else if (data.already?.length > 0) {
        showToast('Tüm alanlarda zaten Süper Yöneticisiniz', 'success');
      } else {
        showToast('Düzeltilecek alan bulunamadı', 'error');
        console.warn('[TopBar] fix-my-role full response:', JSON.stringify(data));
      }
    } catch (err) {
      console.error('[TopBar] fix-my-role error:', err);
      showToast('Rol güncellenirken hata oluştu', 'error');
    } finally {
      setFixingRole(false);
    }
  };

  // Local screen title overrides (dynamic titles like projectDetail)
  const localScreenTitles: Record<string, string> = {
    dashboard: 'Panel', projects: 'Projeler', tasks: 'Görevler', chat: 'Ekip Ayajları',
    budget: 'Bütçe & Harcamalar', files: 'Planlar ve Dosyalar', gallery: 'Fotoğraf Galerisi', inventory: 'Envanter & Stok',
    admin: 'Yönetim Paneli', superAdmin: 'Süper Yönetici', obra: 'Şantiye Takibi', suppliers: 'Tedarikçiler', team: 'Ekip Üyeleri',
    calendar: 'Takvim', portal: 'Müşteri Portalı', profile: 'Profilim', install: 'Uygulamayı Yükle',
    companies: 'Şirketler & Firmalar', projectDetail: currentProject?.data.name || 'Proje Detayı',
    rfis: 'Bilgi Talepleri (RFI)', submittals: 'Onay Belgeleri', punchList: 'Eksik & Kusur Listesi',
    timeTracking: 'Zaman Takibi', invoices: 'Faturalar', reports: 'Raporlar',
    weeklyAgenda: 'Haftalık Ajanda',
  };

  return (
    <>
    <header className="af-glass border-b border-[var(--border)] flex items-center px-4 md:px-6 gap-3 flex-shrink-0 safe-top" style={{ minHeight: 'calc(60px + env(safe-area-inset-top, 0px))' }}>
      <button aria-label="Menüyü aç" className="w-9 h-9 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] items-center justify-center cursor-pointer md:hidden flex hover:scale-105 active:scale-95" onClick={() => setSidebarOpen(true)}>
        <Menu size={18} className="stroke-[var(--muted-foreground)]" aria-hidden="true"/>
      </button>
      {screen === 'projectDetail' ? (
        <button className="flex items-center gap-1.5 text-[var(--af-accent)] text-sm font-medium cursor-pointer hover:underline mr-2" onClick={() => navigateTo('projects')}>
          <ChevronLeft size={16} className="stroke-current" aria-hidden="true"/>
          Projeler
        </button>
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium truncate af-heading-responsive">{localScreenTitles[screen] || screenTitles[screen] || ''}</div>
        <div className="text-xs text-[var(--muted-foreground)] hidden md:block">
          {screen === 'dashboard' ? `Hoş geldiniz, ${userName.split(' ')[0]}` : screen === 'projectDetail' ? currentProject?.data.status || '' : ''}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Süper Yönetici button — only for platform super admins */}
        {isEmailAdmin && screen !== 'superAdmin' && (
          <button
            onClick={() => navigateTo('superAdmin')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            title="Süper Yönetici Paneli"
          >
            <Shield size={14} className="stroke-red-400" aria-hidden="true"/>
            <span className="text-[10px] font-bold text-red-400 hidden lg:inline">SY</span>
          </button>
        )}
        {/* Tenant switcher — compact on mobile, full on desktop */}
        <div className="relative">
          {/* Mobile: tap opens tenant selector directly */}
          <button
            id="onboarding-tenant-trigger"
            ref={tenantBtnRef}
            onClick={() => {
              if (window.innerWidth < 640) {
                setShowTenantSelector(true);
              } else {
                if (!showTenantMenu && tenantBtnRef.current) {
                  const rect = tenantBtnRef.current.getBoundingClientRect();
                  setTenantMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                }
                setShowTenantMenu(!showTenantMenu);
              }
            }}
            className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] cursor-pointer hover:bg-[var(--af-bg4)] transition-all hover:scale-[1.02] active:scale-[0.98]"
            title="Çalışma alanını değiştir"
          >
            <Building2 size={14} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
            <span className="text-xs font-medium max-w-[80px] sm:max-w-[120px] truncate hidden xs:inline">{activeTenantName || 'Çalışma Alanı'}</span>
            {activeTenantRole === 'Süper Yönetici' && (
              <span className="text-[9px] font-bold bg-gradient-to-r from-[var(--af-accent)] to-amber-500 text-background px-1 py-0.5 rounded hidden sm:inline-flex items-center gap-0.5 flex-shrink-0">
                <Crown size={7} aria-hidden="true"/>
                YÖNETİCİ
              </span>
            )}
            <ChevronDown size={12} className={`stroke-[var(--muted-foreground)] transition-transform hidden sm:block ${showTenantMenu ? 'rotate-180' : ''}`} aria-hidden="true"/>
          </button>
          {showTenantMenu && tenantMenuPos && (
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => { setShowTenantMenu(false); setTenantMenuPos(null); }} />
              <div
                className="fixed af-card bg-[var(--card)] border border-[var(--border)] rounded-xl p-1.5 shadow-2xl min-w-[200px] animate-scaleIn"
                style={{
                  top: tenantMenuPos.top,
                  right: tenantMenuPos.right,
                  zIndex: 9999,
                }}
              >
                <div className="px-3 py-2 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Aktif Alan</div>
                <div className="px-3 py-1.5 text-sm font-medium flex items-center gap-2">
                  <Building2 size={14} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
                  <span className="flex-1 min-w-0 truncate">{activeTenantName || 'Seçili alan yok'}</span>
                  {activeTenantRole === 'Süper Yönetici' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-gradient-to-r from-[var(--af-accent)] to-amber-500 text-background px-1.5 py-0.5 rounded-md flex-shrink-0">
                      <Crown size={9} aria-hidden="true"/>
                      YÖNETİCİ
                    </span>
                  )}
                </div>
                <div className="border-t border-[var(--border)] mt-1.5 pt-1.5">
                  <button
                    onClick={() => { setShowTenantMenu(false); setTenantMenuPos(null); setShowTenantSelector(true); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-[var(--af-bg3)] transition-colors text-left bg-transparent border-none text-[var(--foreground)]"
                  >
                    <LayoutGrid size={14} className="stroke-[var(--muted-foreground)]" aria-hidden="true"/>
                    Çalışma alanını değiştir
                  </button>
                  {activeTenantId && (
                    <button
                      onClick={() => { setShowTenantMenu(false); setTenantMenuPos(null); setShowManageMembers(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-[var(--af-bg3)] transition-colors text-left bg-transparent border-none text-[var(--foreground)]"
                    >
                      <Users size={14} className="stroke-[var(--muted-foreground)]" aria-hidden="true"/>
                      Üyeleri yönet
                    </button>
                  )}
                  <button
                    onClick={handleFixRole}
                    disabled={fixingRole}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-amber-500/10 transition-colors text-left bg-transparent border-none text-amber-400 disabled:opacity-50"
                  >
                    <Shield size={14} className="stroke-amber-400" aria-hidden="true"/>
                    {fixingRole ? 'Güncelleniyor...' : `Rolümü düzelt (${activeTenantRole || 'rolsüz'})`}
                  </button>
                </div>
              </div>
              {showManageMembers && activeTenantId && (
                <ManageMembersModal
                  tenantId={activeTenantId}
                  tenantName={activeTenantName || ''}
                  onClose={() => setShowManageMembers(false)}
                  canRemove={activeTenantRole === 'Süper Yönetici' || activeTenantRole === 'Admin' || activeTenantRole === 'Director'}
                />
              )}
            </>
          )}
        </div>
        {/* Notification bell */}
        <button
          aria-label="Bildirimler"
          className="w-9 h-9 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-all relative hover:scale-105 active:scale-95"
          onClick={() => setShowNotifPanel(!showNotifPanel)}
          title="Bildirimler"
        >
          <Bell size={18} className="stroke-[var(--muted-foreground)]" aria-hidden="true"/>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          {notifPermission === 'default' && (
            <span className="absolute -top-1 -right-1 w-[10px] h-[10px] bg-amber-500 rounded-full animate-pulse" />
          )}
        </button>
        {/* Settings — unified config panel (visible on all sizes) */}
        <button aria-label="Ayarlar" className="w-9 h-9 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-all hover:scale-105 active:scale-95" onClick={() => setSettingsOpen(true)} title="Ayarlar">
          <Settings size={18} className="stroke-[var(--muted-foreground)]" aria-hidden="true"/>
        </button>
        {screen === 'projects' && (
          <button className="hidden sm:flex items-center gap-1.5 af-btn-primary text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-colors border-none" onClick={() => { setEditingId(null); setForms(p => ({ ...p, projName: '', projClient: '', projLocation: '', projBudget: '', projDesc: '', projStart: '', projEnd: '', projStatus: 'Harcama Kalemi' })); openModal('project'); }}>
            <Plus size={14} className="stroke-current" strokeWidth={2.5} aria-hidden="true"/>
            Yeni proje
          </button>
        )}
        {screen === 'tasks' && (
          <button className="hidden sm:flex items-center gap-1.5 af-btn-primary text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-colors border-none" onClick={() => { setForms(p => ({ ...p, taskTitle: '', taskDue: new Date().toISOString().split('T')[0] })); openModal('task'); }}>
            <Plus size={14} className="stroke-current" strokeWidth={2.5} aria-hidden="true"/>
            Yeni görev
          </button>
        )}
        {screen === 'suppliers' && (
          <button className="hidden sm:flex items-center gap-1.5 af-btn-primary text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-colors border-none" onClick={() => { setEditingId(null); setForms(p => ({ ...p, supName: '', supCategory: 'Otro', supPhone: '', supEmail: '', supAddress: '', supWebsite: '', supNotes: '', supRating: '5' })); openModal('supplier'); }}>
            <Plus size={14} className="stroke-current" strokeWidth={2.5} aria-hidden="true"/>
            Yeni tedarikçi
          </button>
        )}
        <div className={`w-9 h-9 md:w-7 md:h-7 rounded-full flex items-center justify-center text-[10px] font-semibold border flex-shrink-0 ${authUser?.photoURL ? '' : avatarColor(authUser?.uid ?? '')} overflow-hidden`}>{authUser?.photoURL ? <img src={authUser.photoURL} alt="" className="w-full h-full object-cover" /> : initials}</div>
      </div>
    </header>
    </>
  );
}
