# Lab 2 API spec

Base path: `/api`. All request and response bodies are JSON except attachment upload, which is
`multipart/form-data`, and attachment download, which returns the file with its stored MIME type.

## 1. Conventions

**Identifying the current Requester.** Lab 2 has no session. Every requester-scoped endpoint
except Ticket creation requires an `X-Requester-Id` header carrying the selected Requester's id.
Ticket creation instead carries `requesterId` in its request body, per the labsheet's own partial
example in §6.2. Missing or non-numeric `X-Requester-Id` on a requester-scoped endpoint returns
`400 VALIDATION_ERROR`. A well-formed id that does not match an active Requester returns
`404 REQUESTER_NOT_FOUND`.

The download endpoint (`GET /api/attachments/:id/download`) is the one exception: because it's used directly in an `<a href>` link so the browser's native download/open-in-new-tab behavior works, it accepts `requesterId` as a **query parameter** instead of the `X-Requester-Id` header. Every other requester-scoped endpoint keeps the header.

**Error shape**, used on every non-2xx response:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "summary is required" } }
```

**Missing vs. not-owned are distinguished.** A Ticket or Attachment that does not exist returns
`404 NOT_FOUND`. One that exists but belongs to a different Requester returns
`403 FORBIDDEN`. Lab 2 is not real authentication (BR-03) and Ticket Numbers are not secrets, so
this sprint favors a distinct, testable rejection over hiding existence — it lets an automated
test and a screenshot prove ownership was actually checked, rather than looking identical to a
typo'd id. This satisfies BR-22's "safe not-found or forbidden response without revealing ticket
data" using the forbidden half of that rule. The one exception is a **soft-removed** attachment's
download, which stays `404` — BR-16 requires it to be indistinguishable from a file that was
never there, which is a different intent from ownership.

**Timestamps** are ISO 8601 UTC strings.

## 2. Reference data

### `GET /api/categories`
Returns active Categories. No parameters.

Response `200`:
```json
[ { "id": 1, "name": "Hardware" } ]
```

### `GET /api/related-systems`
Returns active Related Systems. No parameters.

Response `200`:
```json
[ { "id": 1, "name": "Campus Wi-Fi" } ]
```

### `GET /api/requesters`
Returns active Development Requesters. Inactive Requesters are never included.

Response `200`:
```json
[ { "id": 1, "name": "Anong Srisai" } ]
```

All three return `200` with an empty array when no active rows exist — not an error. A database
failure returns `500 INTERNAL_ERROR` with no stack trace or query detail in the message.

## 3. Tickets

### `POST /api/tickets` — create a Ticket

Request body:
```json
{
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 3,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops from 100% to 20% within two hours of normal use.",
  "requestedPriority": "MEDIUM"
}
```

Validation (all checked server-side, independent of frontend validation):
- `requesterId` required, must reference an **active** Requester → else `400 VALIDATION_ERROR`
  (unknown/inactive: `404 REQUESTER_NOT_FOUND`)
- `categoryId`, `relatedSystemId` required, must reference active rows → `400 VALIDATION_ERROR`
- `summary` required, trimmed length 5-120 → `400 VALIDATION_ERROR`
- `description` required, trimmed length 10-2000 → `400 VALIDATION_ERROR`
- `requestedPriority` required, one of `LOW` / `MEDIUM` / `HIGH` → `400 VALIDATION_ERROR`

Response `201`:
```json
{
  "id": 42,
  "ticketNumber": "TKT-2026-000042",
  "ticketDate": "2026-08-30T03:15:00Z",
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 3,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops from 100% to 20% within two hours of normal use.",
  "requestedPriority": "MEDIUM",
  "currentStatus": "NEW"
}
```

A validation failure returns `400` with every failing field listed in `error.fields` (not just
the first) so the UI can show all field-level messages at once. `ticketNumber` and `ticketDate`
are never accepted from the client even if present in the body — they are always server-assigned.

### `GET /api/tickets` — the current Requester's Tickets

Requires `X-Requester-Id`. See §4 for the full query contract.

### `GET /api/tickets/:id` — one owned Ticket

Requires `X-Requester-Id`.

Response `200`: same shape as the create response, plus `attachments` (see §5's metadata shape).

`404 NOT_FOUND` when the Ticket does not exist. `403 FORBIDDEN` when it exists but belongs to a
different Requester (§1).

## 4. Ticket-list query contract

`GET /api/tickets?search=laptop&category=2&currentStatus=NEW&sort=ticketDate&order=desc&page=1&pageSize=10`

| Parameter | Meaning | Default |
|---|---|---|
| `search` | matches Summary and Ticket Number, case-insensitive, partial | none |
| `category` | Category id | none |
| `relatedSystem` | Related System id | none |
| `currentStatus` | exact match | none |
| `requestedPriority` | exact match | none |
| `sort` | one of `ticketDate`, `ticketNumber`, `requestedPriority`, `currentStatus`, `updatedAt` | `ticketDate` |
| `order` | `asc` or `desc` | `desc` |
| `page` | 1-based page number | `1` |
| `pageSize` | one of `5`, `10`, `20` | `10` |

**Secondary sort** is always `ticketNumber desc`, applied as a tie-breaker after whatever `sort`
is chosen, so pagination order is stable across requests.

**Invalid parameters do not error.** An unrecognized `sort` value, a non-numeric `page`, or a
`pageSize` outside the permitted set is replaced with its default rather than returning `400` —
a mistyped query string should degrade to sensible results, not break the screen. A `category`,
`relatedSystem`, `currentStatus` or `requestedPriority` value that matches nothing simply yields
zero results, which is the no-results state, not an error.

Response `200`:
```json
{
  "data": [ { "id": 42, "ticketNumber": "TKT-2026-000042", "...": "..." } ],
  "page": 1,
  "pageSize": 10,
  "totalItems": 23,
  "totalPages": 3
}
```

An empty `data` array with `totalItems: 0` distinguishes a genuine no-results/empty case from a
failure — the response is still `200`.

## 5. Attachments

**Metadata shape**, used in the Ticket Detail response and the standalone metadata endpoint:
```json
{
  "id": 7,
  "ticketId": 42,
  "originalFilename": "screenshot.png",
  "mimeType": "image/png",
  "sizeBytes": 348213,
  "uploadedAt": "2026-08-30T03:20:00Z",
  "isActive": true,
  "removedAt": null,
  "removalReason": null
}
```
`storedFilename` (the server-generated, path-safe name — BR-24) is never returned to the client;
it is an internal detail.

### `POST /api/tickets/:id/attachments` — upload

Requires `X-Requester-Id`, must own the Ticket. `multipart/form-data` with one `file` field.

Validation. These checks run in this order and the **first** failure determines the single
response status (BR-27); no later check is evaluated, and exactly one error is returned per
upload:

1. Ticket must exist → `404 NOT_FOUND`
2. Ticket must be owned by the requesting Requester → `403 FORBIDDEN`
3. file type must be JPG, JPEG, PNG, WEBP or PDF → `415 UNSUPPORTED_MEDIA_TYPE`
4. file size must be ≤ 5 MB → `413 PAYLOAD_TOO_LARGE`
5. the Ticket must have fewer than 5 currently active attachments → `409 ATTACHMENT_LIMIT_REACHED`

Existence and ownership are settled before the file is examined, so a rejection never reveals
whether another Requester's Ticket exists; the two intrinsic file checks precede the one that
needs a database count.

Response `201`: the metadata shape above, `isActive: true`. If the database write fails after the
file has been stored, the stored file is deleted before the error is returned, so no orphaned file
is left behind (BR-26). A successful upload updates the parent Ticket's `updatedAt` (BR-28).

### `GET /api/attachments/:id` — metadata

Requires `X-Requester-Id`, must own the parent Ticket. Returns the metadata shape regardless of
`isActive` — removed attachments still return their metadata (BR-16). `404 NOT_FOUND` on a
missing attachment. `403 FORBIDDEN` when it exists but its Ticket belongs to another Requester.

### `GET /api/attachments/:id/download` — download

Accepts `requesterId` as a **query parameter** (not the `X-Requester-Id` header — see §1), since this endpoint is used directly in an `<a href>` link. Must own the parent Ticket. Missing or non-numeric `requesterId` → `400 VALIDATION_ERROR`. `200` with the file body and its stored
MIME type when `isActive` is true. `404 NOT_FOUND` when the attachment is missing **or**
soft-removed — the two look identical on purpose, so a removed file cannot be distinguished from
one that was never there (BR-16: "cannot be downloaded or previewed"). `403 FORBIDDEN` when the
attachment is active but belongs to a Ticket owned by another Requester.

### `DELETE /api/attachments/:id` — soft removal

Requires `X-Requester-Id`, must own the parent Ticket. Body:
```json
{ "reason": "Wrong file attached by mistake" }
```
`reason` required, non-empty (BR-17). Sets `isActive: false`, `removedAt` to now, stores
`removalReason`. The database row is never deleted (BR-16). Soft removal also updates the parent
Ticket's `updatedAt` (BR-28), the same as upload. Response `200` with the updated metadata shape. `404 NOT_FOUND` if the attachment is missing or already removed.
`403 FORBIDDEN` if it exists and is active but is not owned by the requesting Requester.
`400 VALIDATION_ERROR` if `reason` is missing or blank.

## 6. HTTP status summary

| Status | Used for |
|---|---|
| 200 | Successful retrieval, list, download, or soft removal |
| 201 | Ticket created, Attachment uploaded |
| 400 | Validation failure (missing/malformed field, missing removal reason) |
| 403 | Resource exists but is not owned by the caller |
| 404 | Resource does not exist, or an attachment is soft-removed (download only) |
| 409 | Attachment limit already reached |
| 413 | Attachment exceeds 5 MB |
| 415 | Attachment type not permitted |
| 500 | Unexpected server error, no internal detail exposed |

## 7. Assumptions specific to this contract

- **`X-Requester-Id` header vs. body `requesterId` vs. query `requesterId`:** creation keeps
  `requesterId` in the body because the labsheet's own §6.2 example puts it there. Every other
  requester-scoped endpoint uses the header — except attachment download, which needs to work as
  a plain `<a href>` link so the browser's native download/open-in-new-tab behavior works; a
  browser can't attach a custom header to a navigation, so download alone accepts `requesterId`
  as a query parameter instead.
- **Ownership failures return 403, missing resources return 404.** Chosen over hiding both behind
  404 because Parts 6 and 8 of the submission specifically require evidence that cross-Requester
  access is *rejected* — a distinct 403 lets a test and a screenshot prove ownership was checked,
  rather than looking identical to "wrong id". The one deliberate exception is a soft-removed
  attachment's download, which stays 404 per BR-16, so a removed file cannot be told apart from
  one that never existed.
- **Invalid list-query parameters degrade to defaults instead of erroring**, so a stale or
  hand-edited URL still renders a usable screen rather than an error page.
