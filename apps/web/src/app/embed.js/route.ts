/**
 * GET /embed.js — the loader customers add to their site:
 *   <script src="https://<site>/embed.js" data-key="ra_pk_…" data-locale="he" async></script>
 * It adds an accessible button and opens the widget in an iframe (loaded on first open).
 * Plain ES2017, no dependencies, styles isolated in a shadow root.
 */
const SCRIPT = String.raw`(function () {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute('data-key') || '';
  var match = /^ra_pk_([0-9a-f]{24})$/.exec(key);
  if (!match) return console.warn('RentAgent widget: invalid data-key');
  var origin = new URL(script.src).origin;
  var lang = (script.getAttribute('data-locale') || document.documentElement.lang || 'en').split('-')[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) lang = 'en';
  var label = (script.getAttribute('data-label') || 'Chat').slice(0, 40);
  var side = script.getAttribute('data-position') === 'left' ? 'left' : 'right';
  var color = script.getAttribute('data-color') || '';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#1d4ed8';

  var host = document.createElement('div');
  host.setAttribute('data-rentagent-widget', '');
  var root = host.attachShadow({ mode: 'open' });
  var id = 'rentagent-panel-' + match[1].slice(0, 8);
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '.btn{position:fixed;bottom:16px;' + side + ':16px;z-index:2147483000;font:600 16px/1.2 system-ui,sans-serif;' +
    'color:#fff;background:' + color + ';border:0;border-radius:999px;padding:14px 20px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25)}' +
    '.btn:focus-visible{outline:3px solid #111;outline-offset:3px}' +
    '.panel{position:fixed;bottom:80px;' + side + ':16px;z-index:2147483000;width:min(400px,calc(100vw - 32px));' +
    'height:min(640px,calc(100vh - 112px));border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.3);background:#fff}' +
    '.panel[hidden]{display:none}' +
    'iframe{border:0;width:100%;height:100%}' +
    '@media (max-width:480px){.panel{inset:0;width:100vw;height:100vh;border-radius:0}}' +
    '@media (prefers-reduced-motion:no-preference){.panel{transition:opacity .15s}}' +
    '</style>' +
    '<button class="btn" type="button" aria-expanded="false" aria-controls="' + id + '"></button>' +
    '<div class="panel" id="' + id + '" role="dialog" hidden></div>';
  var button = root.querySelector('button');
  var panel = root.querySelector('.panel');
  button.textContent = label;
  panel.setAttribute('aria-label', label);
  var frame = null;

  function open() {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = label;
      frame.src = origin + '/' + lang + '/embed/' + match[1];
      frame.setAttribute('allow', 'clipboard-write');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      panel.appendChild(frame);
    }
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    frame.focus();
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.focus();
  }
  button.addEventListener('click', function () {
    panel.hidden ? open() : close();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close();
  });
  window.addEventListener('message', function (event) {
    if (event.origin === origin && event.data && event.data.type === 'rentagent:close') close();
  });
  (document.body || document.documentElement).appendChild(host);
})();
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}
