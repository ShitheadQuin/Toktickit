# Lab 3 API spec

Base path: `/api`. All request and response bodies are JSON except attachment upload/download,
unchanged from Lab 2.

## 1. Conventions

**Identifying the current user.** Lab 3 replaces the `X-Requester-Id` header entirely with a
server-side session. Login sets a cookie named `sid` (HttpOnly, `SameSite=Lax`, `Secure` outside
local dev, ~12h sliding expiry). Every authenticated endpoint reads `sid`, looks up the session
row, and resolves the current user and role from it — never from anything the client claims in the
request body or a header.

**Missing/invalid session vs. wrong role vs. wrong resource — three different rejections:**
- No cookie, an unknown `sid`, or an expired session → `401 UNAUTHENTICATED`.
- A valid session whose role is not permitted for this endpoint at all (e.g. a Requester calling
  `/users`, or anyone calling an Internal Note endpoint who isn't IT Staff/Administrator) →
  `403 FORBIDDEN`. Nothing about a specific record is revealed.
- A valid session, permitted role, but the specific Ticket/Attachment belongs to someone else →
  `404 NOT_FOUND`, identical to a Ticket that doesn't exist (BR-12 — this is the point where Lab 3
  deliberately differs from Lab 2's `403`).
- A valid session whose `mustChangePassword` is still true, calling anything except
  `/auth/change-password`, `/auth/logout`, `/auth/me` → `403 FORBIDDEN` with code
  `PASSWORD_CHANGE_REQUIRED`.

**Error shape**, used on every non-2xx response, unchanged from Lab 2:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "summary is required" } }
```

**Timestamps** are ISO 8601 UTC strings, as in Lab 2.

## 2. Authentication

### `POST /api/auth/login`
Request:
```json
{ "email": "jane@toktickit.dev", "password": "Passw0rd" }
```
Validation order (first failure wins, per BR-06/BR-07 — same generic outcome either way so no
information leaks):
1. `email`/`password` present → else `400 VALIDATION_ERROR`
2. 5 failed attempts for this email in the last 15 minutes → `429 TOO_MANY_ATTEMPTS` (BR-08)
3. email matches an active user and password matches its hash → else `401 INVALID_CREDENTIALS`,
   message `"Invalid email or password."` for both an unknown email, a wrong password, **and** an
   inactive account (BR-06/BR-07). The password check always runs — against a dummy hash when the
   email isn't found — so step 3 takes the same time either way (BR-06).

Response `200`, and sets the `sid` cookie:
```json
{ "id": 12, "name": "Jane Lee", "email": "jane@toktickit.dev", "role": "IT_STAFF", "mustChangePassword": false }
```

### `POST /api/auth/logout`
No body. Deletes the session row if one exists and clears the cookie. Always `200 {}`, even if no
valid session was present — logout never errors (BR-11).

### `GET /api/auth/me`
Requires a session. Response `200`: same shape as login's response body. `401 UNAUTHENTICATED` if
no valid session.

### `POST /api/auth/change-password`
The one endpoint reachable while `mustChangePassword` is true. Request:
```json
{ "currentPassword": "Temp1234", "newPassword": "NewPassw0rd", "confirmPassword": "NewPassw0rd" }
```
Validation: `currentPassword` must match the stored hash → else `400 VALIDATION_ERROR`, code
`INCORRECT_CURRENT_PASSWORD`. `newPassword` 8–72 characters, at least one letter and one digit
(BR-10) → else `400 VALIDATION_ERROR`. `confirmPassword` must equal `newPassword` → else
`400 VALIDATION_ERROR`. On success: hashes and stores the new password, sets
`mustChangePassword: false`. Response `200`: updated user shape (same as login).

## 3. Requester Tickets & Attachments — carried over from Lab 2

Same paths as Lab 2: `POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id`,
`POST /api/tickets/:id/attachments`, `GET /api/attachments/:id`,
`GET /api/attachments/:id/download`, `DELETE /api/attachments/:id`. Restricted to role
`REQUESTER` (`403 FORBIDDEN` for IT Staff/Administrator — Lab 3 gives Staff their own Ticket Detail
in Section 4 instead).

**What changes from Lab 2:**
- `X-Requester-Id` header is gone. Ownership comes from the session (BR-03). `POST /api/tickets`
  no longer accepts `requesterId` in the body — even if sent, it is ignored.
- `GET /api/attachments/:id/download` no longer needs a `requesterId` query parameter either — the
  `sid` cookie is sent automatically on a plain `<a href>` navigation (unlike a custom header),
  so the Lab 2 workaround is no longer needed.
- **Ownership failures are now `404 NOT_FOUND`, not `403 FORBIDDEN`** (BR-12). A Ticket or
  Attachment that exists but belongs to a different Requester is indistinguishable from one that
  doesn't exist at all. This is the one behavior change to `server/tests/lab-02/ticket-detail.api.
  test.ts`, `attachments.api.test.ts`, and `client/tests/lab-02/RequesterTicketDetail.test.tsx` —
  they currently assert `403` and must be updated on purpose (see PR for Issue #35).
- `GET /api/tickets/:id` response gains `requesterConfirmedAt` (null until the Requester marks
  "problem appears resolved").
- New: `POST /api/tickets/:id/resolution-signal` — Requester only, must own the Ticket (else
  `404`). No body. Sets `requesterConfirmedAt` to now. Never changes `currentStatus` (BR-05).
  Response `200` with the updated Ticket.
- New: `POST /api/tickets/:id/comments`, `GET /api/tickets/:id/comments` — see Section 5.

## 4. IT Staff Ticket Queue & Ticket Detail

All endpoints in this section require role `IT_STAFF`. `403 FORBIDDEN` for Requester and
Administrator alike — Administrator's Ticket access is read-only via Section 5's `GET` endpoints
only (BR-04), never these.

### `GET /api/staff/tickets` — the Queue
```
GET /api/staff/tickets?search=laptop&status=OPEN&itPriority=HIGH&owner=unassigned&sort=createdAt&order=asc&page=1
```

| Parameter | Meaning | Default |
|---|---|---|
| `search` | matches ticket number, summary/description text, requester name/email (partial, case-insensitive) | none |
| `status` | exact match, one of the 8 statuses | none |
| `itPriority` | exact match | none |
| `owner` | a user id, or `unassigned` | none |
| `sort` | one of `createdAt`, `itPriority`, `status` | `createdAt` |
| `order` | `asc` or `desc` | `asc` |
| `page` | 1-based page number | `1` |

Page size is fixed at 20 (not client-selectable — the labsheet doesn't ask for that control, and a
fixed size keeps the contract simple). Invalid values for `sort`, `order`, or `page` fall back to
their default rather than erroring; an unmatched `status`/`itPriority`/`owner` simply yields zero
results — same split as Lab 2's query contract, for the same reason (a mistyped URL degrades to
sensible results, not a broken screen).

Response `200`:
```json
{
  "data": [
    {
      "id": 42,
      "ticketNumber": "TKT-2026-000042",
      "summary": "Laptop battery drains quickly",
      "requester": { "id": 3, "name": "Somchai Dee" },
      "currentStatus": "OPEN",
      "itPriority": "HIGH",
      "owner": { "id": 12, "name": "Jane Lee" },
      "createdAt": "2026-09-10T03:15:00Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 87,
  "totalPages": 5
}
```
`owner: null` when unassigned. These are exactly the 7 queue columns from `specification.md`
§11 — Requested Priority is deliberately not included here (still visible in Ticket Detail).

### `GET /api/staff/tickets/:id` — Ticket Detail
Response `200`: full Ticket fields (including `requestedPriority`, `itPriority`, `currentStatus`,
`requesterConfirmedAt`), `requester: {id, name, email}`, `category`, `relatedSystem`,
`attachments` (Lab 2 metadata shape). **Comments and Internal Notes are never embedded here** —
fetched separately via Section 5, so the same rule that keeps Notes out of the Requester's view
(BR-26) doesn't have to be re-implemented per response shape. `404 NOT_FOUND` if the Ticket
doesn't exist.

### `POST /api/staff/tickets/:id/claim`
No body. Valid only when the Ticket is unassigned and in status `NEW`. Sets `ticketOwnerId` to the
caller, `currentStatus` to `OPEN`. `409 CONFLICT` (code `ALREADY_ASSIGNED`) if the Ticket already
has an owner — use reassign instead. `404 NOT_FOUND` if the Ticket doesn't exist.

### `POST /api/staff/tickets/:id/reassign`
Body: `{ "newOwnerId": 15 }`. Valid at any status, assigned or not. `newOwnerId` must reference an
active `IT_STAFF` user → else `400 VALIDATION_ERROR`. Does not change `currentStatus`. `404
NOT_FOUND` if the Ticket doesn't exist.

### `PATCH /api/staff/tickets/:id/priority`
Body: `{ "itPriority": "HIGH" }`. Any active IT Staff member may set this on any Ticket —
deliberately **not** gated by ownership, since triaging priority is useful before a Ticket is even
claimed (BR-15). `400 VALIDATION_ERROR` for an invalid value. `404 NOT_FOUND` if missing.

### `PATCH /api/staff/tickets/:id/status`
Body: `{ "status": "IN_PROGRESS" }`. The requested transition must be one of the permitted pairs in
`specification.md` §11's matrix, evaluated against the Ticket's current status → else
`409 CONFLICT`, code `INVALID_TRANSITION`. If the matrix marks that transition as requiring
ownership, the caller must be the current `ticketOwnerId` → else `403 FORBIDDEN`, code
`NOT_TICKET_OWNER`. Confirmation for Cancel/Reopen (BR-18) is a UI-only step — the API accepts the
transition once requested; it doesn't require a special "confirmed" flag. `404 NOT_FOUND` if
missing.

## 5. Public Comments & Internal Notes

| Action | Requester | IT Staff | Administrator |
|---|---|---|---|
| `POST` a Public Comment | own Ticket only | any Ticket | — (`403`) |
| `GET` Public Comments | own Ticket only | any Ticket | any Ticket |
| `POST` an Internal Note | — (`403`) | any Ticket | — (`403`) |
| `GET` Internal Notes | — (`403`) | any Ticket | any Ticket |

`POST /api/tickets/:id/comments` and `POST /api/tickets/:id/notes` — body `{ "body": "text" }`.
Rejected as `400 VALIDATION_ERROR` when empty/whitespace-only or over 2,000 characters (BR-16).
Content is stored as plain text and the UI always renders it as a text node, never as HTML — so
even unescaped `<script>` content in a comment displays literally rather than executing (BR-16,
AC-26). Response `201`: `{ id, ticketId, authorId, author: {id, name, role}, body, createdAt }`.

`GET /api/tickets/:id/comments` and `GET /api/tickets/:id/notes` — return an array of the same
shape, oldest first. A Requester calling the comments endpoint on a Ticket they don't own gets
`404 NOT_FOUND` (ownership rule, BR-12); a Requester calling the *notes* endpoint at all gets
`403 FORBIDDEN` regardless of ownership, since Internal Notes are a role-level denial, not a
per-record one (BR-04, AC-04).

Both are append-only — no `PATCH`/`DELETE` endpoint exists for either in Lab 3 (BR-17).

## 6. Administrator User Management

All endpoints in this section require role `ADMINISTRATOR`. `403 FORBIDDEN` for anyone else,
without revealing user data (BR-20, AC-22).

### `GET /api/users?search=jane&role=IT_STAFF`
`search` matches name or email, partial, case-insensitive. `role` is an exact optional filter. No
pagination, no multi-column sort (excluded by labsheet §8.5). Response `200`:
```json
[ { "id": 12, "name": "Jane Lee", "email": "jane@toktickit.dev", "role": "IT_STAFF", "isActive": true } ]
```

### `POST /api/users` — create
Body: `{ "name": "Jane Lee", "email": "jane@toktickit.dev", "role": "IT_STAFF", "isActive": true }`.
Validation: `name` required. `email` required, valid format, unique case-insensitive → else
`409 CONFLICT`, code `EMAIL_ALREADY_EXISTS` (BR-19). `role` required, one of `REQUESTER` /
`IT_STAFF` / `ADMINISTRATOR` → else `400 VALIDATION_ERROR` (BR-21). The system generates a random
initial password server-side (specification.md §11) — the client never supplies one. Response
`201`:
```json
{ "id": 20, "name": "Jane Lee", "email": "jane@toktickit.dev", "role": "IT_STAFF", "isActive": true, "mustChangePassword": true, "initialPassword": "kQ7m2XpR9s" }
```
`initialPassword` is returned **only in this response** — it is hashed for storage and never
retrievable again. The Administrator relays it to the user directly (no email in Lab 3).

### `PATCH /api/users/:id` — edit
Body: any of `{ "name", "email", "role", "isActive" }`. Any other field present in the body (e.g.
`passwordHash`, `mustChangePassword`, `id`) is silently ignored, never applied (BR-22). `email`
uniqueness re-checked excluding this user → `409 CONFLICT`. `role` validated as above.
- Setting `isActive: false` on the caller's own account → `409 CONFLICT`, code
  `SELF_DEACTIVATION_BLOCKED` (BR-23/AC-20).
- Deactivating, or changing the role away from `ADMINISTRATOR` for, the last remaining active
  Administrator → `409 CONFLICT`, code `LAST_ACTIVE_ADMIN_BLOCKED` (AC-21).

Response `200`: updated user shape (same as the list-item shape). `404 NOT_FOUND` if the id
doesn't exist.

### `POST /api/users/:id/reset-password` — set a new initial password
No body. Generates a new random password the same way as creation, sets `mustChangePassword:
true`. Response `200`: `{ "initialPassword": "..." }`, same one-time-only rule as creation.
`404 NOT_FOUND` if the id doesn't exist.

## 7. Authorization matrix

| Endpoint group | Requester | IT Staff | Administrator |
|---|---|---|---|
| `/auth/*` | ✅ (own session) | ✅ | ✅ |
| `/tickets`, `/attachments` (Requester's own) | ✅ own only | ❌ 403 | ❌ 403 |
| `/tickets/:id/resolution-signal` | ✅ own only | ❌ 403 | ❌ 403 |
| `/staff/tickets*` (queue, detail, claim, reassign, priority, status) | ❌ 403 | ✅ | ❌ 403 |
| `POST /tickets/:id/comments` | ✅ own only | ✅ any | ❌ 403 |
| `GET /tickets/:id/comments` | ✅ own only | ✅ any | ✅ any |
| `POST /tickets/:id/notes` | ❌ 403 | ✅ any | ❌ 403 |
| `GET /tickets/:id/notes` | ❌ 403 | ✅ any | ✅ any |
| `/users*` | ❌ 403 | ❌ 403 | ✅ |

## 8. HTTP status summary

| Status | Used for |
|---|---|
| 200 | Successful retrieval, update, or action |
| 201 | User or Comment/Note created |
| 400 | Validation failure (missing/malformed field, bad password, wrong current password) |
| 401 | No/invalid/expired session |
| 403 | Authenticated but role-forbidden (including `mustChangePassword` still pending) |
| 404 | Resource does not exist, or exists but is not owned by the caller (BR-12) |
| 409 | Business-rule conflict: duplicate email, self-deactivation, last-admin, already-assigned, invalid status transition |
| 429 | Too many failed login attempts (BR-08) |
| 500 | Unexpected server error, no internal detail exposed |

## 9. Assumptions specific to this contract

- **Session cookie (`sid`) replaces `X-Requester-Id` entirely** — every Lab 2 endpoint that used
  the header now reads the session instead; no endpoint accepts a client-supplied identity.
- **404 over 403 for ownership, 403 reserved for role** — see BR-12 and the table in Section 1.
  This is the one deliberate behavior reversal from Lab 2, and only applies to *resource*
  ownership; a whole-endpoint role denial (Requester hitting `/users` or `/staff/tickets`, anyone
  hitting Internal Notes without permission) is still `403`.
- **Claim vs. reassign are two endpoints, not one**, because they have different preconditions:
  claim only works on an unassigned `NEW` Ticket and implicitly opens it; reassign works on any
  Ticket, assigned or not, and never touches status.
- **IT Priority is not ownership-gated**, unlike status changes — a Ticket needs a sensible
  priority before anyone claims it, so any IT Staff member can set it regardless of who (if anyone)
  owns the Ticket.
- **Queue page size fixed at 20**, not client-selectable — the labsheet doesn't ask for a picker,
  and one less control keeps §8.3's "avoid a mega-grid" concern from creeping into the query
  contract too.
- **Duplicate email and the two Administrator safety rules return `409 CONFLICT`**, not `400` or
  `403` — the request is well-formed and the caller is authorized; it's the resulting state
  (two users with the same email, an admin locking themselves out, zero active admins) that's
  disallowed, which is what `409` is for.
- **Initial passwords are generated server-side and returned once** — see
  `specification.md` §11. The Administrator UI must display it clearly on creation/reset since
  there is no second chance to retrieve it and no email path in Lab 3.
