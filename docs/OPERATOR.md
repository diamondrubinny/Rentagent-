# RentAgent — Operator Guide

This guide is for the business that installs and runs RentAgent on its own server ("operator").
Server sizing, ports and supported systems are in `REQUIREMENTS.md`, and before going live work
through `PRODUCTION-CHECKLIST.md` (both are in the release bundle next to this file; in the source
repository: `deploy/REQUIREMENTS.md` and `docs/PRODUCTION-CHECKLIST.md`).

## 1. Install

```bash
tar -xzf rentagent-<version>.tar.gz && cd rentagent-<version>
sudo ./install.sh --domain agents.example.com --email you@example.com --locale en
```

The installer checks the server, generates all secrets into `/opt/rentagent/.env` (mode 600),
starts the stack and obtains HTTPS certificates. **Copy `/opt/rentagent/.env` to a safe place**:
without `APP_ENCRYPTION_KEY` the stored API keys and passwords cannot be decrypted.

Open `https://agents.example.com/<locale>/setup` and enter the setup token
(`sudo rentagent setup-token`). The wizard creates the owner account and the basic settings.
Turn on two-factor authentication right away: the admin area requires it.

## 2. First configuration (admin area)

| Area | What to do |
|------|------------|
| **AI › Providers** | Add at least one provider (OpenAI, Anthropic, Google, Mistral, Azure, Bedrock, Ollama, any OpenAI-compatible server…). Keys are encrypted at rest. Set monthly caps. |
| **AI › Models / Routing** | Choose default models and fallbacks; set prices if you sell usage. |
| **Agents** | Start from a template or build your own: instructions, tools, knowledge files, approvals, pricing. Publish when ready. |
| **Tools** | HTTP tools and MCP servers. Outgoing requests are checked against private networks (SSRF protection). |
| **Settings** | Registration (open / invite / closed), catalog visibility, daily run limit per user, data retention (default 180 days), email (SMTP). |
| **Languages** | Enable any of 53 interface languages, translate missing texts with your AI, review and edit strings. |
| **Billing** | Currency, credit packs, signup credit; connect Stripe and/or PayPal; subscription plans. Webhook endpoints are shown on the page. |
| **Branding** | Main color (contrast-checked), logo, favicon, feature switches (answer ratings, semantic search, accessibility menu). |
| **Webhooks** | Signed notifications to your CRM or other systems (new users, finished runs, payments). |
| **Legal pages** | Your company details, accessibility coordinator, your own texts — see section 4. |
| **License** | Paste your license key — see section 5. |

## 3. Daily operations

```
sudo rentagent status          # services, health, disk
sudo rentagent logs [service]  # follow logs (web, worker, postgres, redis, caddy)
sudo rentagent backup          # database + files + configuration
sudo rentagent update [ver]    # backup → update → automatic rollback on failure
sudo rentagent restore <dir>   # restore a backup
```

- **Backups**: schedule `rentagent backup` daily (cron) and copy the result off the server,
  encrypted. Test a restore at least every quarter.
- **Updates**: read the release notes, then `rentagent update`. Migrations run automatically.
- **Monitoring**: `GET /api/health` returns 503 when the database or Redis is down and reports
  `"status": "degraded"` when the worker has stopped. Point an uptime monitor at it and alert on
  anything other than `"ok"`. Admin › Overview shows staff accounts without two-factor
  authentication.
- **Audit log**: Admin › Audit lists sign-ins, permission changes, settings, payments, licensing and
  legal changes. IP addresses are stored only as one-way hashes.
- **Emergency stop**: AI › Providers can stop all AI calls at once (for example if a key leaks).

## 4. Legal pages and accessibility

RentAgent drafts a privacy policy, terms of use, cookie policy and accessibility statement in
English, Hebrew, Arabic and Russian, **from what this installation actually does**: the AI
providers you enabled, payment gateways, the retention period, webhooks and the cookies in use.
Other languages show the English draft.

1. Fill in your company details under **Admin › Legal pages**.
2. Have each document reviewed by a lawyer (and the accessibility statement by an accessibility
   consultant). Replace any text with your own Markdown per language if needed.
3. Tick **Reviewed by a qualified professional** per document. Until then a "draft" notice is shown.

These drafts are a starting point, not legal advice. They do not make your service compliant with
GDPR, the Israeli Privacy Protection Law (Amendment 13), consumer law or accessibility regulations
by themselves.

The interface targets WCAG 2.1 AA (and Israeli Standard 5568): keyboard navigation, screen readers,
right-to-left languages, 200% zoom, contrast checks for your colors. The optional accessibility
menu adds text size, contrast, link highlighting, readable font and stopping animations. Content
you write (agent descriptions, uploaded documents, custom legal texts) must be accessible too.

## 5. License

Paste your license key under **Admin › License** (or set `LICENSE_KEY` in `.env`). It is verified
offline. If your vendor runs a license server, set `LICENSE_SERVER_URL` in `.env`; the worker then
checks once a day, sending only the license id, your domain and the version. Network problems are
tolerated for 14 days.

Without a valid license nothing stops working: the "Powered by" line stays visible and the admin
area shows a notice. A license with white-labelling lets you hide that line. Your users are never
blocked by licensing.

## 6. Security essentials

- Keep the server updated (`unattended-upgrades`), allow only ports 22, 80 and 443, use SSH keys.
- Every admin and staff account must use two-factor authentication (enforced for the admin area).
- Give staff the lowest role that works (Support, Agent manager, Admin; keep Owner for yourself).
- Rotate AI provider keys if staff leave; use per-provider monthly caps.
- Enable malware scanning for uploads (`COMPOSE_PROFILES=clamav` in `.env`, then `rentagent restart`)
  if users or staff upload documents.
- Never paste secrets into agent instructions or knowledge files.
- To rotate `APP_ENCRYPTION_KEY`: move the old key to `APP_ENCRYPTION_KEYS_PREVIOUS`, set a new
  key and restart. Existing secrets keep working; each secret you save again (provider keys, SMTP,
  payment and webhook secrets) is encrypted with the new key. Remove the old key only after all of
  them were saved again.

## 7. Personal data

What is stored, why and for how long is listed in the production checklist (data map). Users can
download their data and delete their chats or account themselves (My account › Privacy and data).
Chats are deleted automatically after the retention period you set. Requests you receive by email
(access, correction, objection) are handled by staff in Admin › Users.

## 8. Troubleshooting

| Symptom | Check |
|---------|-------|
| Site unreachable | `rentagent status`; DNS points to the server; ports 80/443 open; `rentagent logs caddy`. |
| Agents never answer | `/api/health` worker check; `rentagent logs worker`; provider key valid and under its cap; emergency stop off. |
| No emails | SMTP settings (Admin › Settings); SPF/DKIM/DMARC; `rentagent logs worker`. |
| Payments not credited | Webhook URL and secret in the Stripe/PayPal dashboard match Admin › Billing. |
| "Needs a license" notice | Admin › License shows the exact reason (expired, other domain, not confirmed). |
