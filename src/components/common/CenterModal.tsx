'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';

/**
 * CenterModal — Modal centrado en pantalla.
 * Usa Radix Dialog en vez de Vaul para evitar conflictos de posicionamiento.
 * Funciona igual en mobile y desktop: siempre centrado.
 * Animate-in/out via Framer Motion for smooth spring-based transitions.
 */
export default function CenterModal({ open, onClose, children, maxWidth = 480 }: { open: boolean; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <AnimatePresence>
        {open && (
          <DialogPortal forceMount>
            <DialogOverlay className="z-[100] bg-black/60 backdrop-blur-sm" asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </DialogOverlay>
            <DialogContent
              showCloseButton={false}
              className="z-[101] bg-[var(--card)] border border-[var(--border)] rounded-2xl p-0 shadow-2xl max-h-[85dvh] sm:max-h-[85vh] flex flex-col overflow-hidden border-none outline-none"
              style={{ maxWidth: maxWidth ? `${maxWidth}px` : undefined, width: '95vw' }}
              asChild
              forceMount
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300, duration: 0.2 }}
              >
                {/* Visually hidden title for accessibility */}
                <DialogTitle className="sr-only">Modal</DialogTitle>
                <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                  {children}
                </div>
              </motion.div>
            </DialogContent>
          </DialogPortal>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
