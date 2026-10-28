# שלב 1 — תשתית, התקנה ורב־לשוניות

## מה נבנה
| רכיב | תיאור |
|------|-------|
| Monorepo | pnpm workspaces + Turborepo, TypeScript strict |
| `packages/shared` | זיהוי RTL לכל שפה/כתב, שמות שפות מקומיים, אימות אזורי זמן, כסף ביחידות ISO 4217 (0/2/3/4 ספרות), סכמת Zod לאשף ההגדרה (הודעות שגיאה = מפתחות תרגום) |
| `packages/core` | אימות ENV עצל (בלי לדלוף ערכים), הצפנת AES-256-GCM עם AAD ו־rotation, לוגר עם redaction, Redis, Rate limit |
| `packages/db` | Prisma 7 + driver adapter: הגדרות, שפות, תרגומים, Audit log, תיעוד הסכמה לעוגיות |
| `apps/web` | Next.js 16: ‏he/en/ar/ru עם `lang`/`dir` אוטומטי, אשף הגדרה ראשונית, דפי משפט (טיוטה), באנר/דיאלוג עוגיות, 404/500, CSP עם nonce, `/api/health`, sitemap/robots עם hreflang |
| `apps/worker` | BullMQ worker עם heartbeat ו־graceful shutdown, קובץ יחיד |
| `deploy/` | Docker Compose (Caddy/HTTPS, Postgres+pgvector, Redis, migrate, web, worker, ClamAV/Ollama אופציונליים), `install.sh`, CLI ‏`rentagent`, `REQUIREMENTS.md` |
| CI/CD | lint, typecheck, tests, build, בדיקת סנכרון migrations, audit, shellcheck, docker build; release עם images חתומי provenance + SBOM ו־bundle להתקנה |

## החלטות בשלב זה
- **השלמת ההגדרה ננעלת** (advisory lock + בדיקה בטרנזקציה) והאשף נעלם (404) אחרי השלמה.
- **טוקן ההגדרה** מוזן ידנית (לא ב־URL) כדי שלא יישמר בלוגים או בהיסטוריה; 5 ניסיונות ל־15 דקות.
- **באנר עוגיות** מוצג רק כשהמפעיל מפעיל כלים אופציונליים (כרגע אין). הקישור "הגדרות פרטיות ועוגיות" קיים תמיד.
- **בלי פונטים חיצוניים** (Google Fonts) — מחסנית פונטים של המערכת, בלי בקשות לצד שלישי.
- **Next.js telemetry כבוי** בכל הסביבות.

## מה עוד לא כאן (שלב 2)
- חשבון מנהל ראשי, הרשמה/התחברות, 2FA — האשף יקבל שלב "יצירת מנהל" ושלב ההשלמה יעבור אחריו.
- בדיקת מפתח רישיון מול שרת רישוי (שלב 7). כרגע המפתח נשמר מוצפן בלבד.

## בדיקות שבוצעו
- יחידה: 52 בדיקות (RTL, כסף, סכמה, הצפנה כולל זיוף/החלפת הקשר/rotation, ENV, CSP, שלמות קבצי תרגום).
- E2E (Playwright, ידני): אשף ב־4 שפות, טוקן שגוי, ולידציה, השלמה, נעילה, מעבר שפה ששומר נתיב, דיאלוג עוגיות (מקלדת/Escape/החזרת פוקוס), הקלטת הסכמה.
- axe-core ‏(WCAG 2.1 A/AA): 0 הפרות בכל המסכים שנבדקו. CSP: 0 הפרות בקונסול.
- Docker: build של 3 ה־images והתקנה מלאה עם `install.sh` (Caddy עם HTTPS, migrations, health), אשף דרך HTTPS בערבית עם מטבע KWD (3 ספרות), מפתח רישיון נשמר מוצפן.
- CLI: ‏`backup` → שינוי נתונים → `restore` החזיר DB וקבצים; `update` לגרסה שלא קיימת — "לא שונה דבר"; `update` לגרסה תקינה ב־registry מקומי — הצליח; `update` לגרסה שבורה — **rollback אוטומטי** לגרסה הקודמת כולל שחזור DB.

## באגים שנמצאו ותוקנו בבדיקות
- `install.sh`: ‏`/etc/os-release` דרס את משתנה הגרסה → קריאה ב־subshell.
- `rentagent update`: כש־container נכשל, `compose up` החזיר שגיאה והסקריפט יצא **לפני** ה־rollback → תוקן ונבדק.
- נעילת ההגדרה: `$queryRaw` על פונקציה שמחזירה `void` נכשל ב־Prisma 7 → `$executeRaw`.
- `nodemailer` 7 עם חולשות ידועות (high) → שודרג ל־10.2.1; `pnpm audit --prod`: ‏0 חולשות.

## דורש בדיקה אנושית
- תרגומי ערבית ורוסית — בדיקת דובר שפת אם.
- בדיקת קורא מסך ידנית (NVDA/VoiceOver) — לא ניתן להריץ בסביבה האוטומטית.
