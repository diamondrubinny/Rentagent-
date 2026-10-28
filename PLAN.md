# RentAgent — אפיון ותוכנית עבודה (גרסה 2: Self-Hosted)

> סטטוס: **טיוטה לאישור**. אין עדיין קוד.
> שינוי מגרסה 1: המוצר הוא **תוכנה שהלקוח מתקין על השרת שלו** (Self-hosted / White-label), ולא שירות ענן מרכזי.
> כל מזהה מודל, מחיר או יכולת של ספק AI — **דורש אימות מול התיעוד הרשמי**, ולכן נשמר בהגדרות המערכת ולא בקוד.

---

## 1. סיכום ההבנה

אתה מוכר מוצר. הלקוח שלך (**המפעיל / Operator**) מתקין אותו על השרת שלו, מכניס את מפתחות ה־API של ספקי ה־AI שהוא רוצה, ומציע למשתמשים שלו (**משתמשי קצה**) להשתמש בסוכנים או לשכור אותם.

| תפקיד | מי | מה עושה |
|-------|----|---------|
| **Vendor** | אתה | מפתח, מוכר רישיונות, מפרסם עדכונים |
| **Operator** | הלקוח שמתקין | מתקין, מגדיר ספקים ומפתחות, בונה ומנהל סוכנים, קובע מחירים ומיתוג |
| **Agent Manager** (אופציונלי) | צוות של המפעיל | בונה ומתחזק סוכנים בלי גישה להגדרות מערכת |
| **End User** | הלקוחות של המפעיל | שוכרים ומפעילים סוכנים, משלמים למפעיל |

שלושת עמודי התווך שביקשת:
1. **התקנה על שרת הלקוח לפי דרישות מוגדרות** — מסמך דרישות + מתקין + אשף הגדרה ראשונית.
2. **המפעיל מכניס את ה־API שהוא רוצה** — לוח ספקים: מפעילים ספק, מכניסים מפתח, בוחרים אילו מודלים חשופים לאילו משתמשים ובאיזה מחיר.
3. **מערכת שאחראית על הסוכנים + התאמות גמישות** — Agent Control Center (ניהול, ניטור, מכסות, מדיניות, סוכן מנתב), ושכבת התאמות (מיתוג, תכונות, תמחור, כלים, תוספים) בלי לגעת בקוד.

---

## 2. החלטות (אושרו: "תחליט אתה על הכל")

| # | נושא | החלטה | נימוק |
|---|------|-------|-------|
| 1 | סוג שרת | **VPS או שרת ייעודי עם Linux ו־Docker בלבד.** אחסון משותף/cPanel לא נתמך. | ריצות ארוכות, Streaming, תורים וסנדבוקס דורשים תהליכים קבועים |
| 2 | רישוי | **רישיון שנתי** עם עדכונים ותמיכה בתקופה. כשהרישיון פג, המערכת ממשיכה לעבוד בגרסה הקיימת, בלי עדכונים. שלוש דרגות: Starter / Pro / Agency (White-label מלא). בדיקה אונליין פעם ביום, 14 יום חסד אופליין | מקובל בשוק, הוגן ללקוח, הכנסה חוזרת |
| 3 | מי בונה סוכנים | **המפעיל והצוות שלו** (תפקיד AGENT_MANAGER) ב־MVP. Marketplace של יוצרים חיצוניים עם חלוקת הכנסות — V2, מאחורי Feature flag | פחות סיכון אבטחה ומשפטי בגרסה הראשונה |
| 4 | תשלומים | **בינלאומיים, דרך מודולים (Gateway adapters):** Stripe + PayPal ב־MVP; Paddle (Merchant of Record שמטפל במע"מ גלובלי) ב־V2; סליקה ישראלית כמודול ב־V2. כמה מטבעות, סכומים ביחידות קטנות לפי ISO 4217 (לא כל מטבע הוא 2 ספרות אחרי הנקודה), מסים לפי מדינה (Stripe Tax אופציונלי או טבלת שיעורים ידנית), שדות Tax ID בחשבוניות. אפשר גם לכבות תשלומים לשימוש פנימי | כיסוי עולמי; המפעיל בוחר מה מתאים לו |
| 5 | פעולות בעולם האמיתי | **מותר, עם אישור אנושי כברירת מחדל:** מייל, Webhook, HTTP/OpenAPI, MCP ב־MVP. הרצת קוד ודפדפן בסנדבוקס — V2 | ערך גבוה, סיכון מבוקר |
| 6 | שפות וקוד | **בינלאומי מקצה לקצה:** קוד, הערות ושמות באנגלית; UTF-8 ונרמול NFC; כל הזמנים נשמרים ב־UTC ומוצגים לפי אזור הזמן של המשתמש; ממשק ב־he/en/ar/ru בהשקה + כל שפה שהמפעיל מוסיף | לפי הדרישה |
| 7 | אחסון קבצים | **מערכת קבצים מקומית (Docker volume) כברירת מחדל**, S3-compatible כאופציה. בלי MinIO | MinIO הפסיק להפיץ images של גרסת הקהילה; פחות רכיבים להתקנה |
| 8 | גרסאות | Node 22 LTS, Next.js 16, React 19, TypeScript 5.9, Prisma 7 (driver adapter ל־pg), Tailwind 4, Zod 4, next-intl 4, BullMQ 5 | גרסאות יציבות אחרונות; TypeScript 7 ו־Prisma 8 עדיין חדשים מדי |

## 3. מה המוצר כולל

סימון: **[MVP]** = גרסה ראשונה למכירה · **[V2]** · **[V3]**

### 3.1 התקנה ותפעול
- סקריפט התקנה בפקודה אחת: בודק דרישות, מייצר סודות, מרים Docker Compose **[MVP]**
- אשף הגדרה ראשונית בדפדפן: מנהל ראשי + MFA, דומיין, מייל (SMTP), מפתח רישיון, ספק AI ראשון **[MVP]**
- HTTPS אוטומטי (Caddy + Let's Encrypt) **[MVP]**
- עדכון בפקודה אחת עם גיבוי אוטומטי לפני ההרצה, migrations והחזרה לגרסה הקודמת **[MVP]**
- גיבוי ושחזור (DB + קבצים), כולל אפשרות לגיבוי ל־S3 חיצוני **[MVP]**
- בדיקת תקינות ודף מערכת: גרסה, שירותים, דיסק, תור, ספקים **[MVP]**
- בדיקת עדכונים והודעה למפעיל **[V2]**

### 3.2 ניהול ספקי AI (המפעיל מכניס API)
- תמיכה מובנית: OpenAI, Anthropic, Google Gemini, xAI, Mistral, Cohere, DeepSeek, Groq, Together, Fireworks, Perplexity, AWS Bedrock, Azure OpenAI, OpenRouter — **דורש אימות לכל ספק** **[MVP]**
- **"Custom OpenAI-compatible"** — כל ספק או שרת שתואם ל־OpenAI API (vLLM, LM Studio, Ollama, שרתים פנימיים): מכניסים Base URL ומפתח **[MVP]**
- מודלים מקומיים (Ollama) על אותו שרת או על שרת GPU נפרד **[MVP דרך Custom]**
- כפתור "בדיקת חיבור", ייבוא רשימת מודלים מהספק (כשהספק תומך בזה), ועריכה ידנית של מחירים ויכולות **[MVP]**
- כמה מפתחות לכל ספק (rotation או חלוקת עומס), מגבלת הוצאה לכל מפתח **[MVP]**
- הגדרה לכל מודל: גלוי או מוסתר, אילו תוכניות או קבוצות משתמשים מקבלות אותו, מחיר למשתמש (עלות + Markup) **[MVP]**
- Fallback chain ו־routing: "הזול ביותר שמתאים", "המהיר ביותר", "קבוע" **[MVP]**
- BYOK למשתמשי קצה — אופציה שהמפעיל מדליק או מכבה **[V2]**
- Kill-switch לספק או למודל **[MVP]**

### 3.3 Agent Control Center — המערכת שאחראית על הסוכנים
- **בניית סוכנים בלי קוד:** הנחיות, מודל או מדיניות מודל, כלים, ידע (RAG), טופס קלט, פורמט פלט, תמחור **[MVP]**
- **תבניות מוכנות** להתקנה בלחיצה: תמיכת לקוחות, מחקר, כתיבת תוכן, ניתוח מסמכים, סיכום פגישות, SDR, דוחות **[MVP: 5–8 תבניות]**
- ייבוא וייצוא סוכן כקובץ JSON — כדי להעביר בין התקנות **[MVP]**
- גרסאות, Preview, פרסום, החזרה לגרסה קודמת **[MVP]**
- **מדיניות לכל סוכן:** מקסימום צעדים, טוקנים ועלות לריצה, כלים מותרים, דומיינים מותרים, פעולות שמחייבות אישור אנושי **[MVP]**
- **סוכן מנתב (Router):** המשתמש כותב מה הוא צריך, והמערכת בוחרת את הסוכן המתאים או מציעה אותו **[V2]**
- **Supervisor / Multi-agent:** סוכן מנהל שמחלק משימה לסוכני משנה **[V2]**
- **ניטור:** Trace לכל ריצה (צעדים, כלים, טוקנים, עלות, זמן), שיעור הצלחה, דירוג, עלות ממוצעת, התראות על כשלים **[MVP]**
- **בקרה:** השהיה או כיבוי של סוכן, ביטול ריצות פעילות, מכסות לפי משתמש, תוכנית או סוכן **[MVP]**
- אישור אנושי (Human-in-the-loop) — ע"י המשתמש או ע"י המפעיל, לפי הגדרה **[MVP]**
- Evals: סט בדיקות לסוכן לפני פרסום **[V2]**
- משימות מתוזמנות ו־Triggers (Webhook, מייל נכנס) **[V2]**
- זיכרון ארוך טווח לכל משתמש **[V2]**

### 3.4 כלים לסוכנים
- מובנים: Web search (ספק לבחירת המפעיל), Fetch עם הגנת SSRF, קריאת קבצים שהועלו, מחשבון, תאריך ושעה **[MVP]**
- **HTTP Tool / OpenAPI:** המפעיל מייבא OpenAPI spec או מגדיר endpoint, והוא הופך לכלי — כך מחברים CRM, ERP או מערכת פנימית בלי קוד **[MVP]**
- **MCP servers:** המפעיל מוסיף שרתי MCP (HTTP) והכלים שלהם זמינים לסוכנים **[MVP]**
- שליחת מייל ו־Webhook יוצא (עם אישור אנושי כברירת מחדל) **[MVP]**
- Code interpreter ודפדפן בסביבה מבודדת **[V2]**

### 3.5 התאמות גמישות (בלי לגעת בקוד)
- **מיתוג (White-label):** שם, לוגו, Favicon, צבעים (Design tokens עם בדיקת ניגודיות אוטומטית), פונט, דומיין, תבניות מייל, הסתרת "Powered by" (לפי רישיון) **[MVP]**
- **שפות:** עריכת כל המחרוזות מהממשק, הוספת שפה, ברירת מחדל ו־RTL/LTR **[MVP]**
- **Feature flags:** הדלקה וכיבוי של מודולים — Marketplace, הרשמה פתוחה או בהזמנה, תשלומים, העלאת קבצים, BYOK, API ציבורי, ביקורות **[MVP]**
- **תמחור:** תוכניות (Free/Pro/Business — שמות ומחירים לבחירה), Credits, מחיר לכל סוכן (לפי משימה, לפי זמן, מנוי), מטבע, מע"מ **[MVP]**
- **משתמשים:** שדות מותאמים בהרשמה, קבוצות, תפקידים מותאמים עם הרשאות מפורטות **[V2]**
- **דפים:** עריכת דף הבית, FAQ ודפים משפטיים מתבניות **[MVP]**
- **Webhooks יוצאים** לאירועים (משתמש נרשם, ריצה הסתיימה, תשלום התקבל) — לחיבור Zapier, Make או n8n **[MVP]**
- **CSS ו־HTML מותאמים** — מוגבל ומסונן (רק CSS, בלי JS) **[V2]**
- **מערכת תוספים (Plugins):** הרחבות שרצות כשירות נפרד בקונטיינר, ומדברות עם המערכת דרך API או MCP — לא קוד שרץ בתוך האפליקציה **[V3]**

### 3.6 חוויית משתמש הקצה
- קטלוג סוכנים, עמוד סוכן, ניסיון חינם מוגבל **[MVP]**
- הפעלת משימה בטופס או בצ'אט, Streaming של צעדים, אישור פעולות, הורדת תוצרים **[MVP]**
- ארנק Credits, היסטוריה וחשבוניות, תקרת הוצאה **[MVP]**
- הגדרות: פרופיל, 2FA, Sessions, ייצוא ומחיקת מידע **[MVP]**
- Widget להטמעה באתר של המפעיל, WhatsApp, Telegram, Slack **[V2]**
- API ציבורי עם API keys **[V2]**

### 3.8 רב־לשוניות — "מבין את כל השפות"

שלוש שכבות נפרדות, וכל אחת מטופלת אחרת:

**א. הסוכנים מבינים ועונים בכל שפה** **[MVP]**
- זיהוי שפת הקלט אוטומטית (ספרייה מקומית כמו `franc`/`cld3` — **דורש אימות** דיוק בטקסטים קצרים) ותשובה באותה שפה כברירת מחדל.
- מדיניות שפה לכל סוכן: "עונה בשפת המשתמש" / "תמיד בשפה X" / "שפת הממשק של המשתמש".
- ההנחיות (instructions) של הסוכן נכתבות פעם אחת, בכל שפה; המערכת מוסיפה להן הוראת שפה אוטומטית.
- משתמש יכול לכתוב בשפה אחת ולבקש תוצר בשפה אחרת (תרגום, לוקליזציה).
- המפעיל רואה לכל מודל אילו שפות הוא טוען שהוא תומך בהן (שדה ב־Registry), ויכול לנתב שפות מסוימות למודל מסוים (למשל עברית → מודל שעובד טוב בעברית).

**ב. ידע ומסמכים בכל שפה (RAG)** **[MVP]**
- מודל Embeddings רב־לשוני לבחירת המפעיל (מספק ענן או מקומי, למשל BGE-M3 דרך Ollama — **דורש אימות** תמיכה). כך שאלה בעברית מוצאת מסמך באנגלית ולהפך.
- עיבוד מסמכים עם נרמול Unicode (NFC), תמיכה בכל הכתבים, וחיתוך שלא שובר מילים בשפות בלי רווחים (סינית, יפנית, תאית).
- OCR רב־לשוני לקבצים סרוקים **[V2]**.

**ג. ממשק בכל שפה** **[MVP]**
- כל המחרוזות בקבצי ICU MessageFormat (רבים, מגדר, משתנים) — בלי טקסט קשיח בקוד.
- RTL אוטומטי לכל שפה מימין לשמאל (עברית, ערבית, פרסית, אורדו ועוד) לפי ה־locale, עם CSS logical properties בכל הרכיבים.
- טקסט מעורב (עברית + אנגלית + מספרים + קוד) מוצג נכון: `dir="auto"` ו־Unicode bidi isolation בהודעות צ'אט ובשמות משתמשים.
- תאריכים, מספרים, מטבעות ואזורי זמן דרך `Intl` לפי השפה והמדינה.
- פונטים: משפחת Noto כגיבוי לכל הכתבים, נטענת רק לפי שפה (בלי לפגוע בביצועים).
- חיפוש בקטלוג שעובד בכל שפה (Postgres full-text עם `simple` + trigram, ובעתיד חיפוש סמנטי).
- המפעיל מוסיף שפה בלחיצה: תרגום אוטומטי של המחרוזות דרך ה־AI שהוגדר, עם סימון "ממתין לבדיקה" ועריכה ידנית.
- שם, תיאור ודוגמאות של כל סוכן ניתנים לתרגום, עם תרגום אוטומטי אופציונלי.
- תבניות מייל ודפים משפטיים לכל שפה.

**ד. קול ושפות מדוברות** **[V3]** — דיבור לטקסט וטקסט לדיבור רב־לשוני, לפי ספק שהמפעיל הגדיר.

**מגבלה שחשוב לדעת:** איכות ההבנה תלויה במודל שהמפעיל בחר. מודלים גדולים חזקים מאוד בשפות נפוצות ופחות בשפות עם מעט משאבים. המערכת תומכת בכל שפה טכנית, אבל איכות התשובה לא מובטחת באותה רמה בכל שפה. מומלץ לבדוק בשפות היעד לפני שמשווקים.

### 3.7 רישוי (צד ה־Vendor)
- License key שנבדק בהתקנה ואחת לתקופה; עבודה אופליין לתקופת חסד; Tiers לפי רישיון (כמות משתמשים, White-label, מודולים) **[MVP]**
- שרת רישוי ועדכונים קטן אצלך (Vendor) **[MVP]**
- כל המידע שעובר אליך: מפתח רישיון, דומיין, גרסה. בלי מידע של משתמשים.

---

## 4. דרישות שרת להתקנה (טיוטה)

> המספרים הם הערכה ראשונית. יאומתו בבדיקות עומס בשלב 7.

| | מינימום (עד ~50 משתמשים פעילים) | מומלץ (עד ~500) |
|---|---|---|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 GB | 16 GB |
| דיסק | 60 GB SSD | 200 GB NVMe |
| מערכת הפעלה | Ubuntu 22.04 / 24.04 LTS או Debian 12 (64-bit) | אותו דבר |
| תוכנה | Docker Engine + Docker Compose v2 | אותו דבר |

- **ClamAV** צורך בעצמו כ־2–3 GB RAM (**דורש אימות** לפי גרסה). אפשר לכבות אותו אם העלאת קבצים כבויה.
- **מודלים מקומיים (Ollama):** דורשים GPU או שרת נפרד. זו לא דרישה; המפעיל יכול להשתמש רק בספקי ענן.
- **רשת:** דומיין עם רשומת A לשרת, פורטים 80 ו־443 פתוחים, יציאה ב־HTTPS לספקי ה־AI ולשרת הרישוי.
- **מייל:** חשבון SMTP (לאימות מייל ולאיפוס סיסמה).
- **הרשאות:** משתמש עם sudo להתקנה בלבד; הקונטיינרים רצים כ־non-root.
- **גיבוי:** מקום אחסון חיצוני מומלץ (S3-compatible או דיסק נפרד).

### רכיבים שרצים על השרת (Docker Compose)
`caddy` (HTTPS) · `web` (Next.js) · `worker` (ריצות סוכנים, עיבוד ידע, סריקה, חיוב) · `postgres` + pgvector · `redis` · `clamav` (אופציונלי) · `ollama` (אופציונלי). קבצים: volume מקומי או S3 חיצוני

### זרימת התקנה
```
curl -fsSL https://<vendor>/install.sh -o install.sh   # מורידים, בודקים, ואז מריצים
sudo bash install.sh
  → בדיקת OS, RAM, דיסק, Docker ופורטים
  → יצירת /opt/rentagent, .env עם סודות אקראיים (Master key, DB, Redis)
  → docker compose pull && up -d → migrations
  → "פתח https://your-domain/setup" → אשף הגדרה ראשונית (טוקן חד־פעמי שמודפס בטרמינל)
```
עדכון: `rentagent update` (גיבוי ← pull ← migrate ← בדיקת תקינות ← החזרה לגרסה הקודמת בכישלון).

---

## 5. User Stories (MVP)

| # | כ... | אני רוצה... | כדי ש... |
|---|------|-------------|----------|
| 1 | מפעיל | להתקין בפקודה אחת ולסיים הגדרה באשף | אעלה לאוויר תוך פחות משעה |
| 2 | מפעיל | להכניס מפתחות של כמה ספקים ולבדוק חיבור | המשתמשים שלי יקבלו את המודלים שבחרתי |
| 3 | מפעיל | לקבוע לכל מודל מי רואה אותו ובאיזה מחיר | ארוויח ואשלוט בעלויות |
| 4 | מפעיל | לבנות סוכן מתבנית ולהתאים אותו | אציע שירות בלי לפתח |
| 5 | מפעיל | לחבר את ה־CRM שלי ככלי (OpenAPI/MCP) | הסוכנים יעבדו עם המערכות שלי |
| 6 | מפעיל | לראות עלויות, כשלים ושימוש לפי סוכן וספק | אנהל את העסק |
| 7 | מפעיל | למתג את המערכת בשם, לוגו, צבעים ודומיין שלי | זה ייראה כמוצר שלי |
| 8 | מפעיל | לכבות ספק או סוכן מיד | אגיב לתקלה או לחריגה |
| 9 | משתמש קצה | למצוא סוכן, לראות מחיר משוער ולהפעיל משימה | אקבל עבודה מוכנה |
| 10 | משתמש קצה | לראות מה הסוכן עושה ולאשר פעולות רגישות | אשמור על שליטה |
| 11 | משתמש קצה | לקנות Credits ולהגדיר תקרת הוצאה | לא אופתע בחשבון |
| 12 | משתמש קצה | לייצא או למחוק את המידע שלי | אממש זכויות פרטיות |

---

## 6. ארכיטקטורה והחלטות טכנולוגיות

```
               Browser (RTL/LTR, PWA, מיתוג של המפעיל)
                              │ HTTPS
                     ┌────────▼────────┐
                     │  caddy (TLS)    │
                     └────────┬────────┘
     ┌────────────────────────▼─────────────────────────┐
     │ web — Next.js: UI (משתמש + Admin) + API            │
     │ Auth · RBAC · Zod · Rate limit · CSP · Settings    │
     └───┬───────────────┬─────────────────┬─────────────┘
         │               │                 │
   postgres+pgvector   redis           files volume / S3 (quarantine → clamav → clean)
         │               │
     ┌───▼───────────────▼──────────────────────────────┐
     │ worker — BullMQ                                   │
     │  agent-runtime: loop · tools · MCP · approvals    │
     │  ai-gateway: providers · routing · fallback · cost│
     │  ingest (RAG) · file scan · billing · webhooks    │
     └───┬──────────────────────────────────────────────┘
         ▼
  ספקי AI שהמפעיל הגדיר (ענן) / Ollama / שרת OpenAI-compatible
                              ⋮
         (יציאה בלבד) license & update server של ה־Vendor
```

| תחום | בחירה | למה | חלופות | מגבלות |
|------|-------|-----|--------|--------|
| שפה | TypeScript | טיפוסים וולידציה משותפים | Python | — |
| אריזה | Docker Compose + Caddy | התקנה אחידה בכל שרת, HTTPS אוטומטי | Kubernetes/Helm (ל־V3 Enterprise) | דורש VPS, לא Shared hosting |
| Web | Next.js (App Router), build מסוג standalone | UI ו־API יחד, SSR לקטלוג | Remix; Laravel (אם חייבים PHP) | — |
| UI | Tailwind + shadcn/ui (Radix) | נגיש, RTL עם logical properties, מיתוג עם CSS variables | MUI | — |
| i18n | next-intl (ICU) + overrides ו־locales נוספים מה־DB | כל שפה, RTL אוטומטי, המפעיל עורך ומוסיף | i18next | שפות שנוספו ב־DB נטענות בזמן ריצה, לא ב־build |
| זיהוי שפה | ספרייה מקומית (franc/cld3) | מהיר, בלי לשלוח מידע החוצה | זיהוי דרך ה־LLM | פחות מדויק בטקסטים קצרים מאוד |
| Embeddings | רב־לשוני, לבחירת המפעיל | חיפוש בין שפות | מודל לכל שפה | החלפת מודל דורשת אינדוקס מחדש |
| DB | PostgreSQL + Prisma + pgvector | רלציוני + וקטורי בקונטיינר אחד | Drizzle; Qdrant | — |
| Queue | Redis + BullMQ | ריצות ארוכות, retries, cron | Temporal | Temporal כבד מדי להתקנה אצל לקוח |
| AI | Vercel AI SDK + OpenAI-compatible adapter | ממשק אחיד, Streaming, Tools | LiteLLM (Python, שירות נוסף) | **דורש אימות** תמיכה לכל ספק |
| Auth | Better Auth | Self-hosted, 2FA, Passkeys, OAuth | Auth.js | **דורש אימות** פיצ'רים |
| קבצים | Volume מקומי + ClamAV | הכל על השרת של הלקוח, בלי רכיב נוסף | S3 חיצוני (אופציה) | גיבוי ה־volume באחריות סקריפט הגיבוי |
| Observability | Traces ב־Postgres + דשבורד מובנה; OpenTelemetry export אופציונלי | בלי תלות בשירות חיצוני | Langfuse self-host | — |

**לגבי שאלה 1:** אם חלק מהלקוחות ב־Shared hosting/cPanel, הסטאק הזה לא ירוץ אצלם (אין Docker, אין תהליכי רקע ארוכים, אין Redis). החלופה היא גרסת PHP/Laravel עם cron במקום worker — פחות יכולות (Streaming, ריצות ארוכות, Sandbox). **ההמלצה: VPS בלבד**, ולהגדיר את זה כדרישת מערכת.

---

## 7. סכמת בסיס נתונים (עיקרי)

```
— מערכת והגדרות
Setting(key, value json, updatedBy, updatedAt)          — מיתוג, flags, מייל, מדיניות
Locale(code, name, nativeName, dir: LTR|RTL, enabled, isDefault, fontFamily)
Translation(locale, key, value, status: AUTO|REVIEWED)   — overrides ושפות שנוספו
License(key, tier, features json, validUntil, lastCheckAt)

— משתמשים
User(id, email, emailVerified, name, locale, status, createdAt, deletedAt)
Account / Session / TwoFactor / Passkey                  — Better Auth
Role(id, name, permissions json, system bool)            — ברירות מחדל: OWNER, ADMIN, AGENT_MANAGER, SUPPORT, USER
UserRole(userId, roleId)
Plan(id, name, priceCents, interval, creditsIncluded, limits json, modelAccess json)
Subscription(id, userId, planId, status, gateway, gatewayRef, periodEnd)

— ספקים ומודלים
Provider(id, type: OPENAI|ANTHROPIC|...|OPENAI_COMPATIBLE, name, baseUrl, enabled, settings json)
ProviderKey(id, providerId, encryptedKey, keyVersion, last4, spendLimitCents, enabled)
Model(id, providerId, modelId, displayName, capabilities json, languages json, contextWindow,
      costInPer1M, costOutPer1M, priceInPer1M, priceOutPer1M, visibility, planIds, enabled)
RoutingPolicy(id, name, strategy, chain json)

— סוכנים
Agent(id, slug, name, category, status: DRAFT|PUBLISHED|PAUSED|ARCHIVED, ownerId, ratingAvg)
AgentVersion(id, agentId, version, instructions, routingPolicyId, tools json, inputSchema json,
             outputFormat, languagePolicy json, pricing json, limits json, approvalRules json, publishedAt)
AgentLocalization(agentId, locale, name, description, examples json, status: AUTO|REVIEWED)
Tool(id, type: BUILTIN|HTTP|OPENAPI|MCP, name, config json(encrypted secrets), enabled)
McpServer(id, name, url, authEncrypted, enabled)
KnowledgeSource(id, agentId, fileId, status, embeddingModelId)
Chunk(id, sourceId, content, lang, embedding vector, meta)

— ריצות
Rental(id, userId, agentVersionId, pricingModel, budgetCapCents, status, expiresAt)
Run(id, rentalId, userId, status: QUEUED|RUNNING|WAITING_APPROVAL|SUCCEEDED|FAILED|CANCELED,
    input json, output json, costCents, priceCents, tokensIn, tokensOut, startedAt, finishedAt)
RunStep(id, runId, idx, type, providerId, modelId, payload json(redacted), tokens, costMicros, latencyMs)
Approval(id, runStepId, action, status, decidedBy, decidedAt)

— כסף
Wallet(userId, balanceCents)
Wallet.currency (ISO 4217), כל הסכומים ב־minor units (BigInt)
LedgerEntry(id, userId, type: TOPUP|HOLD|CAPTURE|RELEASE|REFUND|ADJUST, amountMinor, currency, refType, refId)  — immutable
Payment(id, userId, gateway: STRIPE|PAYPAL|PADDLE|..., gatewayRef, amountMinor, currency, taxMinor, country, status)
TaxRate(id, country, region, rate, inclusive) · BillingProfile(userId, legalName, taxId, country, address)
Price(id, planId|agentId, currency, amountMinor)                      — מחיר לכל מטבע

— שונות
File(id, ownerId, key, mime, size, sha256, scanStatus)
Webhook(id, url, events, secretEncrypted, enabled) · WebhookDelivery(id, webhookId, event, status, attempts)
ApiKey(id, userId, hashedKey, prefix, scopes, lastUsedAt, revokedAt)
AuditLog(id, actorId, action, target, ipHash, meta json, createdAt)
ConsentRecord(id, anonId, policyVersion, categories json, createdAt)
```
כל גישה למשאב עוברת דרך שכבת data access שבודקת בעלות והרשאה (מניעת IDOR/BOLA).

---

## 8. API Endpoints (עיקרי)

| Method | Path | גישה |
|--------|------|------|
| GET/POST | `/setup/*` | רק לפני שההגדרה הושלמה + טוקן חד־פעמי |
| GET | `/api/agents` · `/api/agents/:slug` | ציבורי (אם Marketplace פתוח) או מחובר |
| POST | `/api/rentals` · `/api/rentals/:id/runs` | משתמש מחובר, בעלים של ההשכרה |
| GET | `/api/runs/:id/stream` (SSE) | הבעלים של הריצה |
| POST | `/api/runs/:id/cancel` · `/api/approvals/:id` | הבעלים / תפקיד מורשה |
| POST | `/api/files` | מחובר, rate-limited, הסגר + סריקה |
| GET/POST | `/api/wallet` · `/api/wallet/topup` | המשתמש עצמו |
| POST | `/api/webhooks/payments/:gateway` | ציבורי + אימות חתימה |
| POST | `/api/privacy/export` · `/api/privacy/delete` | המשתמש עצמו + אימות מחדש |
| * | `/api/admin/providers` · `/models` · `/routing` | `providers.manage` + MFA |
| * | `/api/admin/agents` · `/tools` · `/mcp` · `/templates` | `agents.manage` |
| * | `/api/admin/settings` · `/branding` · `/translations` · `/flags` · `/plans` | `settings.manage` + MFA |
| * | `/api/admin/users` · `/audit` · `/runs` · `/costs` | לפי הרשאה |
| GET | `/api/health` | ציבורי (בלי פרטים פנימיים) |
| * | `/api/v1/*` [V2] | API key עם scopes |

---

## 9. מבנה תיקיות

```
rentagent/
├─ apps/
│  ├─ web/                 # Next.js: (public) (app) (admin) (setup) + api
│  └─ worker/              # BullMQ processors
├─ packages/
│  ├─ db/                  # Prisma schema, migrations, data-access עם בדיקת הרשאות
│  ├─ ai-gateway/          # provider adapters, registry, routing, fallback, metering
│  ├─ agent-runtime/       # agent loop, tools, MCP client, approvals, guardrails
│  ├─ billing/             # ledger, payment gateway adapters
│  ├─ settings/            # branding, flags, translations, plans
│  ├─ templates/           # תבניות סוכנים (JSON)
│  ├─ shared/              # zod schemas, types
│  └─ ui/                  # רכיבים נגישים עם תמיכה במיתוג
├─ deploy/
│  ├─ docker-compose.yml  Caddyfile  .env.example
│  ├─ install.sh  rentagent (CLI: update/backup/restore/status)
│  └─ REQUIREMENTS.md      # מסמך דרישות ללקוח
├─ license-server/         # שירות רישוי ועדכונים (אצל ה־Vendor)
├─ docs/                   # מדריך מפעיל, threat model, data map, טיוטות משפטיות
└─ README.md  PLAN.md
```

---

## 10. אבטחה, פרטיות, עוגיות ונגישות

### Threat Model (מקוצר)

| נכס | איום | סיכון | בקרה |
|-----|------|-------|------|
| מפתחות API של המפעיל | דליפה, שימוש לרעה | **קריטי** | AES-256-GCM עם Master key שנוצר בהתקנה (`.env` עם `chmod 600`), אף פעם לא לקליינט או ללוגים, מוצגים רק 4 תווים אחרונים, מגבלת הוצאה לכל מפתח |
| חשבון Admin | השתלטות | **קריטי** | MFA חובה, Rate limit, אימות מחדש לפעולות רגישות, Audit log, אופציה להגבלת IP |
| אשף ההגדרה | השתלטות על התקנה טרייה | **גבוה** | טוקן חד־פעמי מהטרמינל, ננעל אחרי שההגדרה הושלמה |
| ארנק ו־Credits | Race conditions, מניפולציית מחיר | **גבוה** | Ledger אטומי, מחיר מחושב רק בשרת, idempotency, אימות חתימות webhook |
| מידע משתמשים | IDOR, דליפה בין משתמשים | **גבוה** | בדיקת בעלות בכל query, בדיקות BOLA אוטומטיות |
| כלים (HTTP/OpenAPI/MCP/Fetch) | SSRF לרשת הפנימית של השרת (DB, Redis, metadata) | **גבוה** | חסימת כתובות פרטיות ו־metadata, רשת Docker נפרדת ל־worker, allowlist דומיינים לכל סוכן |
| Prompt injection | הסוכן מבצע פעולה לא רצויה | **גבוה** | אישור אנושי לפעולות יוצאות, least privilege לכלים, סימון תוכן לא אמין |
| עלויות LLM | Denial-of-wallet | **גבוה** | תקרות לריצה, למשתמש ולמפתח; מקסימום צעדים; kill-switch |
| קבצים | נוזקות | בינוני | Allowlist MIME (magic bytes), גודל, הסגר, ClamAV, שם קובץ אקראי, לא בתיקייה ציבורית |
| שרשרת אספקה | Image או עדכון זדוני | **גבוה** | חתימת images (cosign), checksums לסקריפט, SBOM, סריקת תלויות ב־CI |
| המוצר שאתה מוכר | עקיפת רישיון | בינוני | בדיקה חתומה (Ed25519) בצד שרת; לקבל שזו הגנה חלקית בלבד |

כותרות: CSP עם nonce, HSTS, `frame-ancestors 'none'` (חוץ מה־Widget), `Referrer-Policy`, Cookies `Secure; HttpOnly; SameSite=Lax`.

### פרטיות
- **המפעיל הוא בעל השליטה במידע (Controller)** של המשתמשים שלו. אתה (Vendor) לא מקבל מידע אישי — ולכן כנראה לא Processor. **דורש בדיקה משפטית.**
- המערכת מספקת למפעיל כלים: Data map מוכן, ייצוא ומחיקה למשתמש, מדיניות שמירה שניתנת להגדרה (ברירת מחדל: ריצות ושיחות 90 יום), אנונימיזציה, ConsentRecord.
- **תוכן משימות נשלח לספקי ה־AI שהמפעיל בחר.** המערכת תציג למשתמש איזה ספק מעבד את הבקשה, וטיוטת מדיניות הפרטיות תכלול את זה. המפעיל אחראי לבדוק DPA ומדיניות שימוש בנתונים מול כל ספק.
- טיוטות (מסומנות "לבדיקה משפטית"): מדיניות פרטיות, תנאי שימוש, מדיניות עוגיות, הצהרת נגישות — המפעיל עורך ומפרסם.

### עוגיות
- חיוניות בלבד כברירת מחדל: session, CSRF, locale, consent.
- המפעיל יכול להוסיף Analytics או Pixel דרך מנהל הסקריפטים, שטוען אותם **רק אחרי הסכמה** לפי קטגוריה.
- באנר: "אישור הכל" / "דחיית הכל" / "ניהול העדפות" בשווי משקל; קישור קבוע "הגדרות פרטיות ועוגיות" ב־Footer.

### נגישות
- יעד WCAG 2.1 AA ות"י 5568, ב־UI של המשתמש וגם ב־Admin.
- בוחר הצבעים במיתוג **בודק ניגודיות** ומתריע (או חוסם) כשהצבעים לא עומדים ב־AA — כדי שהתאמות של המפעיל לא ישברו נגישות.
- Radix primitives, ניווט מקלדת, focus גלוי, `aria-live` מצטבר לסטרימינג, RTL עם logical properties, זום 200%, `prefers-reduced-motion`.
- תבנית הצהרת נגישות שהמפעיל ממלא (רכז נגישות, פרטי קשר).

---

## 11. סיכונים ונושאים לבדיקה מקצועית

1. **Self-hosted = אינספור סביבות.** לכן תומכים רשמית רק ב־Docker על Linux לפי מסמך הדרישות. כל דבר אחר — "לא נתמך".
2. **עדכונים** — migrations שנכשלים אצל לקוח הם הסיכון התפעולי הגדול ביותר → גיבוי אוטומטי לפני כל עדכון, rollback, ובדיקת migrations ב־CI על עותק נתונים.
3. **ספקי AI משנים API ותמחור תדיר** → Registry ניתן לעריכה + adapter תואם־OpenAI כגיבוי.
4. **משפטי:** תנאי השימוש של ספקים לגבי מכירה חוזרת עם Markup (אחריות המפעיל, אבל כדאי להתריע); אחריות על פעולות סוכן; EU AI Act (שקיפות מול המשתמש); הסכם רישיון (EULA) ותנאי תמיכה שלך מול המפעיל — **דורש בדיקה משפטית**.
5. **מס וחשבוניות** במכירת רישיונות לחו"ל — **דורש בדיקה חשבונאית**.
6. **אבטחה:** בדיקת חדירות להתקנה סטנדרטית לפני מכירה ראשונה.

---

## 12. תוכנית עבודה לפי שלבים

| שלב | תוצר | בדיקות |
|-----|------|--------|
| **1. תשתית והתקנה** | Monorepo, Docker Compose מלא, Caddy, Prisma schema, Next.js עם תשתית i18n מלאה (ICU, RTL אוטומטי, he/en/ar/ru, טעינת שפות מה־DB), `install.sh`, CLI (status/backup/update), `REQUIREMENTS.md`, אשף הגדרה, כותרות אבטחה, דפי 404/500, CI | התקנה נקייה על Ubuntu ב־CI |
| **2. משתמשים והרשאות** | הרשמה, אימות מייל, איפוס, 2FA, OAuth, תפקידים והרשאות, Audit log, Rate limit | בדיקות הרשאות + BOLA |
| **3. ספקי AI** | Admin ספקים ומפתחות (מוצפנים), בדיקת חיבור, Registry מודלים, נראות ומחירים, Routing ו־Fallback, Metering, Kill-switch | Mock providers + בדיקות חוזה |
| **4. Agent Control Center** | Builder, תבניות, גרסאות, מדיניות, זיהוי שפה ומדיניות שפה, Embeddings רב־לשוניים, Runtime ב־worker, כלים (Fetch, HTTP/OpenAPI, MCP, מייל), אישור אנושי, SSE, Traces, RAG + קבצים עם סריקה, ניטור ובקרה | Integration |
| **5. חוויית משתמש קצה** | קטלוג, עמוד סוכן, הפעלה, צ'אט (bidi), תוצרים, היסטוריה, הגדרות פרטיות, חיפוש רב־לשוני | E2E Playwright + axe, בכל שפה RTL ו־LTR |
| **5.5 שפות (Admin)** | ניהול שפות, עורך תרגומים, תרגום אוטומטי עם סימון לבדיקה, תרגום סוכנים | בדיקת מפתחות חסרים ב־CI, בדיקות RTL ויזואליות |
| **6. התאמות ותשלומים** | מיתוג עם בדיקת ניגודיות, עריכת מחרוזות, Feature flags, תוכניות, Credits, Ledger, Stripe, Webhooks יוצאים | Race/idempotency |
| **7. רישוי, Compliance והשקה** | License server + בדיקה במוצר, באנר עוגיות, טיוטות משפטיות, מדריך מפעיל, בדיקות עומס לאימות הדרישות, Checklist לפרודקשן | Security scan, SBOM, a11y |
| V2+ | Sandbox לקוד ולדפדפן, Router ו־Supervisor, Cron ו־Triggers, ערוצים, BYOK למשתמשים, API ציבורי, Evals, תפקידים מותאמים, Plugins, Helm | — |

---

## 13. הצעד הבא
שלבים 1–5.5 הושלמו — ראו `docs/phase-1.md` עד `docs/phase-5-5.md`. הבא: שלב 6 (התאמות ותשלומים).
