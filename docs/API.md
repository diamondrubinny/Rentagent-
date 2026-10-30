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
cannot call it. For websites, use the widget below.

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

## Website widget

A chat with one agent for the user's own website. Create it under **My account › API keys ›
Website widget** (agent, allowed sites, daily run limit) and paste the snippet before the closing
body tag:

```html
<script src="https://agents.example.com/embed.js" data-key="ra_pk_…" data-locale="he"
        data-label="Chat with us" data-position="right" data-color="#1d4ed8" async></script>
```

- The script adds an accessible button; the chat opens in an iframe from the agent site
  (`/<locale>/embed/<key id>`), loaded only when opened. Escape closes it and returns focus.
- **Allowed sites** are enforced by the browser: the embed page sends
  `Content-Security-Policy: frame-ancestors <allowed sites>` (other pages keep
  `X-Frame-Options: DENY`). Revoking the key stops framing and sessions within seconds.
- The key is public by design. Abuse is limited by: an invisible proof-of-work check
  ([ALTCHA](https://github.com/altcha-org/altcha), self-hosted, no cookies or third parties) before a
  visitor session, single-use challenges, signed 12-hour visitor sessions, 5 runs/minute per visitor,
  and the **daily run limit** of the key (runs are billed to the key owner).
- Each visitor only sees their own conversation (kept in the tab's session storage). Conversations
  appear in the owner's chat history; actions that need approval wait for the **owner** to approve
  them there — visitors cannot approve.
- No cookies are set on the host site.

## Scheduled task triggers

When the operator enables scheduled tasks, a user can give a task a trigger URL
(`POST /api/hooks/schedules/<id>`). Requests are signed like outgoing webhooks:

```
x-rentagent-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
```

Requests older than 5 minutes, repeated requests, bodies over 64 KB and more than 60 calls per hour
are refused. The raw body (e.g. JSON) replaces `{{payload}}` in the task's fields. Responses:
`202` accepted, `401` unknown trigger or bad signature, `409` duplicate, `413` too large, `429`.

```bash
BODY='{"order":42}'; T=$(date +%s)
SIG=$(printf '%s.%s' "$T" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.* //')
curl -s -X POST "$TRIGGER_URL" -H "x-rentagent-signature: t=$T,v1=$SIG" -d "$BODY"
```

## Privacy

The key owner decides what data is sent through the API and is responsible for having a legal basis
for it (they act as controller for their own customers' data). With the widget, the website owner is
responsible for informing their visitors (e.g. in their own privacy policy) that the chat is provided
by this service. Conversations follow the site's
retention period and can be deleted through the API at any time. Key metadata (name, scopes, dates)
is included in the owner's data export; secrets never are.
