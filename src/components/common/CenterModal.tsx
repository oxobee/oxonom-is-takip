'use client';
import React from 'react';
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';

/**
 * CenterModal — Modal centrado en pantalla.
 * Usa Radix Dialog en vez de Vaul para evitar conflictos de posicionamiento.
 * Funciona igual en mobile y desktop: siempre centrado.
 * Animate-in/out via tailwindcss-animate classes on Radix primitives.
 */
export default function CenterModal({ open, onClose, children, maxWidth = 480 }: { open: boolean; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="z-[100] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogContent
          showCloseButton={false}
          className="z-[101] bg-[var(--card)] border border-[var(--border)] rounded-2xl p-0 shadow-2xl max-h-[85dvh] sm:max-h-[85vh] flex flex-col overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-200"
          style={{ maxWidth: maxWidth ? `${maxWidth}px` : undefined, width: '95vw' }}
        >
          {/* Visually hidden title for accessibility */}
          <DialogTitle className="sr-only">Modal</DialogTitle>
          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
            {children}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
