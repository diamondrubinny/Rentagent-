# RentAgent

Self-hosted, white-label platform for renting AI agents. Operators install it on their own
server, connect the AI providers they want (OpenAI, Anthropic, Google, Mistral, any
OpenAI-compatible endpoint, local models…), build and manage agents, and let their users rent them.

- Product plan and roadmap: [`PLAN.md`](PLAN.md) (Hebrew)
- Server requirements for customers: [`deploy/REQUIREMENTS.md`](deploy/REQUIREMENTS.md)
- Phase notes: [`docs/phase-1.md`](docs/phase-1.md), [`docs/phase-2.md`](docs/phase-2.md), [`docs/phase-3.md`](docs/phase-3.md)

## Status

- Phase 1 (foundation): installable stack, multilingual UI (he/en/ar/ru, automatic RTL), initial
  setup wizard, security headers, health checks, backup/update CLI.
- Phase 2 (users): accounts, email verification, password reset, two-factor authentication,
  roles and permissions, admin user management, audit log, transactional email via the worker.
- Phase 3 (AI providers): 15 provider types plus any OpenAI-compatible server, encrypted keys with
  rotation/cooldown/monthly caps, model registry with costs and prices, routing policies with
  fallback, streaming playground, usage metering, emergency stop.
- Next: agents (4), user experience (5), customization and billing (6), licensing and compliance (7).

## Repository layout

```
apps/web        Next.js app (UI + API), next-intl, Tailwind
apps/worker     Background worker (BullMQ), bundled into one file
packages/core   Server utilities: env validation, AES-256-GCM secrets, logger, Redis, rate limit
packages/db     Prisma 7 schema, migrations, typed settings
packages/mail   Transactional email templates (all locales) and SMTP transport
packages/ai-gateway  AI providers (Vercel AI SDK), discovery, routing/fallback, metering, SSRF guard
packages/shared Isomorphic code: locales/RTL, money (ISO 4217 minor units), Zod schemas
deploy/         Docker Compose stack, Caddy, installer, `rentagent` CLI, requirements
scripts/        Release packaging
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
