# RentAgent

Self-hosted, white-label platform for renting AI agents. Operators install it on their own
server, connect the AI providers they want (OpenAI, Anthropic, Google, Mistral, any
OpenAI-compatible endpoint, local models…), build and manage agents, and let their users rent them.

- Product plan and roadmap: [`PLAN.md`](PLAN.md) (Hebrew)
- Server requirements for customers: [`deploy/REQUIREMENTS.md`](deploy/REQUIREMENTS.md)
- Public API: [`docs/API.md`](docs/API.md) · Operator guide: [`docs/OPERATOR.md`](docs/OPERATOR.md) · Production checklist: [`docs/PRODUCTION-CHECKLIST.md`](docs/PRODUCTION-CHECKLIST.md) · Licensing (vendor): [`docs/LICENSING.md`](docs/LICENSING.md)
- Phase notes: [`docs/phase-1.md`](docs/phase-1.md), [`docs/phase-2.md`](docs/phase-2.md), [`docs/phase-3.md`](docs/phase-3.md), [`docs/phase-4.md`](docs/phase-4.md), [`docs/phase-5.md`](docs/phase-5.md), [`docs/phase-5-5.md`](docs/phase-5-5.md), [`docs/phase-6.md`](docs/phase-6.md), [`docs/phase-7.md`](docs/phase-7.md)

## Status

- Phase 1 (foundation): installable stack, multilingual UI (he/en/ar/ru, automatic RTL), initial
  setup wizard, security headers, health checks, backup/update CLI.
- Phase 2 (users): accounts, email verification, password reset, two-factor authentication,
  roles and permissions, admin user management, audit log, transactional email via the worker.
- Phase 3 (AI providers): 15 provider types plus any OpenAI-compatible server, encrypted keys with
  rotation/cooldown/monthly caps, model registry with costs and prices, routing policies with
  fallback, streaming playground, usage metering, emergency stop.
- Phase 4 (agents): agent builder with versions, 8 templates, import/export, run loop in the worker,
  built-in tools (calculator, time, guarded web fetch, knowledge search, email), operator HTTP tools
  and MCP servers, human approval for side effects, knowledge base (RAG on pgvector) with
  quarantine and optional ClamAV scanning, live run view.
- Phase 5 (end users): public or private agent catalog with multilingual and semantic search, chat
  with streamed answers and follow-ups, user approvals, feedback, downloads, chat history, data
  export, history and account deletion, automatic retention.
- Phase 5.5 (languages): enable any of 53 UI languages, machine translation through the operator's
  AI with ICU format checks and review status, string editor with overrides, default language,
  agent name/description translation.
- Phase 6 (customization and billing): credit wallets with an append-only ledger and per-run
  holds; Stripe and PayPal top-ups; Stripe subscriptions with plans and the customer portal;
  branding with contrast-checked colors, logo and favicon; feature switches; signed outgoing
  webhooks; public pricing page.
- Phase 7 (licensing, compliance, launch): accessibility menu; privacy policy, terms, cookie policy
  and accessibility statement drafted from the installation's real configuration (4 languages,
  operator overrides, "reviewed" sign-off); Ed25519 license keys verified offline with an optional
  daily online check, white-label gating and a vendor license server + CLI; SMTP settings after
  setup; retention of operational records; operator guide, production checklist, load test, SBOM
  and dependency license policy in CI.
- V2.1a (public API): user API keys with scopes, agent restrictions and expiry; REST API with
  streaming, approvals and OpenAPI 3.1; staff overview and revocation.
- V2.1b (website widget): one-line embed script, iframe limited to allowed sites, invisible
  proof-of-work check (ALTCHA), per-visitor isolation, daily run cap, owner approvals.

## Repository layout

```
apps/web        Next.js app (UI + API), next-intl, Tailwind
apps/worker     Background worker (BullMQ), bundled into one file
apps/license-server  Vendor-only license server and `license-admin` CLI (not part of an installation)
packages/core   Server utilities: env validation, AES-256-GCM secrets, logger, Redis, rate limit
packages/db     Prisma 7 schema, migrations, typed settings
packages/mail   Transactional email templates (all locales) and SMTP transport
packages/ai-gateway  AI providers (Vercel AI SDK), discovery, routing/fallback, metering, SSRF guard
packages/agent-runtime  Agent loop, tools (built-in, HTTP, MCP), file checks, text extraction, templates
packages/shared Isomorphic code: locales/RTL, money (ISO 4217 minor units), Zod schemas
packages/billing  Credit wallets, ledger, Stripe and PayPal
packages/webhooks Signed outgoing webhooks
packages/license  License token verification (Ed25519), online check protocol, vendor signing
deploy/         Docker Compose stack, Caddy, installer, `rentagent` CLI, requirements
scripts/        Release packaging, SBOM and dependency license policy
```

## Development

Requirements: Node.js 22 LTS, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
docker compose -f deploy/docker-compose.dev.yml up -d     # Postgres + Redis
cp .env.example apps/web/.env.local                        # fill APP_ENCRYPTION_KEY and SETUP_TOKEN
cp apps/web/.env.local apps/worker/.env
pnpm db:generate
DATABASE_URL=postgresql://rentagent:rentagent@localhost:5432/rentagent pnpm db:deploy
pnpm dev                                                   # http://localhost:3000
```

Generate secrets: `openssl rand -base64 32` (encryption key), `openssl rand -base64 36` (setup token).

Schema changes: edit `packages/db/prisma/schema.prisma`, then
`DATABASE_URL=… pnpm db:migrate --name <change>` and commit the generated migration.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
shellcheck deploy/install.sh deploy/rentagent scripts/*.sh
pnpm audit --prod
```

## Production

Customers install from a release bundle (built by `.github/workflows/release.yml` on a `v*` tag):

```bash
sudo ./install.sh --domain agents.example.com --email ops@example.com --locale en
```

To run the stack from a source checkout (vendor testing):

```bash
cd deploy && sudo ./install.sh --build --domain localhost --yes
```

See `deploy/REQUIREMENTS.md` for hardware, network and backup requirements.

## Security notes

- Secrets live only in `/opt/rentagent/.env` (mode 600) and are never sent to the browser or logs.
- Stored third-party secrets are encrypted with AES-256-GCM, bound to their field (AAD), with key
  rotation support (`APP_ENCRYPTION_KEYS_PREVIOUS`).
- Strict nonce-based CSP, HSTS, frame denial; containers run as non-root with read-only file
  systems, no capabilities, and the database/cache on an internal-only network.
- Report vulnerabilities privately to the vendor; do not open public issues for security bugs.
