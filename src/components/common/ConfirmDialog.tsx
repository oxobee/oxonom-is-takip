'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const handleClose = () => {
    if (onOpenChange) onOpenChange(false);
    if (onCancel) onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-5 max-w-md w-full animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" aria-hidden="true" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-row gap-2 justify-end mt-4 pt-3 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={handleClose}
            className="text-xs px-4 py-2 rounded-lg border border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
            }}
            className={`text-xs px-4 py-2 rounded-lg font-medium cursor-pointer transition-all active:scale-95 ${
              destructive
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
