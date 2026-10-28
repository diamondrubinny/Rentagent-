import type { AgentConfig } from '@rentagent/shared';

type Localized = Record<'en' | 'he' | 'ar' | 'ru', string>;

export interface AgentTemplate {
  key: string;
  slug: string;
  category:
    | 'support'
    | 'research'
    | 'content'
    | 'documents'
    | 'meetings'
    | 'sales'
    | 'reports'
    | 'translation';
  name: Localized;
  description: Localized;
  config: AgentConfig;
}

const base = {
  formatVersion: 1 as const,
  target: { type: 'default' as const },
  language: { mode: 'match_user' as const },
  fetchAllowedDomains: [],
  outputFormat: 'markdown' as const,
  temperature: null,
  pricing: { mode: 'usage' as const, perTask: null, maxPerTask: '1' },
  conversation: { followUps: true, historyTurns: 10 },
};

const field = (
  key: string,
  label: string,
  type: AgentConfig['inputFields'][number]['type'],
  required: boolean,
  options: string[] = [],
) => ({
  key,
  label,
  type,
  required,
  options,
});

/** Ready-made agents operators can install and adapt. Instructions are in English; replies follow the language policy. */
export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: 'customer-support',
    slug: 'customer-support',
    category: 'support',
    name: {
      en: 'Customer support agent',
      he: 'סוכן תמיכת לקוחות',
      ar: 'وكيل دعم العملاء',
      ru: 'Агент поддержки клиентов',
    },
    description: {
      en: 'Answers customer questions from your knowledge base and drafts a reply email for approval.',
      he: 'עונה על שאלות לקוחות ממאגר הידע שלכם ומנסח מייל תשובה לאישור.',
      ar: 'يجيب عن أسئلة العملاء من قاعدة معرفتك ويصوغ رسالة رد للموافقة عليها.',
      ru: 'Отвечает на вопросы клиентов по вашей базе знаний и готовит письмо-ответ на согласование.',
    },
    config: {
      ...base,
      instructions:
        'You are a friendly, precise customer support agent. Always search the knowledge base before answering. Base answers only on what you find; if the knowledge base does not cover the question, say so and suggest contacting a human agent. Keep answers short and actionable. If a customer email address is provided and the user asks you to reply, send one email with the answer.',
      tools: [
        { id: 'knowledge_search', approval: 'never' },
        { id: 'send_email', approval: 'always' },
      ],
      inputFields: [
        field('customer_message', 'Customer message', 'textarea', true),
        field('customer_email', 'Customer email (optional)', 'email', false),
      ],
      limits: { maxSteps: 6, maxOutputTokens: 1500, maxCostUsd: '0.20', timeoutSeconds: 180 },
    },
  },
  {
    key: 'web-research',
    slug: 'web-research',
    category: 'research',
    name: {
      en: 'Web research analyst',
      he: 'אנליסט מחקר ברשת',
      ar: 'محلل أبحاث الويب',
      ru: 'Аналитик веб-исследований',
    },
    description: {
      en: 'Reads the web pages you point it to and writes a sourced research brief.',
      he: 'קורא את דפי האינטרנט שתציינו וכותב תקציר מחקר עם מקורות.',
      ar: 'يقرأ صفحات الويب التي تحددها ويكتب ملخصًا بحثيًا مع المصادر.',
      ru: 'Читает указанные веб-страницы и готовит исследовательскую справку со ссылками на источники.',
    },
    config: {
      ...base,
      instructions:
        'You are a rigorous research analyst. Fetch the provided sources (and only pages you need), extract facts, and write a brief with: key findings, supporting evidence with source URLs, open questions, and a confidence level. Never invent sources or numbers. Use the calculator for any arithmetic.',
      tools: [
        { id: 'web_fetch', approval: 'never' },
        { id: 'calculator', approval: 'never' },
      ],
      inputFields: [
        field('question', 'Research question', 'textarea', true),
        field('sources', 'Source URLs (one per line)', 'textarea', false),
      ],
      limits: { maxSteps: 10, maxOutputTokens: 3000, maxCostUsd: '0.50', timeoutSeconds: 600 },
    },
  },
  {
    key: 'content-writer',
    slug: 'content-writer',
    category: 'content',
    name: { en: 'Content writer', he: 'כותב תוכן', ar: 'كاتب محتوى', ru: 'Копирайтер' },
    description: {
      en: 'Writes blog posts, landing page copy and social posts in your tone of voice.',
      he: 'כותב פוסטים לבלוג, טקסטים לדפי נחיתה ופוסטים לרשתות בטון שלכם.',
      ar: 'يكتب مقالات المدونات ونصوص صفحات الهبوط ومنشورات التواصل بأسلوبك.',
      ru: 'Пишет статьи для блога, тексты для лендингов и посты для соцсетей в вашем стиле.',
    },
    config: {
      ...base,
      instructions:
        'You are an experienced copywriter. Write original, well-structured content for the requested audience and tone. Use clear headings, short paragraphs and a strong call to action where appropriate. Do not invent statistics, quotes or customer names.',
      tools: [],
      inputFields: [
        field('topic', 'Topic', 'text', true),
        field('audience', 'Target audience', 'text', false),
        field('tone', 'Tone', 'select', true, ['Professional', 'Friendly', 'Persuasive']),
        field('length', 'Length', 'select', true, ['Short', 'Medium', 'Long']),
      ],
      limits: { maxSteps: 2, maxOutputTokens: 3000, maxCostUsd: '0.20', timeoutSeconds: 180 },
      temperature: 0.8,
    },
  },
  {
    key: 'document-analyst',
    slug: 'document-analyst',
    category: 'documents',
    name: {
      en: 'Document analyst',
      he: 'מנתח מסמכים',
      ar: 'محلل المستندات',
      ru: 'Аналитик документов',
    },
    description: {
      en: 'Answers questions about the documents in its knowledge base, with citations.',
      he: 'עונה על שאלות לגבי המסמכים במאגר הידע שלו, עם ציון מקורות.',
      ar: 'يجيب عن الأسئلة حول المستندات في قاعدة معرفته مع ذكر المصادر.',
      ru: 'Отвечает на вопросы по документам из своей базы знаний со ссылками на источники.',
    },
    config: {
      ...base,
      instructions:
        'You analyze documents. Search the knowledge base (several queries if needed), then answer precisely, citing the file name for every claim. If the documents do not contain the answer, say so clearly.',
      tools: [{ id: 'knowledge_search', approval: 'never' }],
      inputFields: [field('question', 'Question', 'textarea', true)],
      limits: { maxSteps: 6, maxOutputTokens: 2000, maxCostUsd: '0.30', timeoutSeconds: 240 },
    },
  },
  {
    key: 'meeting-summarizer',
    slug: 'meeting-summarizer',
    category: 'meetings',
    name: {
      en: 'Meeting summarizer',
      he: 'מסכם פגישות',
      ar: 'ملخّص الاجتماعات',
      ru: 'Резюме встреч',
    },
    description: {
      en: 'Turns a meeting transcript into a summary, decisions and action items with owners.',
      he: 'הופך תמליל פגישה לסיכום, החלטות ומשימות עם אחראים.',
      ar: 'يحوّل نص الاجتماع إلى ملخص وقرارات ومهام مع المسؤولين عنها.',
      ru: 'Превращает стенограмму встречи в резюме, решения и задачи с ответственными.',
    },
    config: {
      ...base,
      instructions:
        'Summarize the meeting transcript. Output sections: Summary (5 bullets max), Decisions, Action items (owner, task, due date if mentioned), Open questions. Only use information from the transcript.',
      tools: [],
      inputFields: [
        field('transcript', 'Transcript', 'textarea', true),
        field('focus', 'Focus (optional)', 'text', false),
      ],
      limits: { maxSteps: 2, maxOutputTokens: 2000, maxCostUsd: '0.20', timeoutSeconds: 180 },
      temperature: 0.2,
    },
  },
  {
    key: 'sales-sdr',
    slug: 'sales-sdr',
    category: 'sales',
    name: {
      en: 'Sales development rep',
      he: 'נציג פיתוח מכירות',
      ar: 'ممثل تطوير المبيعات',
      ru: 'Специалист по привлечению клиентов',
    },
    description: {
      en: "Researches a prospect's website and writes a personalized outreach email, sent only after your approval.",
      he: 'חוקר את אתר הלקוח הפוטנציאלי וכותב מייל פנייה אישי, שנשלח רק אחרי אישורכם.',
      ar: 'يبحث في موقع العميل المحتمل ويكتب رسالة تواصل مخصّصة لا تُرسل إلا بعد موافقتك.',
      ru: 'Изучает сайт потенциального клиента и пишет персональное письмо, которое отправляется только после вашего одобрения.',
    },
    config: {
      ...base,
      instructions:
        "You are a thoughtful SDR. Read the prospect's website, identify 2-3 specific, verifiable details relevant to our product, and write a concise, personalized email (under 150 words) with one clear call to action. Never exaggerate or invent facts. If a contact email is provided, send the email (it will be reviewed first).",
      tools: [
        { id: 'web_fetch', approval: 'never' },
        { id: 'send_email', approval: 'always' },
      ],
      inputFields: [
        field('company_website', 'Prospect website', 'url', true),
        field('product', 'Our product / offer', 'textarea', true),
        field('contact_email', 'Contact email (optional)', 'email', false),
      ],
      limits: { maxSteps: 6, maxOutputTokens: 1500, maxCostUsd: '0.30', timeoutSeconds: 300 },
    },
  },
  {
    key: 'report-builder',
    slug: 'report-builder',
    category: 'reports',
    name: {
      en: 'Report builder',
      he: 'בונה דוחות',
      ar: 'منشئ التقارير',
      ru: 'Составитель отчётов',
    },
    description: {
      en: 'Turns raw numbers and notes into a clear report with exact calculations.',
      he: 'הופך מספרים והערות גולמיים לדוח ברור עם חישובים מדויקים.',
      ar: 'يحوّل الأرقام والملاحظات الخام إلى تقرير واضح بحسابات دقيقة.',
      ru: 'Превращает сырые цифры и заметки в понятный отчёт с точными расчётами.',
    },
    config: {
      ...base,
      instructions:
        'Build a clear business report from the provided data. Use the calculator for every computed figure (totals, averages, growth rates) and show the formula used. Structure: Executive summary, Key metrics table, Analysis, Recommendations. State any assumptions explicitly.',
      tools: [
        { id: 'calculator', approval: 'never' },
        { id: 'current_time', approval: 'never' },
      ],
      inputFields: [
        field('data', 'Data and notes', 'textarea', true),
        field('report_goal', 'Goal of the report', 'text', true),
      ],
      limits: { maxSteps: 12, maxOutputTokens: 3000, maxCostUsd: '0.40', timeoutSeconds: 300 },
      temperature: 0.2,
    },
  },
  {
    key: 'translator',
    slug: 'translator',
    category: 'translation',
    name: {
      en: 'Translator and localizer',
      he: 'מתרגם ומלקלז',
      ar: 'مترجم وموطِّن',
      ru: 'Переводчик и локализатор',
    },
    description: {
      en: 'Translates and localizes text into any language while keeping meaning, tone and formatting.',
      he: 'מתרגם ומתאים טקסט לכל שפה תוך שמירה על המשמעות, הטון והעיצוב.',
      ar: 'يترجم النص ويوطّنه إلى أي لغة مع الحفاظ على المعنى والأسلوب والتنسيق.',
      ru: 'Переводит и локализует текст на любой язык, сохраняя смысл, тон и форматирование.',
    },
    config: {
      ...base,
      instructions:
        'Translate the text into the requested target language. Preserve meaning, tone, formatting (Markdown, lists, line breaks), names, numbers and placeholders such as {name}. Adapt idioms, units and date formats for the target locale. Output only the translation, then a short list of notes for any ambiguous terms.',
      tools: [],
      inputFields: [
        field('text', 'Text to translate', 'textarea', true),
        field('target_language', 'Target language', 'text', true),
        field('style', 'Style', 'select', true, ['Formal', 'Neutral', 'Casual']),
      ],
      limits: { maxSteps: 2, maxOutputTokens: 4000, maxCostUsd: '0.30', timeoutSeconds: 240 },
      temperature: 0.3,
    },
  },
];
