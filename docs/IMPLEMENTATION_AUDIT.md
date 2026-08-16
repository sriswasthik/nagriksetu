# CityTrace — Implementation Audit

Audit of `main` at `529fae7` (the merge of PR #2 into `main`).
Read-only audit: no feature work, no UI changes, no architectural changes.

> **Partly superseded.** This is a dated audit, kept as the record of what
> `529fae7` looked like. The Supabase integration work has since resolved
> the RLS gap below and everything that followed from it: all fourteen
> tables now have policies, `workOrders.ts` and `analytics.ts` are
> Supabase-backed, `src/lib/mock` and `DemoDataNotice` are gone, and the
> assignment mutation and status sync both exist. See
> [`supabase/README.md`](../supabase/README.md) and
> `./supabase/tests/run.sh`.
>
> Two findings in this document were **wrong in the safe direction** and
> are worth reading against what was actually found later: the schema was
> not quite complete (nothing created the storage bucket, and
> `storage.objects` had zero policies), and "nothing is over-exposed" did
> not hold — a citizen could forge a supervisor's verdict on the shared
> `verifications` row.
>
> The **Phase 0 security items are now closed** by the auth-hardening
> work: route protection, the unauthenticated debug route (deleted), the
> constant-password path in `authService` (deleted), and the
> `user_metadata.role` fallback (removed). That work also found something
> this audit missed — the `proxy.ts` it recommended adding checks to was
> at the repository root while the app lives in `src/app`, so Next.js
> never loaded it and sessions were never refreshed either. See
> [Roles and authorization](../README.md#roles-and-authorization).

## The single most important finding

**The database schema is complete. The RLS policies are not.**

All 14 tables exist (`work_orders`, `wards`, `departments`, `notifications`,
`ai_analysis`, `verifications`, `resolution_proofs`, `work_order_updates`,
`audit_logs`, `duplicate_clusters`, `duplicate_cluster_members`, plus
`profiles`, `complaints`, `complaint_media`). All 14 have RLS **enabled**.

But only **three** have any policies at all:

| Table | RLS | Policies | Effective access |
|---|---|---|---|
| `profiles` | on | 2 (select/update own) + role-change trigger | works |
| `complaints` | on | 4, all `Citizens can …` | citizen-only |
| `complaint_media` | on | storage + table policies | works |
| `work_orders` | on | **none** | **deny-all** |
| `wards` | on | **none** | **deny-all** |
| `departments` | on | **none** | **deny-all** |
| `notifications` | on | **none** | **deny-all** |
| `ai_analysis` | on | **none** | **deny-all** |
| `verifications` | on | **none** | **deny-all** |
| `resolution_proofs` | on | **none** | **deny-all** |
| `work_order_updates` | on | **none** | **deny-all** |
| `audit_logs` | on | **none** | **deny-all** |
| `duplicate_clusters` | on | **none** | **deny-all** |
| `duplicate_cluster_members` | on | **none** | **deny-all** |

RLS enabled with zero policies denies every request, including reads. Two
consequences follow, and they explain almost every gap in this audit:

1. **The officer and government flows cannot use real data**, because
   `work_orders`, `wards` and `departments` are unreachable. That is why
   `workOrders.ts` and `analytics.ts` read from `src/lib/mock` — the mocks
   are a symptom, not the disease. Rewriting those services against Supabase
   before adding policies would produce empty screens, not working features.
2. **No staff role can read complaints.** Every `complaints` policy is
   scoped to `citizen_id = auth.uid()`. There is no `officer`,
   `supervisor` or `government_admin` read path, so even the citizen data
   that *is* real is invisible to the roles that must act on it.

Nothing is over-exposed: no table was found RLS-enabled-but-unprotected. The
problem is under-permissioning, which is the safer failure direction.

## Completion matrix

State codes: **1** real data · **2** partly mocked · **3** UI-only ·
**4** service-only · **5** broken · **6** missing · **7** security risk ·
**8** untestable without config.

### Citizen flow

| Feature | State | Files | What is missing | Dependencies | Pri | How to verify |
|---|---|---|---|---|---|---|
| Register | 1 | `app/auth/register/page.tsx`, `services/auth.ts` (`signUp`) | Nothing. Trigger hardcodes role `citizen`, so metadata cannot escalate | Supabase auth | — | Register, then `select role from profiles` → `citizen` |
| Login + role redirect | 1 | `app/auth/login/page.tsx`, `services/auth.ts` (`signIn`, `getCurrentProfile`) | Nothing | Supabase auth | — | Log in as each role, confirm landing route |
| Password reset | 6 | `app/auth/login/page.tsx` | Button only shows a toast; no reset flow | Supabase recovery email | P1 | Click "Forgot password?" — nothing is sent |
| Create complaint | 1 | `app/citizen/report/page.tsx`, `services/complaints.ts` (`createComplaint`) | Nothing | `complaints` RLS | — | Submit, then `select * from complaints` |
| GPS / location | 1 | `services/geolocation.ts`, `components/map/LocationPicker.tsx` | Nothing. Reverse-geocode failure falls back to raw coordinates | BigDataCloud (keyless) | — | Submit with GPS; check `latitude`/`longitude` |
| Category selection | 2 | `components/report/CategoryPicker.tsx` | Picker offers 10 categories; the DB enum has 6, so 4 collapse to `other`. AI keeps the finer value in `ai_category` | `complaint_category` enum | P1 | Report "Noise Pollution" → row shows `other` |
| Evidence upload | 1 | `services/complaints.ts` (`uploadComplaintEvidence`), migration `…093815` | Nothing. Storage policies exist; cleans up on failure | Storage bucket | — | Upload, check bucket + `complaint_media` |
| Tracking number | 1 | `services/complaints.ts` (`generateComplaintNumber`) | Generated client-side as `NS-<year>-<6 digits>`; no uniqueness constraint, so a collision is possible but unlikely | — | P2 | Submit; confirm number on confirmation screen |
| AI analysis | 2 | `services/ai.ts` (1295 lines) | **Keyword rule engine, not a model** — `AI_MODEL_NAME = "citytrace-mock-ai-v2"`, self-described "MOCK AI ENGINE". Writes real columns on `complaints` | `complaints` | P1 | Submit "pothole"; check `ai_category`, `priority_level` |
| Department routing | 5 | `services/ai.ts` ~L987 | Looks up `departments`, which is deny-all. Error is caught and warned, so `department_id` silently stays **null** — complaints are never routed | `departments` RLS | **P0** | Submit; `department_id` is null and console warns |
| Complaint status + timeline | 1 | `app/citizen/complaints/[id]/page.tsx`, `lib/design/status.ts` | Nothing. Timeline derives from real `status` | `complaints` | — | Change `status` in SQL, reload |
| Notifications | 2 | `app/citizen/notifications/page.tsx`, `components/shared/NotificationPanel.tsx` | Derived from complaint statuses. The `notifications` table exists but is deny-all; read state is session-only | `notifications` RLS | P1 | Submit a complaint; entry appears without a `notifications` row |
| Nearby issues map | 2 | `app/citizen/map/page.tsx` | Shows **only the user's own** reports; no area-scoped public feed exists. Labelled in-app | `complaints` RLS | P1 | Open map with two accounts — no overlap |
| Reopen complaint | 4 | `services/complaints.ts` (`reopenComplaint`) | Service exists and is exported; **no UI calls it** | `complaints` | P1 | `grep -r reopenComplaint src/app` → no hits |
| Profile | 3 | `components/shared/ProfileView.tsx` | Read-only by design; no update service | — | P2 | Open profile — no editable field |

### Officer flow

| Feature | State | Files | What is missing | Dependencies | Pri | How to verify |
|---|---|---|---|---|---|---|
| Login | 1 | `app/auth/login/page.tsx` | Nothing; accounts provisioned manually | Supabase auth | — | Log in with an `officer` profile |
| See assigned work orders | 2 | `services/workOrders.ts`, `mock/workOrders.ts` | Entirely mock; in-memory array. `work_orders` is deny-all | `work_orders` RLS | **P0** | Restart server — edits vanish |
| Inspect complaint | 2 | `app/officer/work-orders/[id]/page.tsx` | Renders mock work order, not the linked real complaint | `work_orders`, `complaints` RLS | **P0** | Open `WO-1024` — not in DB |
| Accept / start / submit proof | 2 | `app/officer/work-orders/[id]/page.tsx`, `services/workOrders.ts` (`updateWorkOrderStatus`) | State machine and gating are correct, but writes to memory. `resolution_proofs` deny-all, so proof photos are never persisted | `work_orders`, `resolution_proofs` | **P0** | Advance a status, reload — reverts |
| Complaint status sync | 5 | `services/workOrders.ts` L57-66 | The complaint-status sync is **commented out** — advancing a work order never updates the complaint the citizen sees | `complaints` write policy for staff | **P0** | Read the commented block |
| Resolve / verification | 6 | — | No supervisor verification UI; `verifications` deny-all | `verifications` RLS | P1 | No route exists |
| Profile | 3 | `app/officer/profile/page.tsx` | Shared read-only view | — | P2 | Open page |

### Government / authority flow

| Feature | State | Files | What is missing | Dependencies | Pri | How to verify |
|---|---|---|---|---|---|---|
| Login | 1 | `app/auth/login/page.tsx` | Nothing | Supabase auth | — | Log in as `government_admin` |
| Live complaint volume | 2 | `app/government/page.tsx`, `services/analytics.ts`, `mock/analytics.ts` | All figures mock (12,450 complaints etc.). Labelled with `DemoDataNotice` | staff read policy on `complaints` | **P0** | Numbers identical on every reload |
| Issue queue | 2 | `app/government/complaints/page.tsx` | Reads mock work orders. Triage/sort/filter logic is real | `work_orders` RLS | **P0** | Queue shows `WO-…` ids only |
| Assign to officer | 6 | `app/government/complaints/page.tsx` | Displays assignment state; **no assign mutation exists** in any service | `work_orders` write policy | **P0** | No assign control in the UI |
| Departments | 2 | `app/government/departments/page.tsx` | Mock; `departments` deny-all though the table is seeded | `departments` RLS | P1 | Compare page with table contents |
| Wards | 2 | `app/government/wards/page.tsx` | Mock; `wards` deny-all | `wards` RLS | P1 | As above |
| Geographic hotspots | 2 | `app/government/map/page.tsx` | Plots mock work-order coordinates | `work_orders` RLS | P1 | Markers match mock fixtures |
| Resolution analytics | 2 | `app/government/analytics/page.tsx`, `charts/chartTheme.tsx` | Charts and theming are real; data is mock. Trend series is seeded pseudo-random | staff read policy | P1 | Values stable across reloads |
| SLA monitoring | 2 | `components/shared/SLAIndicator.tsx` | Computed from mock `slaHoursRemaining`; `sla_due_at` exists on `complaints` but is unused | `complaints` | P1 | Compare indicator with `sla_due_at` |

### Cross-cutting

| Feature | State | Files | What is missing | Dependencies | Pri | How to verify |
|---|---|---|---|---|---|---|
| Route protection | **7** | `proxy.ts` | Only calls `supabase.auth.getClaims()` to refresh the session. **No authentication or role check.** Any anonymous visitor can load `/government`, `/officer` | — | **P0** | Open `/government` logged out — page renders |
| Debug API route | **7** | `app/api/test-supabase/route.ts` | Unauthenticated `GET` that queries `profiles` and returns raw Supabase error text | — | **P0** | `curl /api/test-supabase` |
| Legacy `authService` | **7** | `services/auth.ts` L128-220 | Parallel auth path with hardcoded constant passwords (`"placeholder-no-passwords-in-citytrace"`) and a legacy-email retry. Any account created this way shares one guessable password | — | **P0** | Read L128-150 |
| Client role fallback | **7** | `services/auth.ts` L165, L207 | Falls back to `user_metadata.role`, which is **user-writable at signup**. If the `profiles` read fails, a self-declared role is trusted client-side | — | **P0** | Sign up with `role: "government_admin"` in metadata |
| Env configuration | **8** | `supabase/client.ts`, `server.ts`, `proxy.ts` | Only two vars used, both `NEXT_PUBLIC_*`; no `.env.example` existed before this audit | — | P1 | Unset vars → pages show error states |
| Design system | 1 | `app/globals.css`, `lib/design/*` | Complete and consistent | — | — | Build and inspect |
| Accessibility | 1 | shell, `FilterChips`, badges | Skip link, focus rings, radiogroup keyboard nav, reduced-motion all verified | — | — | Tab through; audit script |
| Migration filename | 2 | `…130845_add_ai_analysis_to_complaints.sql.sql` | Double `.sql` extension. **Not renamed** — Supabase tracks applied migrations by filename | — | P2 | `ls supabase/migrations` |

## Blockers

1. **RLS policies for staff roles** — blocks every officer and government
   feature. Nothing downstream can be built on real data until this exists.
2. **No assignment mutation** — complaint → work order → officer is the
   spine of the product and has no write path.
3. **Work-order/complaint status sync is commented out**, so the two halves
   of the workflow cannot stay consistent.
4. **No Supabase project reachable from CI/containers** — env vars absent, so
   every Supabase path is unverifiable here; findings above are from code and
   migration reading, not live runs.

## Recommended implementation order

**Phase 0 — security (P0, before any demo)**
1. Add authentication + role checks to `proxy.ts`; redirect unauthorised
   users away from `/officer` and `/government`.
2. Delete or authenticate `app/api/test-supabase/route.ts`.
3. Remove the legacy `authService` constant-password path, or gate it behind
   an explicit env flag; migrate callers to `signIn`/`getCurrentProfile`.
4. Stop falling back to `user_metadata.role`; treat a missing profile as an
   error, since `profiles.role` is the only trustworthy source.

**Phase 1 — unblock real data (P0)**
5. Write RLS policies for `work_orders`, `departments`, `wards`,
   `notifications`, `resolution_proofs`, `work_order_updates`,
   `verifications`, plus staff read policies on `complaints`.
6. Fix the `departments` lookup in `ai.ts` so routing populates
   `department_id`.

**Phase 2 — real officer/authority flows (P0/P1)**
7. Replace `services/workOrders.ts` mock store with Supabase queries.
8. Add the assignment mutation and expose it in the government queue.
9. Re-enable complaint-status sync on work-order transitions.
10. Persist proof uploads to `resolution_proofs`.

**Phase 3 — real analytics (P1)**
11. Replace `services/analytics.ts` with aggregate queries or SQL views.
12. Derive SLA state from `complaints.sla_due_at`.

**Phase 4 — completeness (P1/P2)**
13. Wire the existing `reopenComplaint` service to the citizen UI.
14. Password reset; `notifications` table + realtime; supervisor
    verification UI; area-scoped public map feed.
15. Reconcile the 10-item category picker with the 6-value DB enum.

## Mock/demo data to remove or keep marked

| Path | Consumed by | Action |
|---|---|---|
| `src/lib/mock/workOrders.ts` | `services/workOrders.ts` | Remove at Phase 2 |
| `src/lib/mock/analytics.ts` | `services/analytics.ts` | Remove at Phase 3 |
| `src/lib/mock/departments.ts` | `mock/analytics.ts`, `constants.ts` | Replace with `departments`/`wards` |
| `src/lib/mock/users.ts` | nothing | **Already dead — safe to delete** |
| `services/ai.ts` keyword engine | complaint triage | Keep, but rename so "AI" is not overstated |

Every mock-backed screen already renders `DemoDataNotice`. That labelling
must stay until the underlying service is real — unlabelled sample figures on
an operations dashboard read as real municipal statistics.

## Already complete — do not rework

- Citizen registration, login and role-based redirect
- Complaint creation, GPS capture, reverse geocoding with fallback
- Evidence upload to Storage, including failure cleanup
- Complaint status model and the citizen tracking timeline
- The CityTrace design system, app shell, navigation and responsive layout
- Accessibility behaviour (skip link, focus, keyboard nav, reduced motion)
- `profiles` RLS and the role-change protection trigger
- Chart theming and the shared status/priority system

## Verification performed

- Read every file in scope: `package.json`, `README.md`, `CLAUDE.md`,
  `AGENTS.md`, all of `src/app`, `src/components`, `src/lib/services`,
  `src/lib/supabase`, `src/types`, `src/config`, `proxy.ts`, all six
  migrations, and `src/lib/mock`.
- Cross-referenced every `create table` / `enable row level security` /
  `create policy` statement to produce the RLS table above.
- Traced `.from("…")` calls in each service to the tables they touch.
- Enumerated `process.env` usage: only
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `npm run lint` and `npm run build` — see the PR for results.

**Not verified:** anything requiring a live Supabase project. No credentials
are available in this environment, so all Supabase findings come from reading
code, migrations and policies. They should be confirmed against a real
project before the P0 work is signed off.
