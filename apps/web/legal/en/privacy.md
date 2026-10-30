_Last updated: {{updated}}_

## 1. Who we are

{{siteName}} ({{appUrl}}) is operated by **{{company}}**, {{address}}, {{country}} ("we"). We decide why and how your personal data is processed. Questions about privacy: {{privacyEmail}}.{{#hasDpo}} Our data protection officer: {{dpoName}}.{{/hasDpo}}

## 2. What we collect and why

| Data | Why | Legal basis (to be confirmed) | Kept for |
|------|-----|-------------------------------|----------|
| Account: name, email address, password (stored only as a secure hash), language, two-factor settings | To provide your account and keep it secure | Contract | Until you delete your account |
| Sessions: sign-in time, IP address, browser type | Security, preventing misuse | Legitimate interest | Up to 7 days per session |
| Your tasks and chats: what you enter, the agents' answers, actions you approve or reject | To carry out the tasks you ask for and show your history | Contract | {{#retention}}Deleted automatically {{retentionDays}} days after your last activity in a chat, or earlier when you delete it{{/retention}}{{^retention}}Until you delete them{{/retention}} |
{{#feedback}}| Ratings and comments you leave on answers | To improve the agents | Legitimate interest | As long as the chat is kept |
{{/feedback}}{{#billing}}| Credit balance, purchases and refunds | To sell and account for credits | Contract and legal obligations (accounting) | As required by accounting law; kept without your name after account deletion |
{{/billing}}{{#publicApi}}| API keys you create: name, permissions, creation and last use (the secret itself is stored only as a one-way hash) | Access to agents from your own systems | Contract | Until you revoke the key or delete your account |
{{/publicApi}}{{#widget}}| Chats in our widget on other websites: what visitors type and the answers | To provide the chat on behalf of the website that embeds it | That website's contract with us; we process on its behalf (to be confirmed) | Like other chats; the website owner can delete them |
{{/widget}}{{#schedules}}| Scheduled tasks: name, task fields, schedule, and data other systems send to a task's trigger URL | Running your tasks and telling you the result | Contract | Until you delete the task; results are kept like chats |
{{/schedules}}| Security log: important account events with a one-way hash of the IP address | Security and accountability | Legitimate interest | As long as needed for security |

We do not sell your data and we do not use it for advertising. {{^trackers}}This site does not use analytics or marketing cookies.{{/trackers}}

## 3. Artificial intelligence

Agents are powered by AI models of the following providers: **{{providers}}**. To answer a task, the text you enter (and documents in the agent's knowledge base) is sent to the provider that runs the model. Answers are generated automatically and can contain mistakes; important results should be checked. Actions with effects outside this site (for example sending an email) are carried out only after you approve them. Some AI providers may process data outside your country; see section 5.

## 4. Who receives data

- **AI model providers**: {{providers}} — the content of your tasks, to generate answers.
{{#smtp}}- **Email service**: your email address and the content of account emails (verification, password reset) and of emails you approve an agent to send.
{{/smtp}}{{#stripe}}- **Stripe**: name, email address and payment details when you buy credits or subscribe. Card numbers are entered on Stripe's page and never reach us.
{{/stripe}}{{#paypal}}- **PayPal**: payment details when you pay with PayPal; you pay on PayPal's page.
{{/paypal}}{{#webhooks}}- **Our own business systems** (for example our CRM): notifications about new accounts (name and email), completed tasks and payments — never the content of your chats.
{{/webhooks}}- **Hosting**: this service runs on servers chosen by {{company}}.

We require these recipients to protect the data (data processing agreements where needed).

## 5. International transfers

Some recipients may process data outside your country (for example in the United States). Where the law requires it, transfers are protected by appropriate safeguards such as the European Commission's standard contractual clauses. [The operator must list the actual countries and safeguards.]

## 6. Your rights

Depending on where you live (for example under the EU GDPR or the Israeli Privacy Protection Law), you can ask to access, correct, delete or export your data, object to or restrict processing, and withdraw consent at any time. You can do much of this yourself:

- **Download your data** and **delete your chat history or your account** under _My account › Privacy and data_.
- Change your cookie choices with the _Privacy and cookie settings_ link at the bottom of every page.

For anything else, write to {{privacyEmail}}. You also have the right to complain to your data protection authority.

## 7. Security

Passwords are stored as hashes, API keys and payment-provider secrets are encrypted, connections use HTTPS, and staff accounts require two-factor authentication. No system is perfectly secure; if a breach affects you, we will inform you as required by law.

## 8. Children

This service is not intended for children under 16. [The operator must set the age that applies in its country.]

## 9. Changes

We will publish changes on this page and update the date above. For important changes we will notify you in advance.
