# רישוי — מדריך לספק (Vendor)

המסמך מיועד **לך כספק התוכנה**. מפעילים (הלקוחות שמתקינים את המערכת) צריכים רק להדביק מפתח רישיון ב־_ניהול › רישיון_.

## איך זה עובד

| רכיב | מה הוא עושה |
|------|-------------|
| מפתח רישיון | טוקן `RA1.<payload>.<signature>` חתום ב־Ed25519. מכיל: מזהה, שם בעל הרישיון, דומיינים, מהדורה, פיצ'רים (`white_label`), מגבלת משתמשים ותוקף. |
| אימות | אופליין, בכל התקנה, מול המפתחות הציבוריים שב־`packages/license/src/keys.ts`. אין צורך באינטרנט. |
| בדיקה מקוונת (אופציונלית) | אם המפעיל מגדיר `LICENSE_SERVER_URL`, ה־worker שואל פעם ביום את שרת הרישיונות שלך. נשלחים רק מזהה רישיון, דומיין וגרסה. התשובה חתומה וכוללת nonce (אין replay). תקופת חסד: 14 יום של תקלות רשת. |
| אכיפה | **רכה**: בלי רישיון תקף הכול עובד, השורה "Powered by" נשארת, ובאזור הניהול מוצגת הודעה. רישיון עם `white_label` מאפשר להסתיר את השורה. מעבר למגבלת משתמשים — הודעה בלבד. **משתמשי קצה לעולם לא נחסמים.** |

`localhost` ו־`127.0.0.1` תמיד תואמים כל רישיון (פיתוח ובדיקות).

## הקמה חד־פעמית

1. בנו את ה־CLI והפיקו זוג מפתחות:
   ```bash
   pnpm --filter @rentagent/license-server build
   node apps/license-server/dist/cli.js keygen --kid k1
   ```
2. **המפתח הציבורי** (`{"kid":"k1","x":"…"}`) — הוסיפו ל־`VENDOR_PUBLIC_KEYS` ב־`packages/license/src/keys.ts`, בצעו commit ושחררו גרסה. רק גרסאות שכוללות אותו יכולות לאמת רישיונות.
3. **המפתח הפרטי** (`LICENSE_PRIVATE_KEY`) — שמרו במנהל סודות (1Password, Vault, Secret Manager). **לעולם לא ב־git.** מי שמחזיק בו יכול להנפיק רישיונות.

### החלפת מפתח (rotation)
הפיקו מפתח עם `--kid k2`, הוסיפו אותו לרשימה **לצד** k1, שחררו גרסה, והתחילו להנפיק עם k2. רישיונות ישנים ממשיכים לעבוד כל עוד k1 ברשימה.

## הנפקה, ביטול ורשימה

```bash
export LICENSE_KEY_ID=k1 LICENSE_PRIVATE_KEY=… LICENSE_DATA_FILE=/secure/licenses.json
node apps/license-server/dist/cli.js issue --licensee "Acme Ltd" \
  --domain agents.acme.com --domain "*.acme.com" \
  --tier pro --feature white_label --max-users 500 --expires 2027-12-31 --note "Order 1042"
node apps/license-server/dist/cli.js list
node apps/license-server/dist/cli.js revoke lic_XXXX     # unrevoke מחזיר
```

הטוקן מודפס פעם אחת ונשלח ללקוח. הקובץ שומר רק פרטי הרישיון (לא את הטוקן) ואת הבדיקה המקוונת האחרונה. **גבו את הקובץ.**

ביטול משפיע רק על התקנות עם בדיקה מקוונת. רישיון אופליין תקף עד תום התוקף — לכן לרישיונות אופליין מומלץ תוקף קצר (למשל שנה).

## שרת הרישיונות

שירות Node קטן (ללא תלויות בזמן ריצה). הקובץ נקרא מחדש כשהוא משתנה, כך שה־CLI יכול לבטל בזמן שהשרת רץ.

```bash
docker build -f deploy/docker/Dockerfile --target license-server -t rentagent-license-server .
docker run -d --name license-server -p 127.0.0.1:8080:8080 \
  -e LICENSE_KEY_ID=k1 -e LICENSE_PRIVATE_KEY=… -e TRUST_PROXY=true \
  -v license-data:/data rentagent-license-server
```

- הציבו מאחורי HTTPS (Caddy/nginx). `TRUST_PROXY=true` רק מאחורי proxy שלכם.
- Endpoints: `POST /v1/check`, `GET /health`. מגבלה: 60 בקשות לשעה לכתובת IP, גוף עד 2KB.
- את ה־CLI מריצים באותו שרת (או עם אותו קובץ): `docker exec license-server node cli.js list`.

הלקוחות מגדירים: `LICENSE_SERVER_URL=https://license.example.com`.

## פרטיות

השרת מקבל ושומר רק: מזהה רישיון, דומיין, גרסת תוכנה וזמן. אין מידע על משתמשים או תוכן. כתובות IP משמשות רק להגבלת קצב, בזיכרון, ולא נשמרות. כדאי לציין זאת בהסכם הרישיון עם הלקוח (דורש בדיקה משפטית).
