'use client';

import { useState, useCallback, useRef } from 'react';

interface ConfirmState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
}

const initialState: ConfirmState = {
  open: false,
  title: '',
  description: '',
  confirmLabel: 'Onayla',
  cancelLabel: 'İptal',
  destructive: true,
};

type ResolveFn = (confirmed: boolean) => void;

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>(initialState);
  const resolveRef = useRef<ResolveFn | null>(null);

  const confirm = useCallback((options: {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        open: true,
        title: options.title,
        description: options.description || '',
        confirmLabel: options.confirmLabel || 'Onayla',
        cancelLabel: options.cancelLabel || 'İptal',
        destructive: options.destructive !== false,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState(initialState);
    const fn = resolveRef.current;
    resolveRef.current = null;
    fn?.(true);
  }, []);

  const handleCancel = useCallback(() => {
    setState(initialState);
    const fn = resolveRef.current;
    resolveRef.current = null;
    fn?.(false);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setState(prev => ({ ...prev, open: false }));
      const fn = resolveRef.current;
      resolveRef.current = null;
      fn?.(false);
    }
  }, []);

  return {
    ...state,
    confirm,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
    onOpenChange: handleOpenChange,
  };
}
