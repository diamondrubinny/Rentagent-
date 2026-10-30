# RentAgent public API (v1)

Use the agents of a RentAgent site from your own website backend, app or CRM. The machine-readable
reference is served by every installation at `https://<site>/api/v1/openapi.json` (OpenAPI 3.1).

## Enabling and keys

- The operator turns the API on under **Admin › Branding › Features › Public API for users** (off by
  default).
- Users create keys under **My account › API keys**: name, permissions (scopes), optional list of
  agents, expiry (30/90/365 days or never). The key is shown **once**; only its SHA-256 hash is
  stored. Up to 20 active keys per user.
- Keys belong to a user. Runs started with a key count toward that user's limits and are billed to
  their credits exactly like runs in the web app. Conversations started through the API also appear
  in the user's chat history.
- Staff can revoke any key under **Admin › API keys** (shows owner, last use and conversations in
  the last 30 days).

| Scope | Allows |
|-------|--------|
| `agents:read` | `GET /agents` |
| `conversations:write` | Start, continue, read, stream, cancel and delete conversations |
| `approvals:write` | Approve or reject actions agents ask permission for |

**Use keys only on servers you control.** The API sends no CORS headers, so browsers on other sites
cannot call it; an embeddable widget for websites is planned separately (V2.1b).

## Authentication and errors

```
Authorization: Bearer ra_sk_<key id>_<secret>
```

Every error has the same shape:

```json
{ "error": { "code": "insufficient_credits", "message": "Not enough credits.", "fields": { "…": "required" } } }
```

| Status | Codes |
|--------|-------|
| 400 | `invalid_request` (malformed JSON, unknown property, body over 64 KB) |
| 401 | `unauthorized` (missing, invalid, revoked or expired key — all look the same) |
| 402 | `insufficient_credits` |
| 403 | `api_disabled`, `insufficient_scope` |
| 404 | `not_found` (also for other users' resources and agents a key may not use) |
| 409 | `busy`, `follow_ups_disabled`, `agent_unavailable`, `already_decided`, `already_finished` |
| 422 | `invalid` with `fields` (`required`, `invalidUrl`, `invalidOption`, …) |
| 429 | `rate_limited` (120 requests/minute per key; 20 failed authentications/minute per client), `daily_limit` |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/agents?locale=he` | Agents the key may use, with input fields and price |
| POST | `/api/v1/conversations` | Start: `{ "agent": "<slug or id>", "input": { … }, "locale": "he" }` → 201 Conversation |
| GET | `/api/v1/conversations?limit=20&before=<cursor>` | List, newest first; `next` is the cursor |
| GET | `/api/v1/conversations/{id}` | Conversation with all turns |
| DELETE | `/api/v1/conversations/{id}` | Delete (active turns are stopped, unused credits released) → 204 |
| POST | `/api/v1/conversations/{id}/messages` | Follow-up `{ "message": "…" }` → 201 Run |
| GET | `/api/v1/runs/{id}` | One turn (poll) |
| GET | `/api/v1/runs/{id}/events` | Server-Sent Events (see below) |
| POST | `/api/v1/runs/{id}/cancel` | Stop an active turn |
| POST | `/api/v1/approvals/{id}` | `{ "approve": true }` or `false` |

A turn (`Run`) has `status` (`QUEUED`, `RUNNING`, `WAITING_APPROVAL`, `SUCCEEDED`, `FAILED`,
`CANCELED`), `output` (the answer), `error`, `tools` (names of tools used), `approvals` (pending and
decided actions with their inputs) and `chargedMinor` (credits charged, in minor units of the site
currency). No model, provider or internal cost data is exposed.

## Example

```bash
KEY=ra_sk_…
SITE=https://agents.example.com

curl -s $SITE/api/v1/agents -H "Authorization: Bearer $KEY"

curl -s $SITE/api/v1/conversations -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d '{"agent":"sales-sdr","input":{"company_website":"https://example.com","product":"CRM"}}'
# → { "id": "<conversation>", "turns": [ { "id": "<run>", "status": "QUEUED", … } ], … }

curl -N $SITE/api/v1/runs/<run>/events -H "Authorization: Bearer $KEY"
# data: {"id":"…","status":"RUNNING",…}
# event: partial
# data: {"text":"Here is a first draft…"}
# data: {"id":"…","status":"SUCCEEDED","output":"…",…}

curl -s $SITE/api/v1/conversations/<conversation>/messages -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' -d '{"message":"Shorter, please."}'
```

When a turn reaches `WAITING_APPROVAL`, show `approvals[].tool` and `approvals[].input` to the
person responsible and send their decision to `POST /approvals/{id}`. Agents never perform such
actions without a decision.

## Privacy

The key owner decides what data is sent through the API and is responsible for having a legal basis
for it (they act as controller for their own customers' data). Conversations follow the site's
retention period and can be deleted through the API at any time. Key metadata (name, scopes, dates)
is included in the owner's data export; secrets never are.
