# RentAgent — Server Requirements

RentAgent is installed on **your own server**. All data (users, conversations, files, API keys)
stays on that server. Only the license key, domain and installed version are sent to the vendor
for license validation and update checks.

> Figures below are initial estimates and will be validated by load tests before general availability.

## 1. Hardware

| | Minimum (up to ~50 active users) | Recommended (up to ~500 active users) |
|---|---|---|
| CPU | 4 vCPU (x86_64 or arm64) | 8 vCPU |
| RAM | 8 GB | 16 GB |
| Disk | 60 GB SSD | 200 GB NVMe |

- **Malware scanning (ClamAV)** needs roughly 2–3 GB of additional RAM. It is optional and can be
  enabled later (`COMPOSE_PROFILES=clamav`).
- **Local AI models (Ollama)** are optional and need a GPU or a separate GPU server. Cloud AI
  providers work without any GPU.
- The installer refuses to run with less than 4 GB RAM and warns below 8 GB.

## 2. Operating system and software

| Requirement | Supported |
|---|---|
| OS | Ubuntu 22.04 LTS / 24.04 LTS, Debian 12 / 13 (64-bit) |
| Container runtime | Docker Engine 24+ with the Docker Compose v2 plugin |
| Tools | `bash`, `openssl`, `curl` (present on supported OSes) |
| Access | A user with `sudo` for installation |

Shared hosting, cPanel/Plesk-only hosting and Windows servers are **not supported** — the platform
needs long-running background processes, a database and a queue.

Install Docker using the official guide: <https://docs.docker.com/engine/install/>.

## 3. Network

- A **domain or subdomain** (e.g. `agents.example.com`) with an `A` (and optionally `AAAA`) record
  pointing to the server.
- Inbound ports **80** and **443** (TCP, plus UDP 443 for HTTP/3) open and not used by another web
  server. HTTPS certificates are issued automatically by Let's Encrypt.
- Outbound HTTPS (443) to:
  - the AI providers you configure (e.g. OpenAI, Anthropic, Google, …),
  - `ghcr.io` (application images) and Docker Hub (database, cache and proxy images),
  - the vendor license server,
  - your SMTP server (usually port 587 or 465).

## 4. Email

An SMTP account for transactional email (verification, password reset, notifications). Any
provider works (e.g. Amazon SES, Postmark, Mailgun, Google Workspace, Microsoft 365).
Configure SPF, DKIM and DMARC for the sender domain to avoid spam filtering.

## 5. Backups

- `rentagent backup` creates a local backup (database, uploaded files, configuration).
- **Copy backups off the server** (e.g. to S3-compatible storage) — a backup on the same disk does
  not protect against disk loss. Backups contain secrets; store them encrypted.
- Keep a safe copy of `/opt/rentagent/.env`. Losing `APP_ENCRYPTION_KEY` makes stored secrets
  (AI provider keys, SMTP password) unrecoverable.

## 6. What runs on the server

| Container | Purpose | Exposed |
|---|---|---|
| `caddy` | HTTPS termination, automatic certificates | 80, 443 |
| `web` | Web application and API | internal only |
| `worker` | Agent runs, background jobs | internal only |
| `postgres` | Database (with pgvector) | internal only |
| `redis` | Queues, rate limiting | internal only |
| `migrate` | Applies database migrations on start/update, then exits | — |
| `clamav` (optional) | Malware scanning of uploads | internal only |
| `ollama` (optional) | Local AI models | internal only |

The database and cache run on an isolated internal network and are never reachable from outside.

## 7. Installation (summary)

```bash
tar -xzf rentagent-<version>.tar.gz && cd rentagent-<version>
sudo ./install.sh --domain agents.example.com --email you@example.com --locale en
```

Then open `https://agents.example.com/<locale>/setup` and enter the setup token printed by the
installer (`sudo rentagent setup-token` shows it again).

## 8. Operations

```
sudo rentagent status          # services, health, disk
sudo rentagent logs [service]  # follow logs
sudo rentagent backup          # backup database, files, configuration
sudo rentagent update [ver]    # backup → update → automatic rollback on failure
sudo rentagent restore <dir>   # restore a backup
```
