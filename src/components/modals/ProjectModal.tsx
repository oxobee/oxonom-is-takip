'use client';
import React, { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { FormField, FormInput, FormSelect, FormTextarea, ModalFooter, useFormValidation } from '@/components/common/FormField';
import CenterModal from '@/components/common/CenterModal';
import { PROJECT_TYPE_PHASES, PROJECT_TYPE_COLORS, type Company } from '@/lib/types';

export default function ProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { forms, setForms, editingId, closeModal, saveProject, companies } = useApp();
  const { errors, validateRequired, onBlurRequired, clearError } = useFormValidation();

  const projectType = forms.projType || 'Uygulama';

  // Fases disponibles según el tipo seleccionado
  const availablePhases = useMemo(() => {
    const types = (projectType === 'Ambos' || projectType === 'Her İkisi') ? ['Tasarım', 'Uygulama'] : [projectType];
    const phases: { type: string; key: string; name: string; description: string }[] = [];
    for (const t of types) {
      for (const tpl of (PROJECT_TYPE_PHASES[t] || [])) {
        phases.push({ type: t, key: tpl.key, name: tpl.name, description: tpl.description });
      }
    }
    return phases;
  }, [projectType]);

  const enabledPhases: string[] = forms.enabledPhases || [];
  const allEnabled = enabledPhases.length === 0;

  const togglePhase = (key: string) => {
    setForms((p: any) => {
      const current = p.enabledPhases || [];
      const next = current.includes(key)
        ? current.filter((k: string) => k !== key)
        : [...current, key];
      return { ...p, enabledPhases: next };
    });
  };

  const toggleAll = () => {
    setForms((p: any) => ({ ...p, enabledPhases: [] }));
  };

  const handleSubmit = () => {
    const nameValid = validateRequired('projName', forms.projName || '', 'Proje Adı');
    if (!nameValid) return;
    saveProject();
  };

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={580}>
      <h2 className="text-lg font-semibold mb-4">{editingId ? 'Projeyi Düzenle' : 'Yeni Proje'}</h2>

      <div className="space-y-3">
        <FormField label="Proje Adı" required error={errors.projName}>
          <FormInput
            value={forms.projName || ''}
            onChange={(e) => { setForms(p => ({ ...p, projName: e.target.value })); clearError('projName'); }}
            onBlur={() => onBlurRequired('projName', forms.projName || '', 'Proje Adı')}
            placeholder="Proje adını girin"
            error={errors.projName}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Durum">
            <FormSelect
              value={forms.projStatus || 'Harcama Kalemi'}
              onChange={(e) => setForms(p => ({ ...p, projStatus: e.target.value }))}
            >
              <option value="Planlama">Planlama</option>
              <option value="Tasarım">Tasarım</option>
              <option value="Uygulama">Uygulama</option>
              <option value="Tamamlandı">Tamamlandı</option>
            </FormSelect>
          </FormField>

          <FormField label="Proje Türü">
            <FormSelect
              value={projectType}
              onChange={(e) => setForms(p => ({ ...p, projType: e.target.value, enabledPhases: [] }))}
            >
              <option value="Tasarım">Tasarım</option>
              <option value="Uygulama">Uygulama</option>
              <option value="Her İkisi">Her İkisi</option>
            </FormSelect>
          </FormField>
        </div>

        {/* Fases toggle */}
        {!editingId && (
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold text-[var(--foreground)]">
                Proje Aşamaları
              </div>
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer border-none hover:bg-[var(--af-accent)]/20"
                onClick={toggleAll}
              >
                {allEnabled ? 'Tümünü Kaldır' : 'Tümünü Seç'}
              </button>
            </div>
            {['Tasarım', 'Uygulama'].filter(t => projectType === 'Ambos' || t === projectType).map(type => (
              <div key={type} className="mb-2 last:mb-0">
                <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${(type === 'Diseño' || type === 'Tasarım') ? 'text-violet-400' : 'text-amber-400'}`}>
                  {type}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {availablePhases.filter(p => p.type === type).map(phase => {
                    const isOn = allEnabled || enabledPhases.includes(phase.key);
                    return (
                      <button
                        key={phase.key}
                        type="button"
                        className={`text-left px-2.5 py-1.5 rounded-lg text-[11px] border cursor-pointer transition-all ${
                          isOn
                            ? (type === 'Diseño' || type === 'Tasarım')
                              ? 'bg-violet-500/10 text-violet-300 border-violet-500/30'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] opacity-50'
                        }`}
                        onClick={() => togglePhase(phase.key)}
                        title={phase.description}
                      >
                        {isOn ? '✓ ' : '○ '}{phase.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="text-[10px] text-[var(--af-text3)] mt-2">
              Aşamaları proje içerisinden dilediğiniz zaman etkinleştirebilir veya kapatabilirsiniz
            </div>
          </div>
        )}

        <FormField label="Müşteri">
          <FormInput
            value={forms.projClient || ''}
            onChange={(e) => setForms(p => ({ ...p, projClient: e.target.value }))}
            placeholder="Müşteri adını girin"
            list="company-names-datalist"
          />
          <datalist id="company-names-datalist">
            {companies.map((c: Company) => (
              <option key={c.id} value={c.data.name} />
            ))}
          </datalist>
        </FormField>

        <FormField label="Konum">
          <FormInput
            value={forms.projLocation || ''}
            onChange={(e) => setForms(p => ({ ...p, projLocation: e.target.value }))}
            placeholder="Proje konumunu girin"
          />
        </FormField>

        <FormField label="Firma">
          <FormSelect
            value={forms.projCompany || ''}
            onChange={(e) => {
              const comp = companies.find((c: Company) => c.id === e.target.value);
              setForms(p => ({
                ...p,
                projCompany: e.target.value,
                projClient: comp?.data?.name || p.projClient || '',
              }));
            }}
          >
            <option value="">— Firma Seçilmedi —</option>
            {companies.map((c: Company) => (
              <option key={c.id} value={c.id}>{c.data.name}</option>
            ))}
          </FormSelect>
        </FormField>

        <FormField label="Bütçe (TL)">
          <FormInput
            type="number"
            value={forms.projBudget || ''}
            onChange={(e) => setForms(p => ({ ...p, projBudget: e.target.value }))}
            placeholder="0"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Başlangıç Tarihi">
            <FormInput
              type="date"
              value={forms.projStart || ''}
              onChange={(e) => setForms(p => ({ ...p, projStart: e.target.value }))}
            />
          </FormField>
          <FormField label="Teslim Tarihi">
            <FormInput
              type="date"
              value={forms.projEnd || ''}
              onChange={(e) => setForms(p => ({ ...p, projEnd: e.target.value }))}
            />
          </FormField>
        </div>

        <FormField label="Açıklama">
          <FormTextarea
            value={forms.projDesc || ''}
            onChange={(e) => setForms(p => ({ ...p, projDesc: e.target.value }))}
            placeholder="Proje açıklamasını girin..."
            rows={3}
          />
        </FormField>
      </div>

      <ModalFooter
        onCancel={() => closeModal('project')}
        onSubmit={handleSubmit}
        submitLabel={editingId ? 'Güncelle' : 'Proje Oluştur'}
      />
    </CenterModal>
  );
}
