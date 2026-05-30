# Tasks: Ordenes de Cambio (Change Orders)

**Input**: Design documents from `/specs/001-change-orders/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Types, Firestore rules, and data layer that all user stories depend on

- [ ] T001 Add ChangeOrder interface to `src/lib/types.ts` — include all fields from plan.md data model
- [ ] T002 [P] Add ChangeOrder types to `src/lib/types.ts` — CO_STATUS, CO_TYPES arrays, DEFAULT_CO_FORM
- [ ] T003 [P] Add `changeOrders` entry to NAV_ITEMS and SCREEN_TITLES in `src/lib/types.ts`
- [ ] T004 Add Firestore rules for `changeOrders` collection and `changeOrderCounter` subcollection in `firestore.rules`
- [ ] T005 [P] Add CRUD helpers for changeOrders in `src/lib/firestore-actions.ts` — create, update, delete, getNextOrderNumber
- [ ] T006 Add `changeOrders` onSnapshot listener and state in `src/contexts/AppContext.tsx` — state, load, save, filter

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core UI navigation and base components that ALL user stories need

- [ ] T007 Add "Ordenes de Cambio" nav item in `src/components/layout/Sidebar.tsx` and `src/components/layout/BottomNav.tsx`
- [ ] T008 Create `src/screens/ChangeOrdersScreen.tsx` — shell with empty state, header, and filter bar placeholder
- [ ] T009 [P] Create `src/components/change-orders/ChangeOrderFilters.tsx` — filter by status, type, date range
- [ ] T010 [P] Create `src/components/change-orders/ChangeOrderCard.tsx` — card displaying CO number, type, title, status badge, cost impact, date
- [ ] T011 Register ChangeOrdersScreen in the main app routing (AppContext screen navigation)

**Checkpoint**: Foundation ready — navigation works, screen renders with empty state

---

## Phase 3: User Story 1 - Crear Orden de Cambio (Priority: P1) 🎯 MVP

**Goal**: Director/Arquitecto can create, edit (as draft), and submit a change order for approval

**Independent Test**: Create a CO from a project, fill all fields, save as draft, then submit for approval. Verify Firestore document and notification.

### Implementation for User Story 1

- [ ] T012 Create `src/components/modals/ChangeOrderModal.tsx` — full form with: title, type selector, description, justification, cost impact fields (previous/new/difference auto-calc), schedule impact fields (days + reason), file upload zone (max 5 files, 10MB each)
- [ ] T013 Implement file upload in ChangeOrderModal — upload to Firebase Storage at `tenants/{tenantId}/changeOrders/{orderId}/`, show upload progress, preview attachments
- [ ] T014 Implement save as draft in ChangeOrderModal — write to `changeOrders` collection with status "borrador", generate orderNumber via atomic counter
- [ ] T015 Implement "Enviar a aprobación" button — change status to "pendiente_aprobacion", add history entry, trigger notification via `bufferedNotify`
- [ ] T016 Add role-based access control in ChangeOrderModal — only Admin/Director/Arquitecto can create; Contratista/Miembro/Cliente see "Sin permisos" message
- [ ] T017 Wire ChangeOrderModal into ChangeOrdersScreen — FAB "+" button, open on project detail, pass projectId + tenantId

**Checkpoint**: User Story 1 fully functional — can create, draft, and submit COs with file attachments

---

## Phase 4: User Story 2 - Aprobar/Rechazar (Priority: P2)

**Goal**: Interventor/Super Admin can approve or reject pending COs, auto-updating project budget and schedule

**Independent Test**: Create a CO (US1), then as Interventor approve it. Verify project budget updates and status changes.

### Implementation for User Story 2

- [ ] T018 Create `src/components/change-orders/ChangeOrderApproval.tsx` — approval panel showing CO details, comments textarea, Approve/Reject buttons. Only visible to Interventor/Super Admin roles.
- [ ] T019 Implement approval logic — update status to "aprobada", set approvedBy/approvedAt/reviewedComments, add history entry, send notification to creator
- [ ] T020 Implement rejection logic — update status to "rechazada", set rejectionReason, add history entry, send notification to creator
- [ ] T021 Create server-side approval API `src/app/api/change-orders/approve/route.ts` — atomically update project budget (if cost impact) and project endDate (if schedule impact) in a Firestore transaction
- [ ] T022 Wire approval into ChangeOrdersScreen — show approval panel when opening a "pendiente_aprobacion" CO for users with Interventor/Super Admin role
- [ ] T023 Add activity log entries for approval/rejection — write to `activityLog` collection with tenantId

**Checkpoint**: User Stories 1 AND 2 both work — full create → approve/reject workflow functional

---

## Phase 5: User Story 3 - Listar y Filtrar (Priority: P3)

**Goal**: Any team member can view and filter change orders; Dashboard shows pending count

**Independent Test**: Create several COs with different statuses, verify filters work and Dashboard widget shows correct count.

### Implementation for User Story 3

- [ ] T024 Implement filtering logic in ChangeOrdersScreen — filter by status, type, date range using local state filters + Firestore queries where possible
- [ ] T025 Create `src/components/dashboard/DashboardChangeOrders.tsx` — widget showing count of pending COs, total by status, link to filtered list
- [ ] T026 Wire DashboardChangeOrders into DashboardScreen — add to dashboard layout
- [ ] T027 Add "Ordenes de Cambio" quick action in `src/components/dashboard/DashboardQuickActions.tsx`
- [ ] T028 Implement Cliente read-only view — hide create/approve buttons for Cliente role, show CO list only

**Checkpoint**: All three user stories work — full create, approve, list/filter workflow

---

## Phase 6: User Story 4 - Historial y Exportar (Priority: P4)

**Goal**: Directors/Interventors can view full activity history and export to PDF/Excel

**Independent Test**: Create and approve a CO, view its history timeline, export list to PDF and Excel.

### Implementation for User Story 4

- [ ] T029 Create `src/components/change-orders/ChangeOrderHistory.tsx` — timeline component showing all history entries with action, user, date, comments
- [ ] T030 Wire history into CO detail view — expandable section in ChangeOrderCard or modal
- [ ] T031 [P] Implement PDF export using existing jsPDF + jsPDF-AutoTable — project header, CO table, approval section, formatted for printing
- [ ] T032 [P] Implement Excel export using existing xlsx (SheetJS) — columns for all CO fields
- [ ] T033 Add export buttons to ChangeOrdersScreen toolbar (visible to Admin/Director/Interventor)

**Checkpoint**: All four user stories complete — full feature with history and export

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Integration, edge cases, and quality

- [ ] T034 Update `src/components/reports/ReportsFinanciero.tsx` — add Change Orders section showing approved cost impacts
- [ ] T035 [P] Add Change Orders section to ProjectDetailScreen — tab showing COs for that project
- [ ] T036 Test full workflow on mobile/WebView — create CO, approve, filter, export
- [ ] T037 Handle edge cases: duplicate approval attempt, project deletion with COs, budget overflow warning
- [ ] T038 Verify offline behavior — create CO offline, sync when back online
- [ ] T039 Code cleanup — remove console.logs, verify Spanish strings, check touch targets

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — MVP
- **US2 (Phase 4)**: Depends on US1 (needs existing COs to approve)
- **US3 (Phase 5)**: Depends on Phase 2 (can start in parallel with US1/US2 for list/view)
- **US4 (Phase 6)**: Depends on US1+US2 (needs COs with history to display/export)
- **Polish (Phase 7)**: Depends on all user stories

### Parallel Opportunities

- T002, T003, T005 can run in parallel (different files)
- T009, T010 can run in parallel (different component files)
- T031, T032 can run in parallel (PDF vs Excel export)

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1: Setup (types + Firestore rules + data layer)
2. Complete Phase 2: Foundational (navigation + screen shell)
3. Complete Phase 3: User Story 1 (create + submit)
4. **STOP and VALIDATE**: Test creating a CO end-to-end
5. Can deploy — users can already document changes formally

### Full Feature
1. Setup → Foundation → US1 → US2 → US3 → US4 → Polish
2. Each phase adds value without breaking previous phases
