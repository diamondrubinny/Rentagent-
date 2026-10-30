# RentAgent — Production Checklist

Work through this list before opening the service to real users, and again after major changes.
Items marked **⚖** need a qualified professional (lawyer, privacy officer/DPO, accessibility
consultant or penetration tester). Nothing in this checklist or in the product makes a deployment
compliant with any law or standard by itself.

## 1. Functional

- [ ] Setup completed; owner account has two-factor authentication.
- [ ] At least one AI provider works (Admin › Playground) and has a monthly cap.
- [ ] Each published agent was tested end to end, including approvals for actions with side effects.
- [ ] Sign-up, email verification, password reset and sign-in work with your real SMTP server.
- [ ] Billing (if enabled): a test payment, a refund and (if used) a subscription renewal are
      reflected correctly in the user's balance and in Admin › Billing.
- [ ] Webhooks (if used): your receiver verifies the signature and handles retries.
- [ ] Scheduled tasks (if on): a daily task runs once at the right local time; a trigger with a
      wrong signature is refused; result emails arrive.
- [ ] Website widget (if used): it opens on an allowed site and is refused on another; the daily
      limit fits your credits; a visitor cannot see another visitor's chat.
- [ ] Public API (if enabled): a test key works end to end; another user's key gets 404 for your
      conversations; a revoked key gets 401; the terms of use mention API use (generated when on).
- [ ] Error, 404 and empty states look right in every enabled language.

## 2. Roles, authentication and sessions

- [ ] Every staff account uses two-factor authentication (Admin › Overview shows exceptions).
- [ ] Staff have the lowest role that works; only you are Owner.
- [ ] Registration mode is what you intend (open / closed); catalog visibility is intended.
- [ ] A normal user cannot open `/admin`, other users' chats (`/chats/<id>`), files or runs
      (try with two test accounts).
- [ ] Sign-out ends the session; "sign out other sessions" works; password change signs out others.
- [ ] Repeated wrong passwords and 2FA codes are rate-limited.

## 3. Input, API and uploads

- [ ] HTTPS only; `curl -I https://<domain>` shows HSTS, CSP, `X-Frame-Options`/`frame-ancestors`,
      `Referrer-Policy`, `Permissions-Policy`.
- [ ] HTTP tools and MCP servers point only to services you trust; private-network targets are
      blocked unless intended.
- [ ] Upload limits (type, size) fit your use; uploaded knowledge files are quarantined until checked.
- [ ] **Malware scanning** enabled when users or staff upload documents
      (`COMPOSE_PROFILES=clamav`); an EICAR test file is rejected and logged.
- [ ] ⚖ Penetration test of the deployment (authentication, access control, uploads, agent tools).

## 4. Secrets and configuration

- [ ] `/opt/rentagent/.env` is mode 600, backed up separately and encrypted.
- [ ] No secrets in agent instructions, knowledge files, webhook URLs or custom legal texts.
- [ ] Stripe/PayPal live keys and webhook secrets set; test keys removed.
- [ ] `STRIPE_API_BASE` / `PAYPAL_API_BASE` are **not** set (test-only variables).
- [ ] Server firewall allows only 22, 80, 443; SSH uses keys; OS updates are automatic.

## 5. Dependencies

- [ ] Running a released version (`rentagent version`) with no known high/critical advisories
      (each release runs `pnpm audit` and publishes an SBOM: `rentagent-<version>.sbom.cdx.json`).
- [ ] Image signatures/provenance checked if your policy requires it (images carry SBOM and
      provenance attestations).
- [ ] ⚖ Dependency licenses reviewed for your distribution model. The SBOM lists weak-copyleft
      components that need notices: libvips (LGPL-3.0, via sharp), lightningcss (MPL-2.0),
      elkjs (EPL-2.0), caniuse-lite (CC-BY-4.0).

## 6. Backups and recovery

- [ ] `rentagent backup` runs daily (cron) and copies are stored off the server, encrypted.
- [ ] A restore was tested on a separate server (`rentagent restore <dir>`), including sign-in and
      decrypting a provider key (proves the `.env` copy matches).
- [ ] Monitoring alerts when `/api/health` is not `"ok"` and when disk usage exceeds 80%.

## 7. Personal data map

Defaults of a standard installation. Adjust the "basis" column with your lawyer (⚖) and record it
in your records of processing.

| Data | Purpose | Basis (to confirm) | Storage | Retention | Third parties |
|------|---------|--------------------|---------|-----------|---------------|
| Account: name, email, password hash, language, role, 2FA secret (encrypted) and backup codes | Account, security | Contract | PostgreSQL `users`, `accounts`, `two_factors` | Until account deletion | Email provider (address only) |
| Sessions: IP address, user agent, expiry | Security | Legitimate interest | `sessions` | Until expiry (7 days), then purged hourly | — |
| Email verification / reset tokens | Account security | Contract | `verifications` | Until expiry, then purged | Email provider |
| Chats: messages, agent answers, tool inputs/outputs, approvals, ratings | The service | Contract | `conversations`, `runs`, `run_steps`, `approvals` | Your retention setting (default 180 days after last activity) or until deleted by the user | **AI providers you enabled** (message content) |
| Knowledge files and their text chunks/embeddings (uploaded by staff) | Agent knowledge | Legitimate interest / contract | `files`, `chunks`, files volume | Until deleted by staff | AI provider for embeddings; ClamAV (local) |
| AI usage: tokens, cost, model, user link | Cost control, billing | Legitimate interest | `ai_usage_records` | User link removed after 395 days; totals kept | — |
| Credits: balance, ledger, payments, subscriptions | Billing, accounting | Contract; legal obligation | `wallets`, `ledger_entries`, `payments`, `subscriptions` | ⚖ accounting law (ledger/payments keep an opaque user id after account deletion) | Stripe / PayPal |
| API keys (if the public API is on): name, scopes, agent list, dates; secret stored only as SHA-256 hash | API access | Contract | Until revoked or account deletion | — |
| Scheduled tasks (if on): name, task fields, schedule, trigger data; trigger secret encrypted | Running users' tasks | Contract | Until the task is deleted (results like chats) | — |
| Audit log: actor id, action, one-way IP hash | Security, accountability | Legitimate interest | `audit_logs` | 365 days | — |
| Consent records: random id, choices, policy version | Proof of cookie consent | Legal obligation | `consent_records` | 395 days | — |
| Webhook deliveries: event payloads (no chat content), response codes | Integrations | Legitimate interest | `webhook_deliveries` | 30 days | Your webhook receivers |
| Logs: request metadata, errors (secrets redacted) | Operations | Legitimate interest | Docker logs | 5 × 20 MB per service (rotated) | — |

User rights: users download their data and delete chats or their account under
_My account › Privacy and data_; other requests (correction, objection, restriction) arrive at your
privacy email and are handled manually.

- [ ] ⚖ Records of processing, data-processing agreements with AI providers, email, payment and
      hosting providers; transfer safeguards for providers outside your region.
- [ ] ⚖ Israel: Privacy Protection Law incl. Amendment 13 — database obligations, security
      regulations, whether a privacy officer is required.
- [ ] ⚖ EU/UK users: GDPR — lawful basis per purpose, DPIA for AI processing if required, DPO,
      EU representative if you are outside the EU.
- [ ] ⚖ Agents processing sensitive data (health, finance, children, biometrics) need a dedicated
      legal and security review before launch.

## 8. Cookies and trackers

| Name | Provider | Type | Category | Purpose | Duration | Consent |
|------|----------|------|----------|---------|----------|---------|
| `ra.session_token` / `__Secure-ra.session_token` | This site | Cookie (HttpOnly, Secure, SameSite) | Essential | Sign-in | 7 days, renewed | Not required |
| `ra.dont_remember` | This site | Cookie | Essential | End session when the browser closes | Session | Not required |
| `ra.two_factor` | This site | Cookie | Essential | Two-factor step | Minutes | Not required |
| `ra_locale` | This site | Cookie | Essential (preference) | Language | 1 year | Not required |
| `ra_consent` | This site | Cookie | Essential | Cookie choices | 6 months | Not required |
| `ra_widget_…` | This site (inside the widget iframe) | sessionStorage | Essential | Keeps a widget chat for the tab | Until the tab closes | Not required |
| `ra_a11y` | This site | localStorage | Functional (stays on the device) | Accessibility preferences | Until reset | Not required (set only by the user's action) |
| Stripe / PayPal checkout cookies | Stripe / PayPal | Third-party cookies on their pages | Essential for payment | Fraud prevention | Provider's policy | Provider's notice |

The product loads **no analytics or marketing scripts**. If you add any:

- [ ] Add each tool to this table and to the cookie policy (own text under Admin › Legal pages).
- [ ] Load it only after consent for its category; "Reject all" is as easy as "Accept all"; no
      pre-ticked categories; choices can be changed from the footer link at any time.
- [ ] Verify in the browser's network tab that nothing is sent to the tool before consent and after
      withdrawal.

## 9. Legal documents

Drafts are generated from this installation under Admin › Legal pages (en/he/ar/ru).

- [ ] Company details, privacy email, accessibility coordinator filled in.
- [ ] ⚖ Privacy policy reviewed.
- [ ] ⚖ Cookie policy reviewed.
- [ ] ⚖ Terms of use reviewed (refunds and cancellation per consumer law, governing law, age).
- [ ] ⚖ Accessibility statement reviewed; known limitations and last manual audit date added.
- [ ] Each document marked "Reviewed by a qualified professional" only after review.

## 10. Accessibility (WCAG 2.1 AA, IS 5568)

Automated axe checks run on all main screens in the product's test suite. Before launch:

- [ ] Keyboard only: every flow (sign-up, chat, approvals, payment, cookie banner, accessibility
      menu, admin forms) works with Tab/Shift+Tab/Enter/Space/Escape, with visible focus.
- [ ] Screen reader (NVDA + Firefox/Chrome, VoiceOver + Safari): headings, form errors, live chat
      updates and dialogs are announced.
- [ ] Zoom 200% and 320 px width: no loss of content or function.
- [ ] Right-to-left languages: layout, mixed text, numbers.
- [ ] Your colors pass the contrast check (Admin › Branding) and your logo has adequate contrast.
- [ ] Your own content: agent descriptions, uploaded documents, custom legal texts.
- [ ] ⚖ Accessibility audit by a qualified consultant (required for some organisations in Israel).

## 11. Mobile, performance and SEO

- [ ] Main pages tested on a phone (iOS Safari, Android Chrome).
- [ ] Server sized per `REQUIREMENTS.md`; for more than ~50 concurrent active users, run more web
      instances or a larger server (see the load test notes there).
- [ ] Site name, home texts and agent descriptions set for search results; `robots.txt` and
      `sitemap.xml` reachable; private areas (`/admin`, `/account`, `/chats`) are disallowed.

## 12. Professional sign-off

| Topic | Who | Done |
|-------|-----|------|
| Privacy (Amendment 13 / GDPR), DPAs, transfers | Lawyer / privacy officer | ☐ |
| Terms, consumer law, refunds, invoices and tax | Lawyer / accountant | ☐ |
| Accessibility statement and audit | Accessibility consultant | ☐ |
| Security of the deployment | Penetration tester | ☐ |
| Dependency licenses for your distribution | Lawyer | ☐ |
