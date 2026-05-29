<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

# ArchiFlow — Project Context

## What is ArchiFlow?
ArchiFlow is a multi-tenant, AI-powered construction project management platform. It serves construction companies in Colombia, providing project tracking, task management, budgeting, inventory, daily logs, RFIs, submittals, punch lists, and team collaboration — all in real-time.

## Tech Stack
- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI)
- **Firebase** Compat SDK (Auth, Firestore, Storage) — loaded via `<script>` tags, NOT npm imports
- **Google Gemini** for AI features (chat, RAG)
- **Zustand** for UI state, **React Context** for app state
- **Vercel** for hosting (auto-deploy from `main`)

## Critical Architecture Rules
1. **Multi-tenant isolation**: Every Firestore collection has `tenantId`. Rules enforce `isTenantMember()`. No exceptions.
2. **Firebase Compat SDK only**: Access via `getFirebase()` from `src/lib/firebase-service.ts`. NEVER import from `firebase/auth` or `firebase/firestore` — causes dual-instance crashes.
3. **Mobile-first**: App runs in Android WebView/TWA. Use `isWebView()` for OAuth redirects. Touch targets ≥44px. Bottom sheets on mobile.
4. **Spanish UI**: All user-facing strings in Spanish (es-CO). Currency in COP. Dates in DD/MM/YYYY.
5. **Offline resilient**: Firestore persistence + `offline-queue.ts`. Never blank-screen on network error.
6. **`@radix-ui/react-slot` pinned to 1.2.4**: Do NOT upgrade or remove the override in `package.json`.

## Key Directories
- `src/contexts/AppContext.tsx` — Central state provider (auth, Firestore subs, business logic)
- `src/lib/` — Services (firebase-service, firestore-actions, ai-service, helpers, etc.)
- `src/screens/` — 28 screen components
- `src/components/` — UI primitives, layout, modals, domain components
- `src/hooks/` — Custom hooks (useOneDrive, useNotifications, useChat, useInventory, etc.)
- `src/stores/` — Zustand stores (ui-store, onboarding-store)
- `src/app/api/` — 24+ API route directories
- `firestore.rules` — 577-line security rules (tenant-scoped)
- `.specify/` — Spec Kit configuration (Spec-Driven Development)

## Data Model (All tenant-scoped)
- `tenants` → `agendaWeekData`, `collab_*` subcollections
- `projects` → `messages`, `files`, `workPhases`, `approvals`, `dailyLogs`, `fieldNotes`, `dailyEntries`, `dailyReports`, `weatherCache`
- Top-level: `tasks`, `expenses`, `suppliers`, `companies`, `meetings`, `generalMessages`, `galleryPhotos`, `rfis`, `submittals`, `punchItems`, `invoices`, `invProducts`, `invCategories`, `invMovements`, `invTransfers`, `timeEntries`, `kanbanBoards`, `notifications`, `whatsappLinks`
- Server-only: `audit_logs`, `error_reports`, `telemetry_events`, `whatsappOtp`, `integrations`, `document_chunks`, `apiKeys`

## Before Committing
- `npm run build` must pass
- `npm run lint` must pass
- Firestore rules updated for any new collections
- No `console.log` in production code
- Spanish strings for all UI text
- Mobile/WebView compatible
