_Last updated: {{updated}}_

## Our commitment

{{company}} wants {{siteName}} to be usable by everyone, including people with disabilities. The site is designed to meet **WCAG 2.1 level AA** and, for users in Israel, the Israeli standard **IS 5568** based on it.

## What we did

- Semantic structure, headings and landmarks; every page works with a keyboard alone, with a visible focus indicator and a "Skip to main content" link.
- Labels, instructions and error messages for every form field, announced to screen readers; status messages (for example when an answer is ready) are announced without stealing focus.
- Full right-to-left support for Hebrew, Arabic and other RTL languages; mixed-direction text displays correctly.
- Text and interface colors meet contrast requirements, in light and dark mode; brand colors are checked automatically.
- Pages work when enlarged to 200% and on small screens; animations stop when the "reduce motion" setting is on.
- An **accessibility menu** (button at the bottom of the page) with text size, high contrast, link highlighting, a readable font and stopping animations. It complements, and does not replace, the accessible design.
- Automated checks (axe) on every main screen as part of our testing.

## Known limitations

- AI-generated answers may contain structures (for example complex tables) that are harder to read with a screen reader.
- Content uploaded or written by agent operators (agent descriptions, documents) may not meet all requirements.
- Payment pages of external providers{{#stripe}} (Stripe){{/stripe}}{{#paypal}} (PayPal){{/paypal}} are their responsibility.
[Operator: add any other known limitations and the date of the last manual audit.]

## Contact our accessibility coordinator

If you have difficulty using the site or have a suggestion:

- **{{accessibilityName}}**
- Email: {{accessibilityEmail}}
{{#hasAccessibilityPhone}}- Phone: {{accessibilityPhone}}
{{/hasAccessibilityPhone}}
Please describe the page, the problem and the technology you use (browser, screen reader). We aim to respond within **{{accessibilityDays}} days**.
