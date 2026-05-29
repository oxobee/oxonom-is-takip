# ArchiFlow Constitution

## Core Principles

### I. Multi-Tenant Isolation First

Every feature, every query, every Firestore rule must enforce tenant isolation. ArchiFlow serves multiple construction organizations simultaneously, and data leakage between tenants is an absolute non-starter. All top-level collections include a `tenantId` field, and all Firestore rules validate `request.auth.token.tenantId` against the document's `tenantId` before granting access. Subcollections inherit the parent document's tenant via `get()` lookups. Any new collection or feature that stores data MUST include `tenantId` and MUST have corresponding Firestore rules that enforce tenant-scoped access. Server-side API routes must also verify tenant membership before processing requests. There are no exceptions to this principle: if data exists in Firestore, it belongs to a tenant, and only members of that tenant can access it.

### II. Mobile-First & Cross-Platform

ArchiFlow runs on the web, as a PWA, and inside Android WebView/TWA/Capacitor wrappers. Every UI component and authentication flow must work correctly across all these environments. The app uses `isWebView()` detection to handle platform differences, such as using `signInWithRedirect` instead of `signInWithPopup` for OAuth in WebView environments where popups are blocked. Touch targets must be at least 44px, navigation must work with bottom sheets and drawers on mobile, and layouts must be responsive from 320px to 1440px+. The sidebar collapses on small screens, modals use bottom sheets on mobile, and all interactive elements are accessible via touch. Any new feature must be tested on both desktop Chrome and Android WebView before merging.

### III. Firebase Compat SDK Architecture

ArchiFlow uses the Firebase Compat SDK loaded via `<script>` tags in `layout.tsx`, NOT the modular SDK via npm imports. This is intentional: importing from `firebase/auth` or `firebase/firestore` causes Turbopack to bundle the modular SDK alongside the compat SDK, creating dual-instance conflicts (the `React.Children.only` crash from duplicate `@radix-ui/react-slot` was a related symptom). All Firebase access goes through `getFirebase()` from `src/lib/firebase-service.ts`, which returns the global `window.firebase` singleton. Type definitions are maintained locally in `firebase-service.ts` rather than importing from Firebase packages. The `@radix-ui/react-slot` package is pinned to version `1.2.4` with overrides in `package.json` to prevent version drift. Any new dependency that touches Radix UI or Firebase must be reviewed for version conflicts.

### IV. Offline Resilience & Real-Time Sync

Construction sites have unreliable connectivity. ArchiFlow must degrade gracefully when offline: reads should use cached Firestore data, writes should queue locally, and the UI must never show a blank screen due to a network error. Firestore `onSnapshot` listeners with persistence enabled provide the foundation for offline reads. The `offline-queue.ts` module handles write queuing for when connectivity returns. All data-loading effects must handle `permission-denied` and network errors without crashing, showing appropriate fallback UI instead. Notification delivery uses a coalescence buffer (800ms debounce) to avoid spamming when connectivity is restored and snapshots fire rapidly. When adding real-time features, always subscribe with `onSnapshot` and handle both the data callback and the error callback.

### V. Secure by Default

Security is enforced at multiple layers. Firestore rules are the primary defense: every rule uses `isSignedIn()` and `isTenantMember(tenantId)` helpers, with no wildcard `allow read, write: if true` rules anywhere. Server-only collections (audit logs, telemetry, WhatsApp OTP, document chunks) use `allow read, write: if false` with Admin SDK for writes. API routes verify Firebase ID tokens via `getAuthHeaders()` before processing sensitive operations. Content Security Policy headers restrict script sources, frame ancestors, and connection endpoints. OAuth redirect URIs are whitelisted. When adding new API endpoints or Firestore collections, always write the security rules FIRST, then implement the feature. Never merge code that has placeholder or permissive security rules.

### VI. Component Architecture & State Management

ArchiFlow uses a layered architecture. `AppContext` (in `src/contexts/AppContext.tsx`) is the central provider that manages auth state, Firestore subscriptions, and business logic. Hooks (`useOneDrive`, `useNotifications`, `useChat`, `useInventory`, etc.) extract specific domain logic from the context. Zustand stores (`ui-store.ts`, `onboarding-store.ts`) manage UI-only state like theme preferences. UI components are organized by domain: `components/layout/`, `components/projects/`, `components/dashboard/`, `components/inventory/`, `components/kanban/`, etc. Modal components live in `components/modals/`. Reusable UI primitives built on shadcn/ui + Radix live in `components/ui/`. When building new features, extract domain logic to custom hooks, keep components focused on rendering, and avoid duplicating state that already exists in AppContext or a Zustand store.

### VII. Internationalization-Ready (es-CO Primary)

ArchiFlow's primary language is Spanish (Colombia). All user-facing strings, labels, placeholders, and error messages must be written in Spanish. Date formatting uses `date-fns` with Colombian locale conventions (DD/MM/YYYY). Currency formatting uses Colombian Pesos (COP) via the `fmtCOP` helper. Role names (`Admin`, `Director`, `Arquitecto`, `Interventor`, `Contratista`, `Cliente`, `Miembro`) are in Spanish and stored as-is in Firestore. When adding new user-facing text, write it in Spanish first. Variable names, comments, and commit messages may be in English for developer readability, but all UI strings must be in Spanish.

## Technology Stack

### Frontend
- **Framework**: Next.js 16 (App Router) with React 19
- **Language**: TypeScript (strict mode enabled)
- **Styling**: Tailwind CSS 4 + tailwindcss-animate
- **UI Library**: shadcn/ui (Radix UI primitives, CVA variants)
- **State**: AppContext (React Context) + Zustand for UI state
- **Data Fetching**: Firestore `onSnapshot` real-time listeners
- **Charts**: Recharts
- **DnD**: @dnd-kit for drag-and-drop (kanban, etc.)
- **Animations**: Framer Motion
- **Virtual Lists**: @tanstack/react-virtual
- **Notifications**: Sonner (toast), Web Push API, WhatsApp (via Twilio)
- **PDF Export**: jsPDF + jsPDF-AutoTable
- **Excel Export**: xlsx (SheetJS)

### Backend
- **Runtime**: Next.js API Routes (serverless on Vercel)
- **Database**: Cloud Firestore (Firebase Compat SDK)
- **Auth**: Firebase Auth (Google, Microsoft, Email/Password)
- **Admin SDK**: firebase-admin for server-side operations
- **AI**: Google Gemini (via `ai-service.ts`, `rag-service.ts`)
- **Email**: Resend
- **Storage**: Firebase Storage + OneDrive integration
- **Push Notifications**: web-push library
- **Cron Jobs**: Vercel Cron (daily at 12:00, weekly Monday at 13:00)

### Infrastructure
- **Hosting**: Vercel (auto-deploy from `main` branch)
- **Mobile**: PWA + Android TWA/Capacitor wrapper
- **Security Headers**: CSP, COOP=unsafe-none (required for OAuth), X-Frame-Options=SAMEORIGIN
- **Repository**: https://github.com/yecos/archii (main branch)

## Data Model

### Core Collections (all tenant-scoped with `tenantId` field)
- `tenants` — Organizations with `members[]`, `superAdmins[]`, subcollections (`agendaWeekData`, `collab_documents`, `collab_presence`, `collab_comments`)
- `projects` — Construction projects with subcollections (`messages`, `files`, `workPhases`, `approvals`, `dailyLogs`, `fieldNotes`, `dailyEntries`, `dailyReports`, `weatherCache`)
- `tasks` — Task management with status, priority, assignee
- `expenses` — Project expenses
- `suppliers` — Supplier management
- `companies` — Company registry
- `meetings` — Meeting scheduling
- `generalMessages` — Team chat with `reactions` subcollection
- `galleryPhotos` — Photo gallery
- `rfis` — Requests for Information
- `submittals` — Submittal tracking
- `punchItems` — Punch list items
- `invoices` — Invoice management
- `invProducts`, `invCategories`, `invMovements`, `invTransfers` — Inventory system
- `timeEntries` — Time tracking
- `kanbanBoards` — Kanban boards with `columns` subcollection
- `notifications` — User notifications
- `whatsappLinks` — WhatsApp integration links

### Server-Only Collections (Admin SDK writes only)
- `audit_logs` — Read-only for tenant members
- `error_reports` — Read-only for tenant members
- `telemetry_events` — No client access
- `whatsappOtp` — No client access
- `integrations` — Read-only for tenant members
- `integration_logs` — Read-only for tenant members
- `onedrive_files`, `onedrive_folders` — Read-only cache
- `apiKeys` — Read-only for tenant members
- `document_chunks` — RAG chunks, no client access
- `beta_feedback` — Create/read for members, server manages status

### User Roles
- **Super Admin** — Tenant creator + members of `superAdmins[]`. Full access.
- **Admin** — System-level admin (hardcoded `ADMIN_EMAILS`). Full access.
- **Director** — Project management, team management, budget visibility.
- **Arquitecto** — Project creation/editing, task management.
- **Interventor** — Oversight, budget review, inventory visibility.
- **Contratista** — Task creation, inventory management, time tracking.
- **Cliente** — Read-only portal access, budget visibility.
- **Miembro** — Basic access (dashboard, chat).

## Development Workflow

### Branch Strategy
- `main` branch is the deployment branch (auto-deploys to Vercel)
- Feature branches: `feat/short-description` or `fix/short-description`
- Commits follow conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`

### Before Merging
1. `npm run build` MUST pass with zero errors
2. `npm run lint` MUST pass with zero errors (warnings acceptable)
3. `npm run test` SHOULD pass (integration tests may be flaky)
4. Firestore rules MUST be updated for any new collections or fields
5. Mobile/WebView compatibility verified for UI changes
6. Spanish strings for all user-facing text
7. No `console.log` in production code (use `console.error` for errors only)

### Key Files That Must Never Be Modified Without Careful Review
- `src/contexts/AppContext.tsx` — Central state; changes ripple everywhere
- `src/lib/firebase-service.ts` — Firebase singleton; wrong imports break the app
- `firestore.rules` — Security boundary; errors expose tenant data
- `next.config.ts` — CSP headers and COOP settings; wrong values break OAuth
- `package.json` overrides — Pinning `@radix-ui/react-slot` prevents crashes

### Error Handling Standards
- All Firestore `onSnapshot` error callbacks MUST be handled (never silently ignored)
- API routes MUST return proper HTTP status codes and JSON error messages
- UI components MUST render fallback UI on error (never blank screens)
- Use `ErrorBoundary` component for top-level error catching in screens
- Toast notifications via `showToast()` for user-facing errors
- `console.error('[Archii] ...')` prefix for all logged errors

## Performance Standards

- Initial page load: under 3 seconds on 4G
- Firestore listeners: use `where('tenantId', '==', activeTenantId)` to limit reads
- Virtual scrolling for lists over 50 items (`@tanstack/react-virtual`)
- Image optimization: use `next/image` where possible, lazy-load gallery photos
- Bundle size: avoid adding heavy npm packages; prefer lightweight alternatives
- Debounce rapid Firestore events (notification coalescence uses 800ms)

**Version**: 1.0.0 | **Ratified**: 2026-05-30 | **Last Amended**: 2026-05-30
