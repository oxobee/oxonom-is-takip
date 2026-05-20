'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogOverlay,
  AlertDialogPortal,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <AlertDialogPortal forceMount>
            <AlertDialogOverlay className="bg-black/60 backdrop-blur-sm" asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </AlertDialogOverlay>
            <AlertDialogContent
              className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-5 border-none outline-none"
              asChild
              forceMount
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300, duration: 0.2 }}
              >
                <AlertDialogHeader>
                  <div className="flex items-start gap-3">
                    {destructive && (
                      <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                      </div>
                    )}
                    <div>
                      <AlertDialogTitle className="text-sm font-semibold text-[var(--foreground)]">
                        {title}
                      </AlertDialogTitle>
                      {description && (
                        <AlertDialogDescription className="text-xs text-[var(--muted-foreground)] mt-1">
                          {description}
                        </AlertDialogDescription>
                      )}
                    </div>
                  </div>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row gap-2 justify-end mt-4 pt-3 border-t border-[var(--border)]">
                  <AlertDialogCancel className="text-xs px-4 py-2 rounded-lg border border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
                    {cancelLabel}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      onConfirm();
                    }}
                    className={`text-xs px-4 py-2 rounded-lg font-medium cursor-pointer transition-all active:scale-95 ${destructive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90'}`}
                  >
                    {confirmLabel}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </motion.div>
            </AlertDialogContent>
          </AlertDialogPortal>
        )}
      </AnimatePresence>
    </AlertDialog>
  );
}
