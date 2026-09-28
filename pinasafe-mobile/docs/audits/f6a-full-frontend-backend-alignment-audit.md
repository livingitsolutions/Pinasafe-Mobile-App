# PinaSafe F6A — Full Frontend/Backend Alignment and UX Audit

## 1. Executive summary

This audit covers canonical commit `bd33b397aef895f7e5692d872740459eb9edb38d`. The baseline worktree was clean. The checkout is **not a monorepo**: it contains the Expo frontend but no `pinasafe-backend` source, route registration, controllers, validation schemas, persistence code, or migrations. Consequently, the authoritative backend route count discoverable from this repository is **0**. The frontend references **47 distinct assumed HTTP method/path contracts**, but their authentication, authorization, tenant isolation, validation, status codes, lifecycle rules, storage behavior, and database mappings cannot be certified from authoritative backend source. That missing source is itself the primary audit blocker; this report does not infer undocumented backend behavior.

The frontend exposes **23 active route/screen files** (excluding five layouts). It has useful F5/F6 foundations: explicit API configuration, structured errors, central session expiry handling, role-shell guards, durable server-classified camera evidence, dedicated admin dispatch, constrained responder transitions, and the PR #10 personnel invitation completion flow. However, the product remains a mixture of backend-backed flows and prototype behavior. TypeScript currently fails with 23 errors, lint fails, forgot-password is fabricated, emergency call history is hard-coded, client-only organization dispatch simulation remains active code, direct external AI classifier code remains, and sensitive operational data is logged.

Priority totals are **8 P0, 15 P1, and 12 P2**. “P0” is reserved for security, authorization/data-integrity risk, or exhibit-critical blockers. The modernization should proceed only after the authoritative backend repository/contracts are made available and reconciled.

## 2. Exact audited commit and scope

- Required and audited HEAD: `bd33b397aef895f7e5692d872740459eb9edb38d`
- Initial worktree: clean (`git status --short` emitted no entries)
- Branch-name inspection: unavailable and, per the updated instruction, not blocking
- Source scope present: Expo Router frontend, services, contexts, utilities, components, tests, static assets
- Source scope absent: authoritative backend, database schema/migrations, storage configuration, deployment redirects/headers, service configuration
- Production/external access: none
- Application source modifications: none
- Sole requested artifact: this report

## 3. Backend endpoint inventory

### 3.1 Authoritative result

No active backend source exists in this checkout. Therefore **0 backend routes are authoritatively inventoried**. For all rows below, auth, roles, organization restrictions, validation, status codes, preconditions, and response schemas are **unverified** unless the frontend encodes an expectation. The “source” is the frontend assumption, not an authoritative backend file.

### 3.2 Frontend-assumed HTTP contracts (47)

All paths are prefixed with `${EXPO_PUBLIC_API_URL}/api` by `services/apiService.ts`. Bearer authentication is attached whenever a token is locally present, including public calls. `services/apiService.ts:29-33` identifies login, registration, and invitation acceptance as public only for 401 session-expiry behavior.

| Domain | Method and path | Frontend request / expected response | Current consumer and evidence | Backend verification |
|---|---|---|---|---|
| Auth | `POST /auth/login` | `{email,password}` → `{user,token,mustChangePassword?}` | login/Auth context; `services/apiService.ts:205-218` | unavailable |
| Auth | `POST /auth/register` | `{email,password,name,phone?,address?}` → login-shaped result | signup/Auth context; `services/apiService.ts:220-238` | unavailable |
| Invitation | `POST /auth/personnel-invitations/accept` | `{token,password}` → optional message | public acceptance screen; `services/apiService.ts:240-248` | unavailable |
| Auth | `POST /auth/logout` | no body | Auth context; `services/apiService.ts:250-257` | unavailable |
| Auth | `POST /auth/refresh` | no body → `{token}` | client exists but no active screen use; `services/apiService.ts:264-275` | unavailable |
| Auth | `POST /auth/change-password` | `{newPassword}` | forced-change screen; `app/(auth)/change-password.tsx:32-34` | unavailable |
| Users | `GET /users/profile` | user, `{user}`, or `{data:user}` tolerated | session restore/profile; `services/apiService.ts:277-280`, `contexts/AuthContext.tsx:482-488` | unavailable |
| Users | `PUT /users/profile` | arbitrary update; arbitrary result | client method/profile component assumption; `services/apiService.ts:282-287` | unavailable |
| Users | `GET /users?[page,limit,role,verified]` | array/wrapper | admin client; `services/apiService.ts:505-514` | unavailable |
| Reports | `POST /emergency-reports` | road/fire description, location, coordinates/contact, priority, `uploadSessionId` | citizen report; `services/apiService.ts:289-295` | unavailable |
| Reports | `GET /emergency-reports?[filters]` | report list/wrapper | emergency context, all personas; `services/apiService.ts:341-344` | unavailable |
| Reports | `PUT /emergency-reports/:id` | `{status,notes?}` or responder `{status}` | context/responder lifecycle; `services/apiService.ts:346-365` | unavailable |
| Dispatch | `POST /emergency-reports/:id/assign-team` | `{teamId}` → dispatched report with assigned team | admin incidents; `services/apiService.ts:367-381` | unavailable |
| Evidence | `POST /evidence/sessions` | `{}` → `{data:{id,status,expiresAt}}` | citizen report; `services/apiService.ts:297-299` | unavailable |
| Evidence | `POST /evidence/sessions/:id/image` | multipart field `image`, JPEG default → classification/evidence id | citizen report; `services/apiService.ts:301-339` | unavailable |
| Calls | `POST /emergency-calls` | service/call metadata | client method; `services/apiService.ts:383-398` | unavailable |
| Calls | `GET /emergency-calls/user` | call array | dead context path; `services/apiService.ts:400-402` | unavailable |
| Alerts | `GET /alerts` | alert array | context/client; `services/apiService.ts:404-407` | unavailable |
| Alerts | `POST /alerts` | alert fields | dead/partial context; `services/apiService.ts:409-422` | unavailable |
| Alerts | `PUT /alerts/:id/dismiss` | no body | dead/partial context; `services/apiService.ts:424-428` | unavailable |
| Organizations | `GET /organizations` | `{data:[organization]}` expected by service | organization service; `services/apiService.ts:430-433` | unavailable |
| Organizations | `GET /organizations/readiness` | readiness array/wrapper | dashboards/dispatch; `services/apiService.ts:561-564` | unavailable |
| Personnel | `GET /personnel` | `{data:[personnel]}` | admin personnel; `services/personnelService.ts:69-77` | unavailable |
| Personnel | `POST /personnel` | user/personnel fields | duplicate clients; `services/personnelService.ts:79-87`, `services/apiService.ts:439-457` | unavailable |
| Invitations | `POST /personnel/invitations` | invite fields → token-bearing invitation | PersonnelManagement; `services/personnelService.ts:89-99` | unavailable |
| Personnel | `PUT /personnel/:id` | mutable contact/address/role/active fields | admin personnel; `services/personnelService.ts:101-109` | unavailable |
| Personnel | `DELETE /personnel/:id` | no body | admin personnel; `services/personnelService.ts:111-117` | unavailable |
| Personnel | `GET /personnel/rescue-members` | personnel array | client method; `services/personnelService.ts:120-128` | unavailable |
| Personnel | `GET /personnel/by-user/:userId` | personnel/null | client method; `services/personnelService.ts:130-138` | unavailable |
| Statistics | `GET /stats/emergency` | totals, active, resolved today, average response | dashboard; `services/apiService.ts:467-475` | unavailable |
| Clusters | `GET /clusters/my-clusters` | cluster array | context; `services/apiService.ts:477-480` | unavailable |
| Clusters | `GET /clusters/:id/info` | cluster | admin incidents; `services/apiService.ts:482-484` | unavailable |
| Clusters | `GET /clusters/:id/updates` | update array | context; `services/apiService.ts:486-488` | unavailable |
| Clusters | `POST /clusters/:id/updates` | `{message,status}` | admin incidents; `services/apiService.ts:490-499` | unavailable |
| Clusters | `GET /clusters/statistics` | arbitrary statistics | admin incidents; `services/apiService.ts:501-503` | unavailable |
| Location | `POST /location-tracking/start/:emergencyId` | latitude/longitude/accuracy | location service; `services/apiService.ts:517-528` | unavailable |
| Location | `PUT /location-tracking/update/:emergencyId` | coordinates/speed/heading/accuracy/ETA | location service; `services/apiService.ts:530-545` | unavailable |
| Location | `POST /location-tracking/stop/:emergencyId` | no body | location service; `services/apiService.ts:547-551` | unavailable |
| Location | `GET /location-tracking/emergency/:emergencyId` | responder locations | live map; `services/apiService.ts:553-555` | unavailable |
| Location | `GET /location-tracking/team/:teamId` | locations | client only; `services/apiService.ts:557-559` | unavailable |
| Teams | `GET /teams` | array or `{data:[team]}` | admin/responder; `services/apiService.ts:566-569` | unavailable |
| Teams | `GET /teams/:id` | team | team service; `services/apiService.ts:571-573` | unavailable |
| Teams | `POST /teams` | name, leader, description | TeamManagement; `services/apiService.ts:575-580` | unavailable |
| Teams | `PUT /teams/:id` | name, leader, description, active | TeamManagement; `services/apiService.ts:582-587` | unavailable |
| Teams | `DELETE /teams/:id` | no body | TeamManagement; `services/apiService.ts:589-593` | unavailable |
| Membership | `POST /teams/:teamId/members` | `{userId}` | TeamManagement; `services/apiService.ts:595-600` | unavailable |
| Membership | `DELETE /teams/:teamId/members/:memberId` | no body | TeamManagement; `services/apiService.ts:602-606` | unavailable |

Health, authorized evidence retrieval, invitation list/reissue/revoke, and a backend-proxied AI classification route have no frontend contract and cannot be found authoritatively.

## 4. Backend lifecycle and invariant inventory

### Incident

Frontend tests and utilities encode `pending → dispatched → responding → resolved` (`utils/responderLifecycle.ts:3-20`). Admin dispatch uses only the dedicated assignment endpoint and expects `dispatched`; responders expose only dispatched→responding and responding→resolved. Admin UI no longer exposes responder transitions (`utils/adminDispatch.ts`, `app/(tabs-admin)/incidents.ts:304-319`). A responder 409 refreshes authoritative state without retry; 403 is presented as an assignment/permission failure (`utils/responderLifecycle.ts`, `__tests__/responderLifecycle.test.ts`).

Unverified backend invariants: exact actor per transition, organization ownership, active-team requirement, responder membership/assignment rule, leader behavior, stale-write implementation, who owns `resolved_at`, and forbidden transition response codes. The generic `updateEmergencyReportStatus(status:string)` remains callable and the cluster-update modal offers all four statuses, so type constraints do not protect every call site.

### Evidence

Observed frontend flow: create session; capture from camera; upload multipart `image`; accept server classification; require at least one accepted image and at most five accepted images; reject/retake locally; submit `uploadSessionId` with report (`app/(tabs-citizen)/emergency/report.tsx`, `utils/evidenceFlow.ts`). Web converts a camera URI to Blob; native supplies the RN multipart object. Session states expected are `active|bound`; classification expects accepted/label/confidence/status/action/reason/caption.

Unverified backend invariants: allowed MIME list, byte limit, dimensions, image count, classification thresholds, evidence-record creation, session expiry/abandonment cleanup, atomic report binding, private bucket/object keys, and authorized evidence retrieval. There is no evidence-viewing client endpoint or UI.

### Personnel and invitations

PR #10 issues via admin `POST /personnel/invitations`, immediately receives `invitationToken`, builds `/accept-personnel-invitation?token=…`, and exposes it for copying. Acceptance is public, requires an eight-character matching password, prevents duplicate submission, and maps 400 invalid, 409 unavailable, 410 expired (`components/PersonnelManagement.tsx`, `utils/personnelInvitation.ts`, `app/accept-personnel-invitation.tsx`). Success sends the user to login; it does not create a local session.

Unverified: admin/tenant authorization, pending invitation persistence, token hashing, expiry duration, reissue/revocation, single use, email binding, acceptance transaction, account/personnel creation, responder role assignment, and rescue-member team eligibility. The token-bearing response and URL create clipboard/history/referrer exposure risk.

### Teams

Frontend assumes create/update/delete, active state, optional leader, member add/remove, and nested member/user records (`services/teamService.ts`). It does not enforce rescue-member-only eligibility, same-organization membership, leader membership, uniqueness, active membership, or dispatch eligibility; those must be server invariants and are unverified.

### Auth

Frontend roles are `citizen|responder|admin|super_admin`. Login/register persist a bearer token in AsyncStorage. On authenticated 401, local session is cleared; 403 and 409 preserve it. Public endpoints are login/register/invitation acceptance. `mustChangePassword` routes login to change-password, but session restoration does not map/preserve that field and shell layouts do not enforce it. `super_admin` has no shell access because the admin guard accepts only `admin`, despite role-routing utility expectations. Backend JWT signing/expiry/refresh/revocation and exact 401/403 semantics are unavailable.

## 5. Database and domain map

No migrations, schema, ORM models, SQL, or backend persistence code exist here. No database connection was made. The following is only a **frontend-implied entity map**, not an authoritative schema:

| Implied entity | Implied identifiers/relations and lifecycle fields | Evidence |
|---|---|---|
| users | `id`, role, verified, optional organization/personnel/team ids | `contexts/AuthContext.tsx:354-368` |
| organizations | `id`, type, coverage, active flag | `services/organizationAlertService.ts:6-19` |
| personnel | `id`, `organization_id`, optional `user_id`, role, active, optional team | `services/personnelService.ts:3-29` |
| invitations | id/email/name/personnel role/expiry/token | `services/personnelService.ts:46-53` |
| teams | `id`, organization, leader, active, members | `services/teamService.ts:3-52` |
| emergency reports | id, reporter, organization, assigned team/responder, status, timestamps, location | `contexts/EmergencyContext.tsx` active interfaces/normalization |
| clusters/updates | cluster/report grouping, status updates/statistics | `services/apiService.ts:477-503` |
| alerts | type/priority/location/expiry/active | `contexts/EmergencyContext.tsx` |
| evidence sessions/evidence | session id/status/expiry; evidence id/classification; report binds session | `services/apiService.ts:69-87` |
| responder locations | emergency/team relation, coordinates, speed/heading/accuracy/ETA | `services/apiService.ts:517-559` |

Authoritative identifiers, foreign keys, tenant columns/policies, invitation hashes, evidence storage references, cascade behavior, and `resolved_at` ownership cannot be documented without backend source.

## 6. Frontend screen and route inventory (23 screens)

Route groups do not appear in public URLs. Five `_layout.tsx` files are guards/navigation, not counted as screens.

| Persona | Route → source | Purpose / backend use | State, gaps, and UX status |
|---|---|---|---|
| Public | `/` → `app/index.tsx` | splash/onboarding and role redirect | onboarding state is local; role redirect depends on AuthContext; super-admin mismatch |
| Public | `/login` → `app/(auth)/login.tsx` | login, forgot/signup links | backend login; must-change redirect; loading/error via alerts; desktop form unconstrained |
| Public | `/signup` → `app/(auth)/signup.tsx` | citizen registration/address | backend register; external PSGC/fallback location data; long mobile form; no server field errors |
| Public | `/forgot-password` → `app/(auth)/forgot-password.tsx` | reset request | **fabricated 2-second success**, no backend call |
| Authenticated | `/change-password` → `app/(auth)/change-password.tsx` | forced password change | assumed backend endpoint; guard absent; unused user; alert-dependent completion |
| Public | `/accept-personnel-invitation` → `app/accept-personnel-invitation.tsx` | PR #10 token/password acceptance | backend acceptance; SSR-safe query handling; 400/409/410 states; token in URL; success login CTA |
| Public | unknown → `app/+not-found.tsx` | 404 | static; lint error |
| Citizen | `/emergency-main` → `app/(tabs-citizen)/emergency-main.tsx` | emergency entry/active alert | organization alert service; external avatar; largely presentation/local state |
| Citizen | `/emergency` → `app/(tabs-citizen)/emergency/index.tsx` | emergency services/report entry | duplicated emergency concept; Hilongos DRRMO card; several “coming soon” actions |
| Citizen | `/emergency/report` → `app/(tabs-citizen)/emergency/report.tsx` | camera evidence + report | evidence session/upload/classification/report; strongest aligned flow; alert-only errors, no abandoned cleanup |
| Citizen | `/emergency/call-history` → `app/(tabs-citizen)/emergency/call-history.tsx` | call history | fully hard-coded calls, dates, durations/outcomes |
| Citizen | `/reported-emergency` → `app/(tabs-citizen)/reported-emergency.tsx` | own incident list/tracking | context-backed reports; client filtering; live location display; limited loading/error separation |
| Citizen | `/profile` → `app/(tabs-citizen)/profile.tsx` | profile | thin wrapper around shared ProfileScreen; mixed local/service behaviors |
| Admin | `/dashboard` → `app/(tabs-admin)/dashboard.tsx` | metrics/readiness/recent incidents | backend stats/readiness/reports, client computed data; response typing fails; dense prototype layout |
| Admin | `/incidents` → `app/(tabs-admin)/incidents.tsx` | command list, cluster details, dispatch/updates | backend reports/clusters/teams/assign; 409 refresh; modal-heavy, no private evidence viewing |
| Admin | `/users` → `app/(tabs-admin)/users.tsx` | personnel management | wrapper for PersonnelManagement; invitation URLs; not a true users view |
| Admin | `/teams` → `app/(tabs-admin)/teams.tsx` | team/member management | wrapper for TeamManagement; backend CRUD; destructive actions lack robust confirmations/states |
| Admin | `/profile` → `app/(tabs-admin)/profile.tsx` | profile | duplicate URL across group, intended persona differs; shared component |
| Responder | `/dispatch` → `app/(tabs-responder)/dispatch.tsx` | assignments and lifecycle | reports/teams/readiness; authoritative transition utility; loading variables unused; type failure |
| Responder | `/map` → `app/(tabs-responder)/map.tsx` | operational incident map | context + location endpoints; web is list-like rather than map; client ETA calculation |
| Responder | `/history` → `app/(tabs-responder)/history.tsx` | resolved history | context-derived; fake refresh timeout; field-name type failures; client average response metric |
| Responder | `/team` → `app/(tabs-responder)/team.tsx` | team/leader/member view | `GET /teams`, client selects by user/team; response typing fails |
| Responder | `/profile` → `app/(tabs-responder)/profile.tsx` | profile | same grouped URL duplication/shared component |

Grouped routes create three persona-specific `/profile` files, resolved inside guarded layouts, plus `/emergency-main` and hidden-stack `/emergency`; these are conceptually duplicated and make deep-link ownership unclear. Static export output already exists in `dist/` but was not treated as source.

## 7. Frontend ↔ backend gap matrix

Because backend source is absent, “aligned” means the frontend has a coherent, tested client assumption—not that the backend contract was independently proven.

| Capability | Class | Evidence and gap |
|---|---|---|
| Authentication/login | PARTIAL | central API/token/error handling; JWT semantics unavailable (`services/apiService.ts`, `contexts/AuthContext.tsx`) |
| Citizen registration | PARTIAL | backend call exists; address/location fallback and validation contract unverified (`app/(auth)/signup.tsx`) |
| Logout | PARTIAL | backend-first logout can trap local session on network failure (`contexts/AuthContext.tsx:566-585`) |
| Password change | PARTIAL | endpoint assumed; forced state lost on restore; no route guard (`app/(auth)/change-password.tsx`) |
| Forgot password | UNSUPPORTED BY BACKEND | fake delay and success (`app/(auth)/forgot-password.tsx:20-22`) |
| Personnel invitations | PARTIAL / SECURITY | issue and copy URL works; token exposure and server lifecycle unknown (`components/PersonnelManagement.tsx`, `utils/personnelInvitation.ts`) |
| Invitation acceptance | PARTIAL | tested public call and states; backend one-time/tenant guarantees unavailable (`app/accept-personnel-invitation.tsx`) |
| Admin dashboard | PARTIAL | APIs assumed; typecheck failure and mixed computed values (`app/(tabs-admin)/dashboard.tsx`) |
| Admin users/personnel | LEGACY FRONTEND / PARTIAL | users tab is personnel; duplicate personnel clients/shapes (`components/PersonnelManagement.tsx`, services) |
| Admin teams | PARTIAL | CRUD exists; eligibility/invariants unavailable (`components/TeamManagement.tsx`) |
| Membership/leadership | PARTIAL | client operations exist; tenant/eligibility/leader rules unavailable (`services/teamService.ts`) |
| Citizen emergency reporting | PARTIAL | durable submission exists; no backend source proof (`app/(tabs-citizen)/emergency/report.tsx`) |
| Camera evidence | ALIGNED (client assumption) | camera-only capture and multipart tests (`components/CameraCapture.tsx`, `__tests__/apiService.test.ts`) |
| AI classification | PARTIAL / SECURITY | report uses server classification, but direct external classifiers remain (`hooks/AIClassificationService.ts`, `services/AIClassificationService.ts`) |
| Evidence rejection/retake | ALIGNED (client assumption) | explicit states and retake (`app/(tabs-citizen)/emergency/report.tsx`) |
| Evidence session binding | PARTIAL | session id submitted; atomic binding/cleanup unavailable (`utils/evidenceFlow.ts`) |
| Incident submission | PARTIAL | uses report endpoint; response schema is `any` |
| Organization routing | LEGACY FRONTEND | hard-coded Hilongos mapping and client dispatch simulation (`services/organizationAlertService.ts:53-58,170-245`) |
| Admin incidents | PARTIAL | reports/clusters visible; evidence absent (`app/(tabs-admin)/incidents.tsx`) |
| Admin dispatch | ALIGNED (client assumption) | dedicated endpoint/team requirement/duplicate lock/409 refresh (`utils/adminDispatch.ts`) |
| Responder dispatch/lifecycle | PARTIAL | constrained transitions; assignment filtering depends on brittle shapes (`app/(tabs-responder)/dispatch.tsx`) |
| Responder map | PARTIAL | backend locations; web not a map and ETA is estimated client-side (`components/LiveTrackingMap.*.tsx`) |
| Incident history | PARTIAL | citizen/responder views exist; responder fields do not typecheck |
| Private evidence viewing | MISSING FRONTEND | no retrieval endpoint/client/screen anywhere |
| Alerts/notifications | LEGACY FRONTEND | mixed API code, local audio, timers, simulated acknowledgements (`organizationAlertService.ts`) |
| Clusters | PARTIAL | info/updates/stats assumed; context retains extensive legacy code |
| Profile | PARTIAL | shared UI, incomplete actions and loose response typing (`components/ProfileScreen.tsx`) |
| Organization data | PARTIAL / LEGACY | API load plus hard-coded routing/local mutations |
| Location handling | PARTIAL / PRIVACY | precise polling/tracking assumed; retention/consent unclear; console logging risk |
| Offline behavior | UNSUPPORTED BY BACKEND | network state model exists but no queue/cache/reconciliation; no supported offline workflow |
| Navigation/role routing | PARTIAL / DUPLICATED | shell guards good; super-admin conflict, duplicate concepts/routes |
| Error states | PARTIAL | structured API errors; many screens collapse to alerts/empty arrays |
| Empty/loading states | PARTIAL | inconsistent; several loading values unused and service errors converted to empty lists |

## 8. Legacy and fabricated behavior findings

### Active runtime defects

- `app/(auth)/forgot-password.tsx:20-22` fabricates a reset email after a timer.
- `app/(tabs-citizen)/emergency/call-history.tsx:8-39` displays fabricated call records, durations, dates, and outcomes.
- `services/organizationAlertService.ts:53-58` hard-codes Hilongos organization IDs; lines 170-245 create client-only dispatches, random delayed acknowledgements, and log personnel contacts.
- `hooks/AIClassificationService.ts:46-47` and `services/AIClassificationService.ts:237` call a hard-coded external Render classifier directly, bypassing the authoritative backend/evidence controls.
- `app/(tabs-citizen)/emergency-main.tsx:77` uses an external avatar URL.
- `services/philippineLocations.ts` falls back to Leyte-centric geography and uses a non-public env name in client code.
- `components/LiveTrackingMap.*.tsx` derives ETA from assumed speed; native may display route-provider duration. These are estimates, not guaranteed response times.
- Team fetch errors are swallowed into `[]` in `services/teamService.ts`, making failure look like empty state.
- `app/(tabs-responder)/history.tsx` uses a timer-only refresh and inconsistent snake/camel fields.

### Dead/obsolete code

- Hundreds of commented lines in `contexts/AuthContext.tsx`, `contexts/EmergencyContext.tsx`, `hooks/incidentClusteringService.ts`, and `services/AIClassificationService.ts` preserve Supabase/mock/older client logic.
- Duplicate AI services exist under `hooks/` and `services/`.
- Duplicate personnel/team methods exist in `apiService` and domain services with inconsistent signatures.
- Emergency-call API methods and portions of alert APIs appear unconsumed by active screens.

### Demo-only content

- “Feature Coming Soon” actions in `app/(tabs-citizen)/emergency/index.tsx` are explicit demo placeholders but should not ship in an emergency surface.
- Onboarding illustrations and static emergency education are legitimate exhibit presentation if clearly non-operational.

### Legitimate static presentation

- Icons, fonts, logo artwork, incident-type labels, validation helper text, and empty-state illustrations are not fabricated operational data.

No active fallback backend URL exists: `EXPO_PUBLIC_API_URL` is mandatory. Test/example URLs and documentation placeholders are not runtime defects.

## 9. Security and privacy findings

- JWT is stored in AsyncStorage (`services/apiService.ts:212-215`), which maps to script-readable browser storage on web; an XSS can exfiltrate it. Prefer secure, HttpOnly same-site session architecture for PWA or explicitly accept/document the risk.
- Bearer tokens attach to every request if present, including public invitation/login calls. Public 401 handling avoids logout but unnecessary credential transmission remains.
- Invitation token is in query string and copied URL (`utils/personnelInvitation.ts:12-29`), exposing it to history, screenshots, clipboard, analytics/referrers, and support logs. Clear/replace URL after capture and define backend one-use/expiry/hash guarantees.
- API logger prints full URL (`services/apiService.ts:147`); dynamic paths may include identifiers. Organization service logs organization arrays, personnel names, phone/radio, emergency location/details (`services/organizationAlertService.ts:92,225-235`). Remove operational PII logging.
- Direct AI calls send images outside the authoritative backend (`hooks/AIClassificationService.ts`, `services/AIClassificationService.ts`) with uncontrolled privacy/retention and bypass tenant authorization.
- No authorized private evidence retrieval path exists; do not expose bucket/public URLs as a workaround.
- Client role guards and permission arrays are UX only. Backend role/tenant enforcement cannot be verified. `super_admin` routing/guard behavior conflicts.
- 401 globally clears sessions only when a token was attached; 403/409 preserve session correctly. Several domain services swallow errors, defeating differentiated UX.
- Backend error strings are displayed to users (`ApiError.message`), which may leak internals unless backend sanitizes responses.
- Precise responder/citizen coordinates are repeatedly fetched/transmitted; no foreground disclosure, retention statement, precision policy, or “tracking active” control contract is demonstrated.
- Image URI/base64 is not directly logged in current upload path, but legacy AI services should be removed to prevent accidental logging/transmission.
- No client service-role or server secret appears in source. `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is intentionally public and must be platform/referrer restricted.

## 10. UX/UI audit

### Global

The app has recognizable persona colors (red citizen, purple admin, green responder), Quicksand assets, cards, and bottom tabs, but feels like separate prototypes. Typography, spacing, radius, shadows, form controls, button priorities, modal patterns, and status colors are repeatedly hand-coded. Most content is mobile-first without desktop max widths or navigation rails. Alerts are used as primary error/success UX; skeletons are absent. Empty and loading states vary, and swallowed failures become false empties. Touchable targets are often visually adequate but lack consistent minimum sizing, focus states, semantic labels, keyboard behavior, and web hover/focus treatment. Motion does not consistently observe reduced-motion preference.

### Public/auth

Onboarding is visually oriented but role/session transition logic dominates the root. Login/signup are long single-column forms; signup is especially heavy and region-specific. Password errors are modal, not inline. Forgot-password lies about success. Forced change-password lacks route enforcement after restore. Invitation acceptance is the best-authored public state machine, but needs token removal from the address bar, password show/hide/accessibility, clearer organization/inviter context (only if backend supplies it safely), and robust deep-link hosting.

### Citizen

There are two emergency entry concepts. The critical action should be singular: choose road/fire, capture evidence, see server classification, retake if rejected, supply concise details/location, review, and submit. Current report screen performs most of this but lacks step hierarchy, upload retry/offline explanation, consent/privacy copy, an explicit confirmation summary, and post-submit tracking CTA. Hard-coded call history and “coming soon” emergency actions undermine trust. Tracking should distinguish report status from responder live location availability.

### Admin

Dashboard and incidents are dense card grids better suited to a prototype phone than a desktop command center. A production admin surface needs a responsive rail/header, sortable incident table/list, persistent filters, side-panel detail, evidence authorization state, dispatch precondition explanations, clear stale-state recovery, and accessible dialogs. Personnel invitation copying is practical for an exhibit but should label token sensitivity and expiry. Users/personnel naming is misleading. Team eligibility and inactive-state effects need server-backed explanations.

### Responder

Dispatch correctly names “Start Responding” and “Mark Resolved,” but operational states are spread across dispatch and map. Assigned work, incident detail, navigation, and lifecycle action should form one coherent flow. Web “map” is a coordinate/list panel rather than a spatial map. ETA/distance should be labeled estimate/source/time or omitted. Team readiness appears even though fetch/loading fields are broken. History calculates performance client-side from inconsistent data and must not present authoritative response metrics.

## 11. Copy and terminology audit

- Hilongos-only claims/data: `app/(tabs-citizen)/emergency/index.tsx` and hard-coded organization IDs in `services/organizationAlertService.ts`.
- Leyte-only defaults/fallbacks: `services/philippineLocations.ts` and signup assumptions.
- Nationwide implication: the “PinaSafe” name and Philippine location picker can imply national coverage, but server organization discovery/coverage cannot be proven.
- Offline: no claim should say reports work offline; there is no durable queue or reconciliation.
- Real-time/live: “Live tracking active” and simulated alert acknowledgements overstate capability unless polling freshness/backend location guarantees are shown.
- ETA/distance: client-calculated estimates must not be called guaranteed arrival times or response time.
- Emergency services: unavailable “Call/Chat/Rescue” actions and local service listings must not imply backend dispatch or official integration.
- DRRMO/MDRRMO is inconsistent with generic “organization.” Canonical UI term: **Emergency Response Organization**, with official agency name (for example, MDRRMO) supplied by backend organization data.
- Canonical people term: **Responder** for authenticated operational users; **Personnel** for organization administration; **Rescue member** only for the backend personnel subtype/eligibility rule.
- Canonical work terms: **Incident** for an accepted report record; **Emergency report** for citizen submission; **Team assignment** / **Dispatch** for admin action; statuses exactly Pending, Dispatched, Responding, Resolved.

## 12. PWA and web audit

- Expo config uses `web.output: "static"`; 23 screens must be pre-render-safe. PR #10 utilities and organization alert constructor include SSR guards (`utils/clientRuntime.ts`).
- Camera uses Expo Camera; browser permission denial and unsupported-device states exist but need cross-browser UX and secure-context documentation.
- Browser multipart conversion is correctly covered by unit tests and sends a Blob as `image`.
- `EXPO_PUBLIC_API_URL` is mandatory and has no legacy fallback, which is correct. Misconfiguration fails at request time rather than an app-level readiness screen.
- No web manifest/service-worker/offline strategy is present beyond Expo-generated defaults; installability cannot be claimed.
- No Netlify redirect configuration is present, so refresh/deep links—including `/accept-personnel-invitation?token=…`—may 404 depending on static host behavior. Static export may emit route files, but deployment behavior is unverified.
- Grouped navigation URLs and three `/profile` files complicate deep-link expectations.
- Browser globals are mostly guarded; `window.location.origin` usage in invitation issuance must remain client-only. Organization service has an SSR test.
- Public API keys in Expo bundles are not secrets; map keys require origin/application restrictions.
- Existing `dist/` is a generated artifact and may be stale. Export was not run because environment policy forbids build commands.

## 13. Test coverage map

Existing: 9 suites / 57 tests, all passing.

| Workflow | Coverage | Missing |
|---|---|---|
| API base/error/session | strong unit coverage | component integration and refresh/logout failure UX |
| Role routing | utility coverage | layout rendering, super-admin, deep links, forced password restore |
| Invitation acceptance | controller/API/SSR-safe URL behavior | screen rendering, expired/revoked UI, history-token clearing, end-to-end issuance→acceptance |
| Citizen evidence | payload/count/duplicate and multipart units | camera component, permission denial, full submission, session expiry/abandonment, classification uncertainty |
| Admin dispatch | utility contract/duplicate controls | rendered incident/team selection, 403/409 screen behavior, inactive/ineligible teams |
| Responder lifecycle | transitions/body/duplicate/403/409 units | assignment filtering, rendered action states, concurrent devices |
| Private evidence | none | authorization, 401/403, expiry, broken image, download prevention expectations |
| Browser/SSR | client-runtime and organization constructor | static render of every route, camera page, acceptance deep link, refresh routing |
| Loading/empty/error | minimal | persona screens and service error-vs-empty differentiation |
| Accessibility | none | keyboard, focus, names, contrast, reduced motion, touch targets |

## 14. Target frontend information architecture

### Public

- `/` landing/readiness: **REFACTOR** root/onboarding; honest service coverage.
- `/login`: **KEEP/REFACTOR**.
- `/register`: **REFACTOR** signup after backend registration validation is known.
- `/forgot-password`: **DELETE** until backend supports it, then **ADD** contract-backed flow.
- `/change-password`: **KEEP/REFACTOR** as guarded forced-password route.
- `/invitations/personnel/accept`: **REFACTOR/MOVE** current acceptance route, preserving compatibility redirect only if hosting supports it.

### Citizen

- `/citizen/emergency`: **MERGE** `emergency-main` and `emergency/index` into one entry.
- `/citizen/reports/new/type`, `/evidence`, `/details`, `/review`: **REFACTOR/ADD** as one stateful workflow backed only by supported evidence/report contracts.
- `/citizen/reports`: **KEEP/REFACTOR** reported-emergency.
- `/citizen/reports/:id`: **ADD** backend-backed detail/tracking.
- `/citizen/profile`: **KEEP/REFACTOR**.
- Emergency call history: **DELETE** unless backend call contracts are confirmed and populated.

### Admin

- `/admin`: **REFACTOR** dashboard/readiness.
- `/admin/incidents`, `/admin/incidents/:id`: **REFACTOR/ADD** command list/detail with dispatch and authorized evidence slot.
- `/admin/personnel`: **RENAME/REFACTOR** current users tab.
- `/admin/invitations`: **ADD** only if backend supports list/revoke/reissue; otherwise keep issuance within personnel.
- `/admin/teams`, `/admin/teams/:id`: **KEEP/REFACTOR**.
- `/admin/profile`: **KEEP**.
- Cluster detail/update: **MERGE** into incident command center unless backend treats clusters as first-class operator objects.

### Responder

- `/responder/assignments`: **REFACTOR** dispatch into assigned active work only.
- `/responder/incidents/:id`: **ADD** detail with navigation, Start Responding, Mark Resolved.
- `/responder/map`: **MERGE/REFACTOR** into incident detail on mobile; retain operational map on wide screens if backend locations are confirmed.
- `/responder/history`: **KEEP/REFACTOR**, remove invented metrics.
- `/responder/team`: **KEEP/REFACTOR** read-only.
- `/responder/profile`: **KEEP**.

Delete direct classifier services, client dispatch simulation, fake call data, dead commented contexts, and duplicate service methods after contract reconciliation.

## 15. Target design system

- Typography: Quicksand or a verified highly legible UI family; 12 caption, 14 secondary/body-small, 16 body/control, 20 section, 24 page, 32 display; minimum 16 for critical operational content.
- Spacing: 4px base scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 8 controls, 12 cards, 16 dialogs/sheets; pills only for badges.
- Elevation: borders by default; one low card shadow and one dialog overlay level. Avoid stacked shadows.
- Status: Pending amber, Dispatched blue, Responding violet, Resolved green; pair color with icon/text. Error red, warning amber, info blue, success green.
- Severity: Critical red, High orange, Medium amber, Low slate; severity never substitutes for lifecycle status.
- Actions: one filled primary per decision region; outlined secondary; text tertiary; destructive red with explicit confirmation. Emergency initiation may use red without making all citizen actions red.
- Forms: persistent labels, hints before errors, inline field errors, summary/focus on submit, appropriate autocomplete/input modes, password controls, server error region.
- Modals/sheets: desktop modal or side panel; mobile bottom sheet only for reversible contextual tasks; full page for evidence/report/dispatch decisions.
- Empty states: distinguish no data, filtered-no-results, unavailable, unauthorized, and failed-to-load; provide one relevant action.
- Loading: skeleton lists/cards for fetches, determinate upload state, inline button progress, no content jumping.
- Width: public/auth 480–640px; operational detail 960px; command center 1200–1440px with fluid gutters.
- Breakpoints: compact `<640`, tablet `640–1023`, desktop `≥1024`; grids collapse by task priority, not simple equal columns.
- Navigation: bottom tabs only for 3–5 top-level compact destinations; desktop persistent rail/sidebar plus page header/breadcrumbs. Incident detail is nested, not a tab.
- Accessibility: WCAG 2.2 AA, 44×44 touch targets, visible focus, semantic roles/names, logical heading order, error announcements, keyboard-complete dialogs, contrast verified independent of color.
- Animation: 120–200ms functional transitions; never delay emergency actions; no celebratory or continuous motion in operational screens.
- Reduced motion: honor platform/web preference; replace transforms/parallax with fades or none; keep progress meaning available without animation.

## 16. P0 findings (8)

1. Authoritative backend/migrations are absent, so route, role, tenant, lifecycle, evidence privacy, and persistence alignment cannot be certified.
2. TypeScript fails with 23 errors across dashboard, team fetching, incident notifications, and responder history—blocking a trustworthy release/export baseline.
3. Direct external AI classifier code can transmit emergency images outside the authoritative evidence boundary.
4. Client organization dispatch simulation fabricates acknowledgements and logs personnel/emergency PII.
5. Invitation bearer token exposure through URL/clipboard lacks source-verifiable hashing, expiry, revocation, and one-use guarantees.
6. Private evidence retrieval/authorization has no frontend capability or discoverable contract; admin cannot safely inspect submitted evidence.
7. Forgot-password presents fabricated success in a security-sensitive account workflow.
8. Backend organization isolation and role authorization cannot be audited; client guards cannot provide security, and super-admin handling is inconsistent.

## 17. P1 findings (15)

1. Forced `mustChangePassword` is not preserved/enforced on restored sessions.
2. Logout requires backend success before clearing local credentials, trapping users during outage.
3. Citizen emergency entry is duplicated and contains unsupported “coming soon” actions.
4. Emergency call history is fabricated.
5. Team/personnel response wrappers are inconsistent and cause runtime/type ambiguity.
6. Admin incident view lacks private evidence and dedicated incident detail.
7. Team/member/leader eligibility and inactive-state behavior are not represented.
8. Responder assignment filtering is brittle and team loading state is unused.
9. Responder history uses wrong field names and invented/client-derived performance metrics.
10. Web map is not an operational map; ETA/distance are unlabeled estimates.
11. Failures are frequently swallowed into empty lists, obscuring outages/403s.
12. Location consent, freshness, precision, retention, and tracking stop semantics are unclear.
13. Static-host deep-link/refresh handling, particularly invitation acceptance, is unverified.
14. Alert/cluster contexts contain legacy and client-only behavior mixed with server state.
15. Signup geography and copy remain Leyte/Hilongos-centric despite broader product implications.

## 18. P2 findings (12)

1. Lint has 5 errors and 54 warnings.
2. Typography/spacing/radius/elevation are inconsistent.
3. Desktop max widths and navigation patterns are missing.
4. Skeletons and structured inline success/error states are scarce.
5. Alert dialogs are overused for routine feedback.
6. Three persona profile route files duplicate a shared destination model.
7. Accessibility labels, focus handling, keyboard dialogs, and announcements need systematic coverage.
8. Reduced-motion behavior is not defined.
9. Dead commented legacy code obscures active behavior.
10. Duplicate API/domain services increase contract drift.
11. External placeholder avatar creates unnecessary network/privacy dependency.
12. README remains generic Expo boilerplate and does not document supported workflows/PWA limits.

## 19. Dependency-ordered modernization plan

### F6B — Contract baseline, application shell, and design system

Goal: import/provide the exact backend commit or generated OpenAPI/schema, reconcile all 47 assumptions, establish route shell/tokens/components. Likely files: `services/apiService.ts`, `types/`, layouts, common components, Tailwind/global config. Dependencies: authoritative backend source. Acceptance: route/role/tenant matrix signed off; typecheck/lint pass; responsive persona shells and state primitives. Tests: contract adapters, shell guards, SSR route smoke tests, a11y basics. Risks: backend naming/response changes and hidden tenant rules.

### F6C — Authentication and invitation onboarding

Goal: honest login/register/logout/change-password and secure invitation completion. Files: auth routes, acceptance route, AuthContext, personnel invitation utility/service. Contracts: auth/profile/change-password/invitation issue+accept and any revoke/reissue. Dependencies: F6B session strategy and backend token lifecycle. Acceptance: forced-password survives restore; logout recovery defined; invitation token removed from browser URL; all 400/401/403/409/410 states. Tests: rendered routes, SSR/deep links, role routing, issuance→acceptance, security-state matrix. Risks: URL-token delivery and web storage.

### F6D — Citizen emergency workflow

Goal: one coherent road/fire evidence-first report journey. Files: citizen emergency routes, CameraCapture, evidence utilities/API/context. Contracts: evidence session/upload/classification/report binding/report create/list/detail. Dependencies: F6B/F6C and backend evidence limits. Acceptance: camera-only accepted evidence; rejection/retake; abandoned/session expiry handling; duplicate-safe submission; post-submit detail. Tests: browser/native multipart, permissions, full submission, 409/network failure, empty/history. Risks: camera compatibility, upload size, classifier latency.

### F6E — Admin command center

Goal: responsive authoritative incidents, clusters, details, and dispatch. Files: dashboard/incidents, EmergencyContext, admin layouts. Contracts: reports/stats/clusters/teams/assign-team. Dependencies: F6B, confirmed lifecycle/tenant rules, F6D data. Acceptance: pending-only dispatch to eligible active team; stale 409 refresh; no responder transitions; error vs empty distinct. Tests: 401/403/409, filters, concurrent dispatch, desktop/mobile layouts. Risks: cluster semantics and response wrappers.

### F6F — Teams and personnel management

Goal: backend-valid personnel, invitation, membership, leader, activation workflows. Files: PersonnelManagement, TeamManagement, domain services/types. Contracts: personnel/invitations/teams/members. Dependencies: F6C and authoritative eligibility rules. Acceptance: same-tenant eligible members only; leader rules visible; destructive confirmations; no duplicate clients. Tests: CRUD permissions, invalid/inactive member, 409, invitation lifecycle. Risks: invitation token delivery and destructive cascades.

### F6G — Responder operational workflow

Goal: assignment-focused incident detail, navigation, Start Responding, Mark Resolved. Files: responder dispatch/map/history/team, lifecycle utility, location service/maps. Contracts: assigned reports, transitions, team/location. Dependencies: F6E/F6F. Acceptance: only assigned eligible responders act; transitions exact; stale state recovers; location freshness shown; no fake metrics. Tests: 403/409/concurrency, assignment filters, polling cleanup, map fallback. Risks: battery/privacy and map provider availability.

### F6H — Private evidence viewing

Goal: authorized incident evidence for admin/responders only as backend permits. Files: new evidence service/viewer and incident details. Contracts: backend-authorized retrieval/signed access. Dependencies: backend endpoint/storage policy, F6E/G. Acceptance: tenant/role gated, expiring access, no public URLs/logs/cache leakage. Tests: 401/403/cross-tenant, expired link, broken media. Risks: browser caching and object URL lifecycle.

### F6I — History, profile, alerts, and supported workflows

Goal: finish only backend-supported history/profile/alert/organization features; delete fake calls. Files: history/profile/alert/cluster services and screens. Dependencies: prior domain flows and confirmed contracts. Acceptance: server-derived records/metrics only; honest unsupported-state removal. Tests: empty/loading/error/profile validation/alert authorization. Risks: temptation to preserve demo features.

### F6J — PWA, responsive, accessibility, and performance polish

Goal: installable/deep-link-safe static web plus production responsive/a11y quality. Files: Expo config, hosting redirects/config if in scope, all screens/design primitives. Dependencies: stable routes. Acceptance: direct refresh works; invitation links work; camera/multipart browsers tested; WCAG 2.2 AA; reduced motion; desktop/tablet/mobile review; no unsupported offline claim. Tests: static export, route crawl, Playwright/device matrix, axe/manual keyboard. Risks: static hosting rewrite and camera permissions.

### F6K — Regression and controlled production E2E

Goal: controlled, authorized end-to-end verification after local/staging gates. Dependencies: all phases and explicit production authority. Acceptance: citizen submit→admin dispatch→responder lifecycle→private evidence, invitation onboarding, tenant isolation, rollback/runbook. Tests: staging first, narrowly controlled production smoke with synthetic labeling and cleanup policy. Risks: emergency data/privacy; never run automatically from this audit.

## 20. Exhibit-critical path

1. Supply and pin the authoritative backend source/contract; resolve P0 contract uncertainty.
2. Make typecheck/lint/export green and establish responsive shells.
3. Complete login and personnel invitation acceptance with safe deep links.
4. Demonstrate citizen road/fire camera evidence → server classification → accepted evidence → bound incident.
5. Demonstrate admin authoritative incident detail → eligible team dispatch.
6. Demonstrate assigned responder Start Responding → Mark Resolved with 409 recovery.
7. Demonstrate authorized private evidence viewing only if backend retrieval exists.
8. Remove/disable fake forgot-password, fake calls, simulated dispatch/acknowledgements, direct AI, and unsupported claims before exhibit build.

## 21. Functionality that must NOT be claimed yet

- Full frontend/backend alignment or authoritative contract coverage
- Nationwide emergency-service coverage or automatic national agency routing
- Hilongos/Leyte coverage outside backend-proven organization data
- Offline emergency reporting or offline synchronization
- Real-time notifications, real-time dispatch acknowledgement, or guaranteed live tracking
- Guaranteed ETA, distance, or response-time metrics
- Working password recovery
- Official emergency calling/chat integration or persisted call history
- Secure/private evidence viewing
- Invitation revocation/reissue, guaranteed expiry, or one-time security until backend verified
- Cross-tenant isolation, role enforcement, or service-level authorization certification
- Installable PWA/deep-link reliability across the production host
- AI privacy, accuracy, or direct-classifier approval
- Super-admin frontend support

## 22. Validation results

| Check | Result |
|---|---|
| Jest | PASS — 9 suites, 57 tests, 0 failures |
| TypeScript (`npm run typecheck`) | FAIL — 23 errors: response wrapper misuse and responder history field mismatches |
| Lint (`npm run lint`) | FAIL — 59 findings: 5 errors, 54 warnings |
| `git diff --check` before report | PASS |
| Expo web export | NOT RUN — execution policy prohibits build commands; no production request was made |

Jest used mocked `example.com` URLs/fetch and did not contact external systems.

## 23. Git status confirmation

- Before audit: clean.
- Expected after artifact creation: only `docs/audits/f6a-full-frontend-backend-alignment-audit.md` is added (the environment-owned ignored `.netlify/results.md` summary is not application source).
- No frontend code, backend code, migrations, tests, configuration, generated build artifacts, or lockfiles were changed.
- No commit, push, PR, deploy, production API/database/storage request, or platform change occurred.
