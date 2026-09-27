# Lab 4 API spec

Base path `/api`. Everything in `docs/lab-03/api-spec.md` still applies (session cookie `sid`,
`401` / `403` / `404` split, error shape, ISO 8601 UTC timestamps) except where this document
changes it. Rule numbers (BR, AC) refer to `docs/lab-04/specification.md`.

## 1. Conventions added in Lab 4

**Error shape** is unchanged, with an optional `details` object for the resolution gate:
```json
{ "error": { "code": "RESOLUTION_GATE_NOT_MET", "message": "Complete or cancel the remaining Actions Taken before resolving.", "details": { "completed": 1, "open": 2 } } }
```
Validation errors keep Lab 2's `fields` list: `{ "field": "result", "message": "Result is required when the Action is Completed." }`.

**Stale update check (BR-19).** Every Ticket response now includes `version`, and every Action
includes its own `version`. A write that changes a Ticket's workflow fields or an Action must
send `expectedVersion`:
- missing or not an integer: `400 VALIDATION_ERROR`
- not equal to the stored value: `409 STALE_UPDATE`, message "This Ticket changed while you were
  working on it. Reload to see the latest version." (for an Action, "This Action changed ...").
  Nothing is written.

The check is part of the write itself (`UPDATE ... WHERE id = ? AND version = ?`), so two writes
racing on the same version give one success and one `409`.

**Order of checks** for every Ticket or Action write: `401` session, `403` role, `404` record,
`400` validation, `409 STALE_UPDATE`, then the business rule codes (`INVALID_TRANSITION`,
`NOT_TICKET_OWNER` as `403`, `RESOLUTION_GATE_NOT_MET`, `ACTION_LOCKED`, `TICKET_CLOSED`). A stale
request is refused before any rule is evaluated, because the rule would be judged against a
Ticket the user has not seen.

**Staff roles.** In this document "Staff" means `IT_STAFF` or `ADMINISTRATOR`. Every route under
`/api/staff` admits both (supersedes Lab 3 §4's IT Staff only rule).

## 2. Actions Taken

### Action shape
```json
{
  "id": 31,
  "ticketId": 42,
  "actionAt": "2026-10-08T03:20:00Z",
  "description": "Replaced the laptop battery",
  "result": "Battery holds charge for 6 hours",
  "status": "COMPLETED",
  "performedBy": { "id": 12, "name": "Kritsada Boonmee" },
  "assignee": { "id": 12, "name": "Kritsada Boonmee" },
  "followUpRequired": true,
  "followUpNote": "Check again next week",
  "attachmentNotes": "See photo battery-before.jpg in Attachments",
  "version": 2,
  "createdAt": "2026-10-08T03:21:10Z",
  "updatedAt": "2026-10-08T04:02:45Z"
}
```
`result`, `followUpNote` and `attachmentNotes` are `null` when empty.

### `GET /api/tickets/:id/actions`
Requester (own Ticket), Staff (any Ticket). Returns an array of the Action shape ordered by
`actionAt` ascending, then `id` ascending. A Requester asking for a Ticket they do not own, or a
Ticket that does not exist, gets `404 NOT_FOUND` (Lab 3 BR-12). An empty array when the Ticket
has no Actions.

### `POST /api/staff/tickets/:id/actions`
Staff only. Request:
```json
{
  "actionAt": "2026-10-08T03:20:00Z",
  "description": "Replaced the laptop battery",
  "result": null,
  "status": "PLANNED",
  "assigneeId": 15,
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": null,
  "clientRequestId": "b7c1e0d2-5f0a-4c38-9a0e-1f2d3c4b5a69"
}
```
- `performedById` is never read from the body; it is the session user (BR-04). Any
  `performedById`, `version`, `ticketId` or `id` sent is ignored.
- `actionAt` defaults to now. `status` defaults to `PLANNED` and may be `PLANNED`, `IN_PROGRESS`
  or `COMPLETED` (BR-09). `assigneeId` defaults to the session user.
- Validation (`400 VALIDATION_ERROR` with `fields`): BR-06 date range, BR-07 lengths and the
  Completed needs a result rule, BR-08 follow up note, unknown `status` value.
- Assignee: `400 ASSIGNEE_INACTIVE` for an inactive user, `400 ASSIGNEE_INVALID` for a Requester
  or a missing user (BR-05).
- Ticket Closed or Cancelled: `409 TICKET_CLOSED` (BR-10).
- `clientRequestId` (optional, at most 64 characters): if an Action with the same value already
  exists on this Ticket, the response is `200` with that Action and nothing new is created
  (BR-20). A new Action returns `201`.
- Updates the Ticket's `updatedAt` (BR-12). Does not change the Ticket's `version`, because no
  Ticket workflow field changes.
- `404 NOT_FOUND` if the Ticket does not exist. `403 FORBIDDEN` for a Requester (BR-03).

### `PATCH /api/staff/actions/:id`
Staff only. Request: `expectedVersion` (required) plus any of `actionAt`, `description`, `result`,
`status`, `assigneeId`, `followUpRequired`, `followUpNote`, `attachmentNotes`. Other fields are
ignored.
- The merged result (stored values plus the changes) is validated with the same rules as create.
- `status` must follow BR-09; an illegal move is `409 INVALID_TRANSITION`.
- An Action that is already `COMPLETED` or `CANCELLED` cannot change at all: `409 ACTION_LOCKED`.
- Ticket Closed or Cancelled: `409 TICKET_CLOSED`.
- Response `200` with the updated Action and its new `version`. Updates the Ticket's `updatedAt`.
- `404 NOT_FOUND` if the Action does not exist. There is no `DELETE` (BR-11).

## 3. Ticket workflow changes

All endpoints in Lab 3 §4 keep their paths and response shapes, admit Staff, and add `version` to
the Ticket they return.

| Endpoint | Body change | New outcomes |
|---|---|---|
| `POST /api/staff/tickets/:id/claim` | `{ "expectedVersion": 3 }` | `409 STALE_UPDATE`; writes a New → Open history row |
| `POST /api/staff/tickets/:id/reassign` | `{ "newOwnerId": 15, "expectedVersion": 3 }` | `409 STALE_UPDATE`; new owner may be IT Staff or Administrator, active (BR-13), else `400 VALIDATION_ERROR` |
| `PATCH /api/staff/tickets/:id/priority` | `{ "itPriority": "HIGH", "expectedVersion": 3 }` | `409 STALE_UPDATE` |
| `PATCH /api/staff/tickets/:id/status` | `{ "status": "RESOLVED", "expectedVersion": 3 }` | `409 STALE_UPDATE`; `409 RESOLUTION_GATE_NOT_MET` (BR-16); writes a history row |

**Resolution gate.** When `status` is `RESOLVED`, the server counts the Ticket's Actions inside
the same transaction as the update: it needs `completed >= 1` and `open == 0`, where `open` counts
`PLANNED` and `IN_PROGRESS`. Failing that, `409 RESOLUTION_GATE_NOT_MET` with `details`
`{ completed, open }`. The transaction runs at serializable isolation so an Action added at the
same moment cannot slip past the check.

`GET /api/staff/tickets/:id` additionally returns `gate: { completed, open, met }`, so the client
can explain a blocked Resolved without a second request.

`GET /api/staff/assignable-users` now returns active IT Staff **and** Administrators, as
`[{ "id": 12, "name": "Kritsada Boonmee", "role": "IT_STAFF" }]`, ordered by name. The same list
feeds the Ticket Owner and the Action Assignee controls.

`POST /api/tickets/:id/comments` and `POST /api/tickets/:id/notes` now admit Administrators
(Lab 3 §5 table, Administrator column, becomes the same as IT Staff).

### `GET /api/tickets/:id/history`
Requester (own Ticket, else `404`), Staff (any Ticket). Response `200`:
```json
[ { "id": 7, "fromStatus": "NEW", "toStatus": "OPEN", "changedBy": { "id": 12, "name": "Kritsada Boonmee" }, "changedAt": "2026-10-08T02:00:00Z" } ]
```
Ordered by `changedAt`, then `id`, ascending. No write endpoint exists (BR-18).

## 4. List filters for drill down

Both list endpoints gain one optional parameter, and otherwise keep their Lab 2 and Lab 3
contracts.

| Endpoint | New parameter | Meaning |
|---|---|---|
| `GET /api/tickets` | `statusGroup=active` | only the active statuses of BR-21 |
| `GET /api/staff/tickets` | `statusGroup=active` | same |

`statusGroup` combines with every other filter (both must match). Any other value is ignored,
following the Lab 2 and 3 rule that a mistyped parameter degrades to sensible results.
The client pages read these parameters from their own URL (`/my-tickets?...`,
`/staff/queue?...`) with the same names as the API.

## 5. Dashboards

Figures follow `specification.md` BR-21 to BR-26 exactly. Each figure carries its own drill down
link so the client never builds filter strings itself.

### `GET /api/dashboard/requester`
Requester only (`403` for others). No parameters; the Requester is the session user (BR-22).
```json
{
  "generatedAt": "2026-10-16T07:00:00Z",
  "metrics": [
    { "key": "myOpen", "label": "My Open Tickets", "count": 3, "link": "/my-tickets?statusGroup=active" },
    { "key": "waitingForMe", "label": "Waiting for Me", "count": 1, "link": "/my-tickets?currentStatus=WAITING_FOR_REQUESTER" },
    { "key": "resolved", "label": "Resolved", "count": 2, "link": "/my-tickets?currentStatus=RESOLVED" },
    { "key": "closed", "label": "Closed", "count": 5, "link": "/my-tickets?currentStatus=CLOSED" }
  ],
  "recentTickets": [
    { "id": 42, "ticketNumber": "TKT-2026-800004", "summary": "Laptop battery drains quickly", "currentStatus": "IN_PROGRESS", "updatedAt": "2026-10-15T09:14:00Z" }
  ],
  "recentlyResolved": []
}
```

### `GET /api/dashboard/staff`
IT Staff and Administrator (`403` for a Requester).
```json
{
  "generatedAt": "2026-10-16T07:00:00Z",
  "metrics": [
    { "key": "unassigned", "label": "Unassigned", "count": 2, "link": "/staff/queue?owner=unassigned&statusGroup=active" },
    { "key": "myTickets", "label": "My Tickets", "count": 4, "link": "/staff/queue?owner=12&statusGroup=active" },
    { "key": "highPriority", "label": "High IT Priority", "count": 1, "link": "/staff/queue?itPriority=HIGH&statusGroup=active" },
    { "key": "myOpenActions", "label": "My Open Actions", "count": 3, "link": null }
  ],
  "byStatus": [ { "status": "NEW", "count": 2, "link": "/staff/queue?status=NEW" } ],
  "byItPriority": [ { "itPriority": "HIGH", "count": 1, "link": "/staff/queue?itPriority=HIGH&statusGroup=active" } ],
  "myOpenActions": [
    { "id": 31, "ticketId": 42, "ticketNumber": "TKT-2026-800004", "description": "Order replacement battery", "status": "PLANNED", "actionAt": "2026-10-15T02:00:00Z" }
  ],
  "recentTickets": [ { "id": 42, "ticketNumber": "TKT-2026-800004", "summary": "Laptop battery drains quickly", "currentStatus": "IN_PROGRESS", "updatedAt": "2026-10-15T09:14:00Z" } ],
  "userCounts": { "requester": 4, "itStaff": 3, "administrator": 1, "inactive": 2, "link": "/users" }
}
```
- `byStatus` always lists all 8 statuses and `byItPriority` all 3 values, zeros included (BR-25).
- `myOpenActions` lists at most 5, oldest `actionAt` first; the metric count is the full total.
- `userCounts` is present only for an Administrator and omitted for IT Staff.
- `description` in `myOpenActions` is cut to 120 characters.

## 6. Authorization matrix

Changes from Lab 3 are in bold.

| Endpoint group | Requester | IT Staff | Administrator |
|---|---|---|---|
| `/auth/*` | ✅ own session | ✅ | ✅ |
| `/tickets`, `/attachments` (Requester's own) | ✅ own only | ❌ 403 | ❌ 403 |
| `/tickets/:id/resolution-signal` | ✅ own only | ❌ 403 | ❌ 403 |
| `/staff/*` (queue, detail, claim, reassign, priority, status, assignable users, attachment download) | ❌ 403 | ✅ | **✅** |
| `POST /tickets/:id/comments` | ✅ own only | ✅ any | **✅ any** |
| `GET /tickets/:id/comments` | ✅ own only | ✅ any | ✅ any |
| `POST /tickets/:id/notes` | ❌ 403 | ✅ any | **✅ any** |
| `GET /tickets/:id/notes` | ❌ 403 | ✅ any | ✅ any |
| **`GET /tickets/:id/actions`** | **✅ own only** | **✅ any** | **✅ any** |
| **`POST /staff/tickets/:id/actions`, `PATCH /staff/actions/:id`** | **❌ 403** | **✅** | **✅** |
| **`GET /tickets/:id/history`** | **✅ own only** | **✅ any** | **✅ any** |
| **`GET /dashboard/requester`** | **✅** | **❌ 403** | **❌ 403** |
| **`GET /dashboard/staff`** | **❌ 403** | **✅** | **✅ + user counts** |
| `/users*` | ❌ 403 | ❌ 403 | ✅ |

## 7. HTTP status summary (additions)

| Status | New Lab 4 uses |
|---|---|
| 200 | Repeated Action create with a known `clientRequestId` |
| 201 | Action created |
| 400 | Action validation, `ASSIGNEE_INACTIVE`, `ASSIGNEE_INVALID`, missing `expectedVersion` |
| 409 | `STALE_UPDATE`, `RESOLUTION_GATE_NOT_MET`, `ACTION_LOCKED`, `TICKET_CLOSED` for Actions, `INVALID_TRANSITION` for Action status |

## 8. Assumptions specific to this contract

- **`expectedVersion` in the body, not an `If-Match` header.** Every existing write already sends
  a JSON body, and the Lab 3 tests use that pattern; a header would be the only one of its kind.
- **The gate result travels with Ticket Detail** (`gate`), so the status control can disable
  Resolved with the right reason without an extra request, while the server still checks again
  on the write.
- **Dashboard links are client routes built by the server.** The server already knows the filter
  it counted with, so sending the matching link guarantees the card and the list agree (BR-23).
- **Assignee inactive is `400`, not `409`.** The request names an unusable value, like any other
  invalid field; nothing about the stored state conflicts.
