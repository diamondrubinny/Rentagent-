# RentAgent — אפיון ותוכנית עבודה (שלב 0)

> סטטוס: **טיוטה לאישור**. אין עדיין קוד. לאחר אישור/תיקון, נבנה לפי השלבים בסעיף 12.
> כל מזהה מודל, מחיר או יכולת של ספק AI — **דורש אימות מול התיעוד הרשמי** לפני פרודקשן ולכן לא יקודד קשיח בקוד (ראו "Model Registry").

---

## 1. סיכום ההבנה

פלטפורמת Marketplace + Runtime לסוכני AI:

- **שוכרים (Renters)** — אנשים/עסקים ששוכרים סוכן מוכן ("סוכן מחקר שוק", "סוכן גיוס", "סוכן תמיכת לקוחות", "סוכן דוחות", "סוכן קוד") ומפעילים אותו למשימה, לפי זמן או במנוי.
- **יוצרים (Creators)** — בונים סוכנים (No-code builder או API), מפרסמים בחנות, ומקבלים חלק מההכנסה.
- **הפלטפורמה** — מריצה את הסוכנים בצורה מאובטחת מול כל ספקי ה־AI, מודדת עלויות, מחייבת, מנטרת ומגינה.

ערך עסקי: עמלה על כל השכרה (take rate), מנויים, ו־markup על צריכת טוקנים (או BYOK — המשתמש מביא מפתח משלו).

---

## 2. הנחות עבודה ושאלות פתוחות

### הנחות (אם לא תגיד אחרת)
1. קהל יעד: ישראל + בינלאומי → עברית (RTL) ואנגלית מהיום הראשון; GDPR + חוק הגנת הפרטיות (תיקון 13).
2. Web App רספונסיבי (PWA). אפליקציית מובייל נייטיב — שלב מאוחר.
3. תשלומים דרך Stripe (+ Stripe Connect לתשלום ליוצרים). סליקה ישראלית (Cardcom/Tranzila וכו') — אופציונלי, **דורש אימות** יכולות API.
4. פריסה ראשונית: שרת יחיד/ענן מנוהל (Docker), ניתן להתרחבות.
5. MVP תוך ~6 שלבים; כל שלב נמסר כקוד מלא שרץ.

### שאלות (עד 5)
1. **מודל תמחור** — מה חשוב לך ב־MVP: תשלום לפי משימה, לפי שעה, מנוי חודשי, Credits, או כולם?
2. **מי בונה סוכנים ב־MVP** — רק אתה (צוות הפלטפורמה) או כבר יוצרים חיצוניים עם חלוקת הכנסות?
3. **BYOK** — לאפשר למשתמש להביא מפתח API משלו (OpenAI/Anthropic וכו'), או שהפלטפורמה משלמת ומחייבת?
4. **פעולות בעולם האמיתי** — האם הסוכנים יורשו לשלוח מיילים/הודעות, לגלוש באתרים, להריץ קוד, לבצע רכישות? (משפיע מאוד על אבטחה ועל אישורי Human-in-the-loop.)
5. **תקציב ואירוח** — יש העדפה (Vercel/AWS/GCP/Hetzner/שרת קיים)? ותקציב חודשי משוער לתשתית?

---

## 3. פיצ'רים (מה שמבוקש בשוק — 2026)

סימון: **[MVP]** = בשלבים 1–6 · **[V2]** = אחרי השקה · **[V3]** = Enterprise

### Marketplace
- קטלוג סוכנים עם קטגוריות, חיפוש, סינון, דירוגים וביקורות מאומתות (רק מי ששכר) **[MVP]**
- עמוד סוכן: יכולות, כלים שהוא משתמש בהם, הרשאות נדרשות, מחיר משוער, דוגמאות פלט **[MVP]**
- "Try before you rent" — הרצת ניסיון מוגבלת **[MVP]**
- תגי אמון: "Verified creator", "Security reviewed" **[V2]**

### השכרה ותמחור
- מודלים: Per-task (מחיר קבוע), Per-hour/מטר זמן, Subscription, Credits/Usage **[MVP: per-task + credits]**
- אומדן עלות לפני הרצה + תקרת הוצאה (Budget cap) לכל השכרה **[MVP]**
- Outcome-based: חיוב רק אם המשימה הושלמה/אושרה, החזר אוטומטי בכישלון **[V2]**
- Escrow ליוצרים עד אישור הלקוח **[V2]**

### Runtime של הסוכן
- כל ספקי ה־AI דרך שכבה אחידה + Fallback אוטומטי בין ספקים + Model routing לפי עלות/איכות **[MVP]**
- Streaming של תשובות וצעדים בזמן אמת **[MVP]**
- Tool use / Function calling **[MVP]**
- **MCP** (Model Context Protocol) — חיבור כלים חיצוניים סטנדרטיים **[MVP: client]**
- Knowledge base / RAG — העלאת מסמכים לסוכן (pgvector) **[MVP]**
- זיכרון ארוך טווח לכל השכרה **[V2]**
- Web search + קריאת דפים **[MVP]**
- Code interpreter בסנדבוקס מבודד **[V2]**
- Browser automation / Computer use בסנדבוקס **[V2]**
- Multi-agent workflows (סוכן מנהל + סוכני משנה), Workflow builder ויזואלי **[V2]**
- Human-in-the-loop: אישור לפני פעולה רגישה (שליחת מייל, תשלום, מחיקה) **[MVP]**
- משימות מתוזמנות (Cron) ו־Triggers (Webhook, מייל נכנס) **[V2]**
- Background jobs ארוכים עם התקדמות, עצירה והמשך **[MVP]**

### ערוצים
- צ'אט בווב **[MVP]** · Widget להטמעה באתר **[V2]** · WhatsApp / Telegram / Slack / Email **[V2]** · Voice agent **[V3]**

### Creator Studio
- No-code Agent Builder: Prompt, מודל, כלים, ידע, משתני קלט, טופס קלט למשימה **[MVP]**
- גרסאות (versioning) + Preview + פרסום **[MVP]**
- Evals: סט בדיקות אוטומטי לפני פרסום **[V2]**
- דשבורד הכנסות + Payouts (Stripe Connect) **[V2]**
- API/SDK ליוצרים מתקדמים **[V3]**

### Observability ועלויות
- Trace מלא לכל ריצה: צעדים, קריאות כלים, טוקנים, עלות, זמן **[MVP]**
- דשבורד הוצאות למשתמש + התראות על תקציב **[MVP]**
- Admin: ניטור ספקים, שיעורי כשל, עלות לפי ספק **[MVP]**

### צוותים ו־Enterprise
- Organizations, תפקידים (Owner/Admin/Member/Viewer) **[MVP בסיסי]**
- SSO (SAML/OIDC), Audit log מלא, Data residency, White-label **[V3]**
- Public API + API keys למשתמשים **[V2]**

### Trust & Safety
- Guardrails: חסימת Prompt injection בסיסית, סינון תוכן, PII redaction בלוגים **[MVP]**
- Moderation לסוכנים שמפורסמים (בדיקה ידנית + אוטומטית) **[MVP]**
- Rate limits, Kill-switch לסוכן/ספק **[MVP]**

---

## 4. User Stories (MVP)

| # | כ... | אני רוצה... | כדי ש... |
|---|------|-------------|----------|
| 1 | שוכר | לחפש סוכן לפי קטגוריה ודירוג | אמצא סוכן מתאים מהר |
| 2 | שוכר | לראות אומדן מחיר ותקרת הוצאה לפני הרצה | לא אופתע בחשבון |
| 3 | שוכר | למלא טופס משימה ולהפעיל סוכן | הסוכן יבצע עבורי עבודה |
| 4 | שוכר | לראות בזמן אמת מה הסוכן עושה ולאשר פעולות רגישות | אשמור שליטה |
| 5 | שוכר | לקבל תוצר (טקסט/קובץ) ולדרג | אקבל ערך ואעזור לאחרים |
| 6 | שוכר | לרכוש Credits ולראות היסטוריית חיובים | אנהל תקציב |
| 7 | יוצר | לבנות סוכן ב־Builder ולבחור מודל וכלים | אפרסם בלי לכתוב קוד |
| 8 | יוצר | לבדוק את הסוכן ב־Preview ולפרסם גרסה | אשחרר בביטחון |
| 9 | אדמין | לאשר/לחסום סוכנים ולראות עלויות לפי ספק | אשמור על איכות ורווחיות |
| 10 | אדמין | להשבית ספק או מודל בלחיצה | אגיב לתקלה/דליפה |
| 11 | משתמש | להתחבר עם מייל+סיסמה/Google ולהפעיל 2FA | החשבון יהיה מאובטח |
| 12 | משתמש | לייצא/למחוק את המידע שלי | אממש זכויות פרטיות |

---

## 5. מסכים וזרימות

**ציבורי:** דף בית · קטלוג · עמוד סוכן · תמחור · התחברות/הרשמה/איפוס · מדיניות פרטיות · תנאי שימוש · מדיניות עוגיות · הצהרת נגישות · 404/500

**שוכר:** Dashboard · "ההשכרות שלי" · מסך ריצה (צ'אט + Timeline צעדים + אישורים) · תוצרים/קבצים · ארנק Credits וחשבוניות · הגדרות (פרופיל, 2FA, Sessions, API keys, BYOK, פרטיות/ייצוא/מחיקה) · ארגון וחברים

**יוצר:** הסוכנים שלי · Agent Builder (Prompt · מודל · כלים · ידע · טופס קלט · תמחור) · Preview · גרסאות · אנליטיקס/הכנסות

**אדמין:** Moderation queue · משתמשים · ספקים ומודלים (Registry + kill-switch) · עלויות · Audit log · אירועי אבטחה

**זרימה מרכזית — השכרה:**
```
קטלוג → עמוד סוכן → "השכר" → טופס משימה + תקרת הוצאה
  → בדיקת יתרה/הקפאת סכום (hold) → Job בתור → Worker מריץ לולאת סוכן
  → Streaming לצד לקוח (SSE) → [אישור אנושי לפעולה רגישה]
  → תוצר → חיוב סופי לפי שימוש בפועל (≤ תקרה) → דירוג
```

---

## 6. ארכיטקטורה

```
                ┌──────────────── Browser (Next.js, RTL/LTR, PWA) ───────────────┐
                └───────────────┬────────────────────────────────────────────────┘
                                │ HTTPS (SSE לסטרימינג)
┌───────────────────────────────▼───────────────────────────────┐
│ apps/web — Next.js App Router (UI + Route Handlers / API)     │
│  Auth · RBAC · Zod validation · Rate limit · CSRF · CSP        │
└───────┬──────────────────────┬───────────────────────┬────────┘
        │                      │                       │
   PostgreSQL+pgvector      Redis (queues,          Object storage (S3)
   (Prisma)                 rate-limit, pub/sub)     quarantine → ClamAV → clean
        │                      │
┌───────▼──────────────────────▼────────────────────────────────┐
│ apps/worker — BullMQ workers                                   │
│  Agent loop · Tool executor · RAG ingest · File scan · Billing  │
│        │                                                       │
│  packages/ai-gateway  ── Provider adapters + routing + fallback │
│        │               ── Cost metering · Guardrails · Tracing  │
│  Sandbox (E2B / Docker-gVisor) for code & browser  [V2]         │
└────────┼───────────────────────────────────────────────────────┘
         ▼
  OpenAI · Anthropic · Google · xAI · Mistral · Cohere · DeepSeek ·
  Groq · Together · Fireworks · Perplexity · AWS Bedrock · Azure OpenAI ·
  OpenRouter · Ollama/vLLM (self-hosted, OpenAI-compatible)
```

### שכבת ספקי AI ("כל הספקים")
- **בסיס:** Vercel AI SDK (`ai` + `@ai-sdk/*`) — ממשק אחיד ל־streaming, tool calling ו־structured output, עם providers רשמיים/קהילתיים לרוב הספקים ברשימה. ספק שאין לו adapter → דרך **OpenAI-compatible adapter** (רבים מהספקים חושפים API תואם). **דורש אימות** לכל ספק בנפרד.
- **Model Registry בבסיס הנתונים** (לא בקוד): `provider, modelId, capabilities (tools/vision/json/reasoning), contextWindow, pricing per 1M tokens, enabled, region`. אדמין מעדכן בלי deploy.
- **Routing:** לפי מדיניות הסוכן — `fixed` / `cheapest-capable` / `fastest` / `best-quality`, עם **fallback chain** בכשל/Rate-limit.
- **BYOK:** מפתחות משתמש מוצפנים (AES-256-GCM, envelope encryption, מפתח-על ב־KMS/ENV), לעולם לא חוזרים לקליינט.

### החלטות טכנולוגיות + חלופות

| תחום | בחירה | למה | חלופות | מגבלות |
|------|-------|-----|--------|--------|
| שפה | TypeScript מקצה לקצה | טיפוסים משותפים, ולידציה משותפת | Python לחלק ה־AI | פחות ספריות ML מ־Python |
| Monorepo | pnpm + Turborepo | שיתוף packages | Nx | עקומת למידה קטנה |
| Web | Next.js (App Router) | SSR/SEO לקטלוג + API באותו מקום | Remix, SvelteKit | Vendor-ish, מורכבות caching |
| UI | Tailwind + shadcn/ui (Radix) | רכיבים נגישים, RTL עם logical props | MUI, Chakra | צריך הקפדה על RTL |
| i18n | next-intl | תמיכה טובה ב־App Router | i18next | — |
| DB | PostgreSQL + Prisma + pgvector | רלציוני + וקטורי במקום אחד | Drizzle; Pinecone/Qdrant | pgvector פחות מהיר בסקייל ענק |
| Queue | Redis + BullMQ | Jobs ארוכים, retries, cron | Temporal, Inngest | Temporal עדיף לזרימות ארוכות מאוד (שקול ב־V2) |
| Auth | Better Auth | 2FA, Organizations, Passkeys, OAuth, self-hosted | Auth.js, Clerk (מנוהל) | ספרייה צעירה יחסית — **דורש אימות** פיצ'רים |
| Payments | Stripe + Connect | Credits, מנויים, payouts ליוצרים | Paddle (MoR), סליקה ישראלית | עמלות; Connect דורש KYC |
| Files | S3-compatible + ClamAV | הסגר וסריקה | שירות סריקה מנוהל | ClamAV צורך RAM |
| Sandbox | E2B / Docker+gVisor | בידוד קוד ודפדפן | Firecracker, Modal | עלות/מורכבות — V2 |
| Observability | OpenTelemetry + Langfuse (self-host) | Traces של LLM + עלויות | Helicone, LangSmith | עוד שירות להפעיל |
| Errors | Sentry (עם scrubbing) | ניטור שגיאות | GlitchTip | שליחת מידע לצד ג' — לנקות PII |

---

## 7. סכמת בסיס נתונים (עיקרי)

```
User(id, email, emailVerified, name, locale, createdAt, deletedAt)
Account / Session / TwoFactor / Passkey      — מנוהל ע"י Better Auth
Organization(id, name, slug, plan)
Membership(userId, orgId, role: OWNER|ADMIN|MEMBER|VIEWER)

Agent(id, orgId(owner creator), slug, name, category, status: DRAFT|REVIEW|PUBLISHED|SUSPENDED,
      visibility, ratingAvg, ratingCount)
AgentVersion(id, agentId, version, systemPrompt, modelPolicy(json), tools(json),
             inputSchema(json), pricing(json), requiredPermissions(json), publishedAt)
KnowledgeSource(id, agentId|rentalId, fileId, status)
Chunk(id, sourceId, content, embedding vector, metadata)

Rental(id, orgId, userId, agentVersionId, pricingModel, budgetCapCents, status, startsAt, endsAt)
Run(id, rentalId, status: QUEUED|RUNNING|WAITING_APPROVAL|SUCCEEDED|FAILED|CANCELED,
    input(json), output(json), costCents, tokensIn, tokensOut, startedAt, finishedAt)
RunStep(id, runId, idx, type: LLM|TOOL|APPROVAL|MESSAGE, provider, model, payload(json, redacted),
        tokensIn, tokensOut, costMicros, latencyMs)
Approval(id, runStepId, action, status: PENDING|APPROVED|REJECTED, decidedBy, decidedAt)
Message(id, runId, role, content, createdAt)

Provider(id, key, displayName, baseUrl, enabled)
Model(id, providerId, modelId, capabilities(json), contextWindow, inputPricePer1M, outputPricePer1M, enabled)
ProviderCredential(id, orgId|null(platform), providerId, encryptedKey, keyVersion, last4)

Wallet(orgId, balanceCents)
LedgerEntry(id, orgId, type: TOPUP|HOLD|CAPTURE|RELEASE|REFUND|PAYOUT, amountCents, refType, refId)  — double-entry, immutable
Payment(id, orgId, stripeId, amountCents, status)
CreatorPayout(id, creatorOrgId, amountCents, status, stripeTransferId)

Review(id, agentId, userId, rentalId, rating, text, status)
File(id, orgId, key, mime, size, sha256, scanStatus: PENDING|CLEAN|INFECTED|ERROR)
ApiKey(id, orgId, hashedKey, prefix, scopes, lastUsedAt, revokedAt)
AuditLog(id, actorId, orgId, action, target, ip(hashed), createdAt)
ConsentRecord(id, anonId, policyVersion, categories(json), createdAt)
```
כל שאילתה על משאב מסוננת לפי `orgId` בשכבת ה־data access (מניעת IDOR/BOLA), ובנוסף בדיקת הרשאה לפי role.

---

## 8. API Endpoints (עיקרי)

| Method | Path | גישה |
|--------|------|------|
| GET | `/api/agents` · `/api/agents/:slug` | ציבורי |
| POST/PATCH | `/api/creator/agents` · `/:id/versions` · `/:id/publish` | יוצר (owner/admin של הארגון) |
| POST | `/api/rentals` | מחובר; בודק יתרה ותקרה |
| POST | `/api/rentals/:id/runs` | חבר בארגון השוכר |
| GET | `/api/runs/:id/stream` (SSE) | חבר בארגון השוכר |
| POST | `/api/runs/:id/cancel` · `/approvals/:id` | חבר (approve דורש MEMBER+) |
| POST | `/api/files` (upload → quarantine) | מחובר, rate-limited |
| GET/POST | `/api/wallet` · `/api/wallet/topup` | ADMIN/OWNER של הארגון |
| POST | `/api/webhooks/stripe` | ציבורי + אימות חתימה |
| CRUD | `/api/settings/api-keys` · `/byok` | OWNER/ADMIN |
| POST | `/api/privacy/export` · `/api/privacy/delete` | המשתמש עצמו (re-auth) |
| * | `/api/admin/*` | PLATFORM_ADMIN + MFA חובה |
| * | `/api/v1/*` (Public API) [V2] | API key עם scopes |

---

## 9. מבנה תיקיות

```
rentagent/
├─ apps/
│  ├─ web/                 # Next.js: UI + API route handlers
│  │  ├─ app/[locale]/(public|app|creator|admin)/...
│  │  ├─ app/api/...
│  │  ├─ components/  lib/  messages/he.json en.json
│  └─ worker/              # BullMQ workers: runs, ingest, scan, billing
├─ packages/
│  ├─ db/                  # Prisma schema, migrations, data-access (tenant-scoped)
│  ├─ ai-gateway/          # providers, registry, routing, fallback, metering
│  ├─ agent-runtime/       # agent loop, tools, MCP client, approvals, guardrails
│  ├─ billing/             # ledger, Stripe, pricing estimates
│  ├─ shared/              # zod schemas, types, constants
│  └─ ui/                  # shared accessible components
├─ infra/                  # docker-compose (postgres, redis, clamav, minio), Dockerfiles
├─ docs/                   # threat-model, data-map, legal drafts, a11y statement
├─ .env.example  README.md  PLAN.md
```

---

## 10. אבטחה, פרטיות, עוגיות ונגישות

### Threat Model (מקוצר)

| נכס | איום | סיכון | בקרה |
|-----|------|-------|------|
| מפתחות API (פלטפורמה + BYOK) | דליפה, שימוש לרעה | **קריטי** | Envelope encryption, אף פעם לא לקליינט/לוגים, rotation, מגבלת הוצאה לכל מפתח |
| ארנק/Credits | מניפולציית מחיר, race conditions | **גבוה** | Ledger אטומי (transactions + row lock), מחיר מחושב רק בשרת, idempotency keys, אימות חתימת webhook |
| מידע של שוכרים (קבצים, שיחות) | IDOR, דליפה בין ארגונים | **גבוה** | Tenant scoping בכל query, בדיקות אוטומטיות ל־BOLA, הצפנה במנוחה |
| סוכן זדוני של יוצר | Prompt שגונב מידע, exfiltration דרך כלים | **גבוה** | Moderation, הרשאות כלים מוצהרות ומאושרות ע"י השוכר, allowlist דומיינים, HITL לפעולות יוצאות |
| Prompt injection מתוכן חיצוני (דף/מסמך) | הסוכן מבצע פעולה לא רצויה | **גבוה** | הפרדת תוכן לא אמין, אישור אנושי לפעולות רגישות, כלים עם least privilege |
| כלי Fetch/Browser | SSRF לרשת פנימית | **גבוה** | חסימת IP פרטיים/metadata, egress proxy, sandbox |
| העלאת קבצים | נוזקות | בינוני | allowlist MIME (magic bytes), גודל, quarantine, ClamAV, שם קובץ אקראי, לא ב־public |
| חשבונות | Brute force, ATO | בינוני | Rate limit, 2FA, הודעות שגיאה כלליות, session revocation |
| עלויות LLM | Denial-of-wallet | גבוה | Budget cap לכל ריצה/ארגון, max steps, max tokens, kill-switch |

כותרות: CSP עם nonce, HSTS, `X-Frame-Options: DENY`/`frame-ancestors`, `Referrer-Policy`, Cookies `Secure; HttpOnly; SameSite=Lax`.

### Data Map (תמצית)

| מידע | מטרה | בסיס עיבוד (GDPR) | אחסון | שמירה | צד שלישי |
|------|------|-------------------|-------|-------|----------|
| מייל, שם | חשבון | חוזה | Postgres | חיי החשבון + 30 יום | ספק מייל (Resend/SES) |
| קלט משימה, שיחות, קבצים | ביצוע השירות | חוזה | Postgres/S3 מוצפן | ברירת מחדל 90 יום, ניתן לשינוי | **ספק ה־AI שנבחר** |
| נתוני תשלום | חיוב | חוזה + חובה חוקית | Stripe (לא אצלנו) | לפי דין (חשבונאות) | Stripe |
| לוגים/IP | אבטחה | אינטרס לגיטימי | לוגים (IP מגובב) | 90 יום | Sentry (מנוקה) |
| אנליטיקה | שיפור מוצר | הסכמה | — | 13 חודשים מקס' | רק אחרי הסכמה |

**קריטי:** תוכן משימות נשלח לספקי AI צד ג'. יש להציג למשתמש איזה ספק מעבד, לבדוק DPA ותנאי שימוש בנתונים (no-training) מול כל ספק, ולשקול העברת מידע מחוץ ל־EU/ישראל. — **דורש בדיקה משפטית**.

### עוגיות
- חיוניות: session, CSRF, locale, consent — ללא הסכמה.
- אנליטיקה/שיווק: נטענים **רק** אחרי הסכמה; באנר עם "אישור הכל" / "דחיית הכל" / "ניהול העדפות" בשווי משקל; קישור קבוע "הגדרות פרטיות ועוגיות" ב־Footer; ConsentRecord עם גרסת מדיניות.

### נגישות
- יעד WCAG 2.1 AA + ת"י 5568; Radix primitives, ניווט מקלדת מלא, focus גלוי, `aria-live` להודעות סטרימינג של הסוכן (polite, מצטבר — לא כל טוקן), RTL עם CSS logical properties, זום 200%, `prefers-reduced-motion`.
- רכיב התאמות נגישות קל משקל (לא תחליף), עמוד הצהרת נגישות (טיוטה).
- בדיקות: axe-core ב־Playwright + בדיקה ידנית עם NVDA/VoiceOver.

---

## 11. סיכונים ונושאים לבדיקה מקצועית

1. **משפטי:** אחריות על פעולות סוכן (מי אחראי כשסוכן שלח מייל שגוי?), תנאי שימוש של ספקי AI לגבי resale/markup — **דורש בדיקה משפטית** לכל ספק.
2. **EU AI Act** — חובות שקיפות (הודעה שהמשתמש מתקשר עם AI) ותלוי שימוש — **דורש בדיקה משפטית**.
3. **מרקטפלייס ותשלומים ליוצרים:** KYC, מע"מ/חשבוניות בישראל ובחו"ל, ייתכן שעדיף Merchant of Record — **דורש בדיקה חשבונאית/משפטית**.
4. **פרטיות:** מאגר מידע לפי החוק הישראלי, ממונה פרטיות, DPIA — **דורש בדיקה משפטית**.
5. **טכני:** עלויות LLM בלתי צפויות; שינויים תכופים ב־API של ספקים; Prompt injection הוא בעיה לא פתורה — מקטינים סיכון, לא מבטלים.
6. **אבטחה:** לפני השקה — בדיקת חדירות חיצונית, במיוחד ל־BOLA, ארנק, sandbox.

---

## 12. תוכנית עבודה לפי שלבים

| שלב | תוצר | בדיקות |
|-----|------|--------|
| **1. תשתית** | Monorepo, docker-compose (Postgres+pgvector, Redis, MinIO, ClamAV), Prisma schema, Next.js עם he/en + RTL, layout נגיש, דפי 404/500, כותרות אבטחה, `.env.example`, README, CI (lint/typecheck/test) | build + unit |
| **2. Auth + Orgs** | הרשמה/התחברות, אימות מייל, איפוס, 2FA, Google OAuth, ארגונים ותפקידים, rate limit, audit log | בדיקות הרשאות + BOLA |
| **3. AI Gateway** | Registry ספקים/מודלים, adapters לכל הספקים, routing+fallback, metering, BYOK מוצפן, מסך אדמין לספקים + kill-switch | unit עם mock providers |
| **4. Agent Runtime** | Worker + agent loop, tools (web search, fetch עם הגנת SSRF, HTTP, MCP client), HITL approvals, SSE streaming, traces, RAG + העלאת קבצים עם סריקה | integration |
| **5. Marketplace + Builder** | קטלוג, עמוד סוכן, Agent Builder, גרסאות, Preview, moderation queue, ביקורות | e2e Playwright + axe |
| **6. Billing** | Wallet + ledger, Stripe top-up + webhooks, hold/capture/refund, תקרות הוצאה, חשבוניות, דשבורד עלויות | בדיקות race/idempotency |
| **7. Compliance & Launch** | באנר עוגיות, טיוטות מדיניות/תנאים/הצהרת נגישות, ייצוא/מחיקת מידע, Checklist לפרודקשן | a11y, security scan, SBOM |
| V2+ | Sandbox קוד/דפדפן, multi-agent, cron/triggers, ערוצים (WhatsApp/Telegram/Slack/Widget), Stripe Connect payouts, Public API, evals, זיכרון | — |

---

## 13. הצעד הבא

1. ענה על 5 השאלות בסעיף 2 (או "המשך עם ההנחות").
2. אשר/תקן את הסטאק ואת חלוקת ה־MVP.
3. לאחר אישור — מתחילים **שלב 1** וכל שלב יקבל קובץ `docs/phase-N.md` קצר + קוד מלא.
