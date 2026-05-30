# Implementation Plan: Ordenes de Cambio (Change Orders)

**Branch**: `001-change-orders` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

## Summary

Implementar un módulo completo de Órdenes de Cambio para ArchiFlow que permite crear, aprobar/rechazar, listar y exportar órdenes de cambio vinculadas a proyectos de construcción. El módulo actualiza automáticamente presupuestos y cronogramas al aprobar, envía notificaciones, y respeta el aislamiento multi-tenant existente. Se implementará como una nueva colección Firestore (`changeOrders`), una nueva pantalla (`ChangeOrdersScreen.tsx`), un modal de creación/edición (`ChangeOrderModal.tsx`), y actualizaciones al Dashboard y las reglas de seguridad.

## Technical Context

**Language/Version**: TypeScript 5.x con React 19

**Primary Dependencies**: Next.js 16 (App Router), Firebase Compat SDK, shadcn/ui (Radix), Tailwind CSS 4, Zustand, Framer Motion, Sonner

**Storage**: Cloud Firestore (colección `changeOrders`), Firebase Storage (archivos adjuntos), IndexedDB (cache offline via Firestore persistence)

**Testing**: Vitest + @testing-library/react + jsdom

**Target Platform**: Web (Chrome, Safari, Firefox), PWA, Android WebView/TWA/Capacitor

**Project Type**: Feature addition to existing Next.js multi-tenant web application

**Performance Goals**: Lista <1s para 100 órdenes, presupuesto update <2s, notificación <5s

**Constraints**: Multi-tenant isolation obligatorio, Firebase Compat SDK (no npm imports), offline-first, mobile-first, UI en español

**Scale/Scope**: ~28 pantallas existentes, +1 nueva pantalla, +1 modal, actualizaciones a Dashboard, Reports, y Firestore rules

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Multi-Tenant Isolation First | ✅ PASS | `changeOrders` tendrá `tenantId`, Firestore rules validan `isTenantMember()` |
| II. Mobile-First & Cross-Platform | ✅ PASS | Modal usa BottomSheet en mobile, touch targets ≥44px, WebView tested |
| III. Firebase Compat SDK Architecture | ✅ PASS | Acceso via `getFirebase()` de firebase-service.ts, sin imports npm |
| IV. Offline Resilience & Real-Time Sync | ✅ PASS | `onSnapshot` para lista, queue offline para writes, fallback UI |
| V. Secure by Default | ✅ PASS | Firestore rules primero, roles validados en rules y UI |
| VI. Component Architecture & State | ✅ PASS | Hook `useChangeOrders`, modal en `components/modals/`, screen en `screens/` |
| VII. i18n-Ready (es-CO) | ✅ PASS | Todas las strings en español, moneda en COP, fechas DD/MM/YYYY |

## Project Structure

### Documentation (this feature)

```text
specs/001-change-orders/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── types.ts                           # ADD: ChangeOrder, ChangeOrderHistory interfaces
├── screens/
│   └── ChangeOrdersScreen.tsx             # NEW: Main screen for listing/filtering COs
├── components/
│   ├── modals/
│   │   └── ChangeOrderModal.tsx           # NEW: Create/Edit CO modal
│   ├── change-orders/
│   │   ├── ChangeOrderCard.tsx            # NEW: Card for list view
│   │   ├── ChangeOrderHistory.tsx         # NEW: Activity timeline
│   │   ├── ChangeOrderApproval.tsx        # NEW: Approval/Rejection UI
│   │   └── ChangeOrderFilters.tsx         # NEW: Filter bar (status, type, date)
│   ├── dashboard/
│   │   └── DashboardChangeOrders.tsx      # NEW: Dashboard widget
│   └── reports/
│       └── ReportsFinanciero.tsx          # MODIFY: Add CO section to financial reports
├── hooks/
│   └── useChangeOrders.tsx                # NEW: Hook for CO data + operations
├── contexts/
│   └── AppContext.tsx                      # MODIFY: Add CO state + onSnapshot listener
├── lib/
│   └── firestore-actions.ts               # MODIFY: Add CO CRUD helpers
└── app/api/
    └── change-orders/
        └── approve/
            └── route.ts                   # NEW: Server-side approval (budget update)

firestore.rules                              # MODIFY: Add changeOrders + counter rules
src/lib/types.ts                             # MODIFY: Add ChangeOrder types + NAV_ITEMS entry
src/components/layout/Sidebar.tsx            # MODIFY: Add nav entry for Change Orders
src/components/dashboard/DashboardQuickActions.tsx  # MODIFY: Add quick action
```

**Structure Decision**: Feature follows existing ArchiFlow patterns — screen in `screens/`, modal in `components/modals/`, domain components in `components/change-orders/`, hook in `hooks/`, API route for server-side operations. This matches how RFIs, Submittals, and PunchItems are structured.

## Data Model

### Firestore Collection: `changeOrders`

```typescript
interface ChangeOrder {
  id: string;                          // Firestore doc ID
  tenantId: string;                    // Tenant isolation
  projectId: string;                   // Parent project
  orderNumber: string;                 // Sequential: "CO-001", "CO-002"
  type: 'alcance' | 'costo' | 'cronograma' | 'combinado';
  status: 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'rechazada' | 'cancelada';
  title: string;                       // Short title
  description: string;                 // Detailed description
  justification: string;               // Why the change is needed
  // Cost impact
  costImpact?: {
    previousBudget: number;            // Budget before change
    newBudget: number;                 // Budget after change
    difference: number;                // newBudget - previousBudget (can be negative)
    currency: 'COP';                   // Always COP
  };
  // Schedule impact
  scheduleImpact?: {
    daysExtension: number;             // Days to add to project end date
    reason: string;                    // Why the extension
  };
  // Attachments
  attachments: Array<{
    name: string;
    url: string;                       // Firebase Storage URL
    type: string;                      // MIME type
    size: number;                      // Bytes
    uploadedAt: any;                   // ServerTimestamp
  }>;
  // Approval tracking
  createdBy: string;                   // UID
  createdByName: string;               // Display name
  createdAt: any;                      // ServerTimestamp
  submittedAt?: any;                   // When sent to approval
  approvedBy?: string;                 // UID of approver
  approvedByName?: string;             // Display name
  approvedAt?: any;                    // When approved
  rejectionReason?: string;            // If rejected
  reviewedComments?: string;           // Reviewer comments
  // History log (embedded for simplicity)
  history: Array<{
    action: string;                    // 'created', 'submitted', 'approved', 'rejected', 'cancelled'
    by: string;                        // UID
    byName: string;                    // Display name
    at: any;                           // ServerTimestamp
    comments?: string;
  }>;
}
```

### Counter: `changeOrderCounters` (subcollection of projects)

```typescript
// Path: projects/{projectId}/changeOrderCounter/counter
interface ChangeOrderCounter {
  count: number;  // Incremented atomically on each new CO
}
```

### Firestore Rules Addition

```text
// Change Orders — tenant-scoped
match /changeOrders/{coId} {
  allow read: if isSignedIn() && isTenantMember(resource.data.tenantId);
  allow create: if isSignedIn() && isTenantMember(request.resource.data.tenantId);
  allow update: if isSignedIn() && isTenantMember(resource.data.tenantId);
  allow delete: if isSignedIn() && isTenantMember(resource.data.tenantId);
}

// Change Order Counter (inside project subcollection — inherits project tenantId)
match /projects/{projectId}/changeOrderCounter/{counterId} {
  allow read: if isSignedIn() && isTenantMember(
    get(/databases/$(database)/documents/projects/$(projectId)).data.tenantId
  );
  allow update: if isSignedIn() && isTenantMember(
    get(/databases/$(database)/documents/projects/$(projectId)).data.tenantId
  );
}
```

## Complexity Tracking

No constitution violations. All patterns follow existing ArchiFlow conventions.
