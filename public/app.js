/* Smart Cashier's page. A small vanilla SPA: hash router over
 * #register, #finance/summary|transactions|payouts, #insights, #staff.
 * Talks only to this app's own /api. All class names are whole literals
 * so the Tailwind compiler sees them.
 */
'use strict';

/* eslint-disable no-undef */
const M = window.SCMoney;

// ── Small DOM helpers ────────────────────────────────────────────────────
function el(tag, cls, attrs) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (let i = 3; i < arguments.length; i++) {
    const c = arguments[i];
    if (c == null || c === false) continue;
    node.append(c);
  }
  return node;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function esc(s) { const d = document.createElement('span'); d.textContent = s; return d.innerHTML; }

// ── Icons ────────────────────────────────────────────────────────────────
const ICONS = {
  cup: 'M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z|M16 9h1.5a2.5 2.5 0 0 1 0 5H16|M8 3v2M11 3v2',
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14z|M5 19l8-8',
  bowl: 'M3 11h18a9 8 0 0 1-18 0z|M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5',
  loaf: 'M6 20v-9a4 4 0 0 1 0-7h12a4 4 0 0 1 0 7v9z|M10 8l-1 2M14 8l-1 2',
  bottle: 'M10 3h4v3l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z|M8 13h8',
  bag: 'M6 8h12l1 12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z|M9 10V6a3 3 0 0 1 6 0v4',
  box: 'M3 8l9-5 9 5v9l-9 5-9-5z|M3 8l9 5 9-5M12 13v9',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-8 8z|M7.5 7.5v.01',
  register: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z|M9 8h6M9 12h6M9 16h3',
  finance: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z|M4 7V6a2 2 0 0 1 2-2h10v3|M15 13.5h2',
  insights: 'M4 20h16|M7 16v-4M12 16V7M17 16v-6',
  staff: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z|M2.5 20a6.5 6.5 0 0 1 13 0|M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 3.5 6',
  cash: 'M2.5 6h19a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-19a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z|M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z|M5 9v.01M19 15v.01',
  card: 'M2.5 5h19a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-19a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z|M2.5 10h19|M6 15h4',
  qr: 'M4 4h6v6H4z|M14 4h6v6h-6z|M4 14h6v6H4z|M14 14h2v2M20 14v6h-6M17 18v.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M6 12h12',
  close: 'M6 6l12 12M18 6L6 18',
  chev: 'M9 6l6 6-6 6',
  trash: 'M4 7h16|M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2|M6 7l1 13h10l1-13',
  pencil: 'M4 20h4L19 9l-4-4L4 16z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3|M5 11h14v10H5z|M12 15v2',
  google: 'M20 12a8 8 0 1 1-2.3-5.6|M20 12h-7',
  apple: 'M12 7.5C9.5 5.5 6 6.5 6 10.5c0 4 3 7.5 5 7.5.7 0 1-.5 1-.5s.3.5 1 .5c2 0 5-3.5 5-7.5 0-4-3.5-5-6-3z|M12 7.5c0-2 1.2-3.3 3-4',
};
function icon(name, cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls || 'i');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of (ICONS[name] || '').split('|')) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// Category colour classes, written as whole literals so Tailwind sees them.
const CAT = {
  red:   { text: 'text-cat-red',   bg: 'bg-cat-red/10',   bar: 'bg-cat-red',   dot: 'bg-cat-red' },
  amber: { text: 'text-cat-amber', bg: 'bg-cat-amber/10', bar: 'bg-cat-amber', dot: 'bg-cat-amber' },
  teal:  { text: 'text-cat-teal',  bg: 'bg-cat-teal/10',  bar: 'bg-cat-teal',  dot: 'bg-cat-teal' },
  blue:  { text: 'text-cat-blue',  bg: 'bg-cat-blue/10',  bar: 'bg-cat-blue',  dot: 'bg-cat-blue' },
  plum:  { text: 'text-cat-plum',  bg: 'bg-cat-plum/10',  bar: 'bg-cat-plum',  dot: 'bg-cat-plum' },
  slate: { text: 'text-cat-slate', bg: 'bg-cat-slate/10', bar: 'bg-cat-slate', dot: 'bg-cat-slate' },
};
const METHOD_LABEL = { cash: 'Cash', card: 'Card', qr: 'QR' };

// ── API ──────────────────────────────────────────────────────────────────
let TOKEN = new URLSearchParams(location.search).get('token');
function wantsDemo() { return /[?&]demo=1/.test(location.search); }

async function api(path, opts) {
  opts = opts || {};
  const headers = { 'content-type': 'application/json' };
  if (TOKEN) headers['x-usernode-token'] = TOKEN;
  if (window.usernode && window.usernode.previewNow) headers['x-usernode-now'] = window.usernode.previewNow;
  let sep = path.includes('?') ? '&' : '?';
  const url = '/api' + path + (wantsDemo() ? sep + 'demo=1' : '');
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error(data.message || data.error || ('HTTP ' + res.status));
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

// ── State ────────────────────────────────────────────────────────────────
const state = {
  me: null,
  shop: null,        // current shop row (with role)
  catalog: null,
  receipt: null,     // [{productId, name, priceCents, qty, color, icon}]
  financePart: 'summary',
  financePeriod: 'today',
  insightsRange: '7d',
  categoryFilter: null,
  booting: true,
};

function perms() { return state.shop ? state.shop.role : null; }
function can(perm) { const r = perms(); return !!r && (r.is_owner || r['can_' + perm]); }

function ticketKey() { return 'sc:ticket:' + state.shop.id; }
function loadTicket() {
  try { state.receipt = JSON.parse(localStorage.getItem(ticketKey()) || 'null') || []; }
  catch (_) { state.receipt = []; }
}
function saveTicket() {
  try { localStorage.setItem(ticketKey(), JSON.stringify(state.receipt)); } catch (_) {}
}

function money(cents) { return M.formatMoney(cents, state.shop.currency, (state.me.user && state.me.user.locale) || undefined); }
function amt(cents) { return M.formatAmount(cents, state.shop.currency); }

function now() {
  if (window.usernode && typeof window.usernode.now === 'function') {
    try { const n = window.usernode.now(); if (n) return new Date(n); } catch (_) {}
  }
  return new Date();
}
function pad4(n) { return String(n).padStart(4, '0'); }
function saleLabel(no) { return 'Sale #' + pad4(no); }
function localParts(d) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: state.shop.time_zone, weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric',
  }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
}
function localDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: state.shop.time_zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function timeLabel(d) {
  const p = localParts(d);
  return p.hour + ':' + p.minute;
}
function dayLabel(d) {
  const p = localParts(d);
  const today = localDate(now());
  if (localDate(d) === today) return 'Today';
  return p.weekday + ' ' + p.day + ' ' + p.month;
}
function hourWord(h) {
  const name = (x) => { const ap = x < 12 ? 'am' : 'pm'; let hr = x % 12; if (hr === 0) hr = 12; return hr + ' ' + ap; };
  return name(h) + ' to ' + name((h + 1) % 24);
}

// ── Toast ────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, isError) {
  let t = document.getElementById('sc-toast');
  if (!t) {
    t = el('div', 'fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-lg bg-fg px-4 py-2 text-small font-medium text-ground shadow-lg');
    t.id = 'sc-toast';
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.toggle('bg-danger', !!isError);
  t.classList.toggle('text-on-danger', !!isError);
  t.classList.toggle('bg-fg', !isError);
  t.classList.toggle('text-ground', !isError);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3500);
}

// ── Sheet ────────────────────────────────────────────────────────────────
function openSheet(title, build) {
  const dim = el('div', 'fixed inset-0 z-40 bg-fg/40', { onclick: close });
  const sheet = el('div', 'fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-2xl border-t border-line bg-surface px-4 pb-6 pt-2 shadow-2xl',
    { role: 'dialog', 'aria-label': title });
  sheet.append(el('div', 'mx-auto mb-3 h-1.5 w-9 rounded-full bg-line'));
  const head = el('div', 'mb-3 flex min-h-11 items-center justify-between');
  head.append(el('h2', 'text-heading', { text: title }));
  const x = el('button', 'flex h-11 w-11 items-center justify-center rounded-full text-muted', { 'aria-label': 'Close', onclick: close });
  x.append(icon('close'));
  head.append(x);
  sheet.append(head);
  const body = el('div', 'flex flex-col gap-3');
  sheet.append(body);
  build(body, close);
  const page = document.getElementById('app');
  page.append(dim, sheet);
  function close() { dim.remove(); sheet.remove(); }
  return { close, body };
}

// A switch row: label + <un-switch> when the kit provides it, else a checkbox.
function switchRow(labelText, checked, onChange, desc) {
  const row = el('div', 'flex min-h-11 items-center justify-between gap-3 py-1');
  const label = el('div', 'flex flex-col');
  label.append(el('span', 'text-body', { text: labelText }));
  if (desc) label.append(el('span', 'text-small text-muted', { text: desc }));
  row.append(label);
  let input;
  if (window.customElements && customElements.get('un-switch')) {
    input = document.createElement('un-switch');
    input.setAttribute(checked ? 'checked' : 'unchecked', '');
    input.addEventListener('change', () => onChange(!!input.checked));
  } else {
    input = el('input', 'h-6 w-6 accent-[rgb(var(--accent))]', { type: 'checkbox' });
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
  }
  row.append(input);
  return row;
}

// ── Boot ─────────────────────────────────────────────────────────────────
// Grey shapes standing where the register will appear, while /api/me runs:
// shop name line, chip row, a 3-across grid of tile shapes, the docked
// receipt with a Charge-shaped bar.
function renderBootSkeleton() {
  const root = document.getElementById('app');
  const paper = el('div', 'receipt flex flex-col border-t border-line', {},
    el('div', 'skeleton h-4 w-28'),
    el('div', 'skeleton mt-2 h-11 w-full'),
    el('div', 'skeleton h-11 w-3/4'),
    el('div', 'mt-2 flex items-baseline justify-between border-t-2 border-dashed border-muted/50 pt-2.5', {},
      el('div', 'skeleton h-4 w-12'),
      el('div', 'skeleton h-7 w-28')),
    el('div', 'skeleton mt-3 h-[52px] w-full rounded-lg'));
  root.replaceChildren(el('div', 'flex h-dvh flex-col overflow-hidden', {},
    el('div', 'px-4 pb-3 pt-4', {},
      el('div', 'skeleton h-6 w-44'),
      el('div', 'skeleton mt-2 h-3.5 w-28')),
    el('div', 'flex shrink-0 gap-2 overflow-hidden px-4 py-3', {},
      ...Array.from({ length: 4 }, () => el('div', 'skeleton h-11 w-20 shrink-0 rounded-full'))),
    el('div', 'min-h-0 flex-1 overflow-hidden px-4', {},
      el('div', 'grid grid-cols-3 gap-2 md:grid-cols-4 xl:grid-cols-6', {},
        ...Array.from({ length: 9 }, () => el('div', 'skeleton h-[108px] rounded-xl')))),
    el('div', 'shrink-0 px-4 pb-3 pt-2', {}, paper)));
}

async function boot() {
  const root = document.getElementById('app');
  renderBootSkeleton(); // loading shapes while /api/me runs
  let me;
  try {
    me = await api('/me');
  } catch (err) {
    root.replaceChildren(errorState('Couldn’t load the register',
      'The server didn’t answer. Nothing was lost — try again.', () => boot(), true));
    return;
  }
  state.me = me;
  if (me.guest) {
    renderGuest(me);
    return;
  }
  if (!me.shops.length) {
    renderSetup();
    return;
  }
  state.shop = me.shops[0];
  loadTicket();
  route();
  window.addEventListener('hashchange', route);
}

// The signed-out screen at the app's own address: sign in with Homeroom
// (which also makes a new account) or continue with a linked social
// account. A ?signin= code from a failed social redirect explains itself
// above the buttons.
const SIGNIN_ERRORS = {
  not_linked: 'That account isn’t linked to anyone here yet. Sign in with Homeroom, then link it under Sign-in methods.',
  not_set_up: 'Social sign-in isn’t set up for this app yet.',
  cancelled: 'Sign-in was cancelled.',
  expired: 'Sign-in was cancelled.',
};

function renderGuest(me) {
  const root = document.getElementById('app');
  const code = me.signin || new URLSearchParams(location.search).get('signin');
  const configured = (me.google && me.google.configured) || (me.apple && me.apple.configured);
  const socialBtn = (provider, label) => {
    if (me[provider] && me[provider].configured) {
      return el('a', 'btn-secondary', { href: '/api/auth/oauth/signin?provider=' + provider }, icon(provider, 'h-5 w-5'), label);
    }
    const b = el('button', 'btn-secondary', { disabled: 'true' }, icon(provider, 'h-5 w-5'), label);
    b.disabled = true;
    return b;
  };
  root.replaceChildren(el('div', 'state-empty min-h-screen justify-center', {},
    icon('register', 'h-10 w-10 text-muted'),
    el('h1', 'text-heading', { text: 'Sign in to Smart Cashier' }),
    el('p', 'max-w-xs text-body text-muted', { text: 'Use your Homeroom account, or an account you’ve linked to it.' }),
    code && SIGNIN_ERRORS[code] ? el('p', 'max-w-xs text-small text-danger', { text: SIGNIN_ERRORS[code] }) : null,
    el('div', 'mt-2 flex w-full max-w-xs flex-col gap-2', {},
      el('button', 'btn-primary', {
        text: 'Sign in with Homeroom',
        onclick: () => {
          if (window.usernode && typeof window.usernode.askForAccount === 'function') {
            window.usernode.askForAccount({ action: 'use Smart Cashier' });
          } else {
            location.reload();
          }
        },
      }),
      socialBtn('google', 'Continue with Google'),
      socialBtn('apple', 'Continue with Apple')),
    !configured ? el('p', 'max-w-xs text-small text-muted', { text: 'Google and Apple sign-in aren’t set up for this app yet.' }) : null,
    el('p', 'max-w-xs text-small text-muted', { text: 'No account yet? Sign in with Homeroom to make one. It becomes your Smart Cashier account.' })));
}

// A load failure: a centred block with a heading-size line, one small muted
// line saying what failed, and a full-width accent Retry button. `full`
// centres it in the whole viewport (the boot error); otherwise it sits
// where the screen's content would.
function errorState(title, detail, retry, full) {
  return el('div', 'flex w-full flex-col items-center justify-center gap-2 px-4 text-center ' + (full ? 'min-h-screen' : 'py-8'), {},
    el('h1', 'text-heading', { text: title }),
    el('p', 'max-w-xs text-small text-muted', { text: detail }),
    el('button', 'btn-primary mt-3 w-full max-w-xs', { text: 'Retry', onclick: retry }));
}

// ── Shop setup (no shop yet) ─────────────────────────────────────────────
function renderSetup(message) {
  const root = document.getElementById('app');
  const zones = [Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Kolkata',
    'Europe/London', 'Europe/Berlin', 'Europe/Istanbul', 'America/New_York', 'America/Chicago',
    'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];
  const seen = new Set();
  const zoneOpts = zones.filter((z) => (seen.has(z) ? false : (seen.add(z), true)));
  let zone = zoneOpts[0];

  const form = el('form', 'flex flex-col gap-4');
  const nameField = el('input', 'field', { placeholder: 'e.g. Senja Coffee Corner', maxlength: '60', required: '' });
  const currencySel = el('select', 'field', {});
  currencySel.append(el('option', '', { value: '', text: 'Choose a currency' }));
  for (const [code, c] of Object.entries(M.CURRENCIES)) {
    currencySel.append(el('option', '', { value: code, text: code + ' · ' + c.name }));
  }
  const zoneSel = el('select', 'field', {});
  for (const z of zoneOpts) zoneSel.append(el('option', '', { value: z, text: z }));
  zoneSel.value = zone;
  zoneSel.addEventListener('change', () => { zone = zoneSel.value; });

  const note = message ? el('p', 'text-small text-muted', { text: message }) : null;
  const submit = el('button', 'btn-primary', { text: 'Create shop', type: 'submit' });
  form.append(
    el('div', '', {},
      el('label', 'section-label', { text: 'Shop name' }), nameField),
    el('div', '', {},
      el('label', 'section-label', { text: 'Currency' }), currencySel,
      el('p', 'mt-1 px-1 text-small text-muted', { text: 'Prices use this currency’s usual decimals. You can change the currency later, but prices are not converted.' })),
    el('div', '', {},
      el('label', 'section-label', { text: 'Time zone' }), zoneSel),
    submit);
  if (note) form.prepend(note);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currencySel.value) { toast('Choose a currency', true); return; }
    submit.disabled = true;
    try {
      await api('/shops', { method: 'POST', body: { name: nameField.value, currency: currencySel.value, timeZone: zoneSel.value } });
      const fresh = await api('/me');
      state.me = fresh;
      state.shop = fresh.shops[0];
      loadTicket();
      location.hash = '#register';
      route();
    } catch (err) {
      submit.disabled = false;
      toast(err.message || 'Could not create the shop', true);
    }
  });

  root.replaceChildren(el('main', 'mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 pb-10 pt-12', {},
    el('div', '', {},
      el('h1', 'text-title', { text: 'Set up your shop' }),
      el('p', 'text-body text-muted', { text: 'Name it, pick the currency prices are in, and check the time zone. You become its Owner.' })),
    form));
}

// ── Router ───────────────────────────────────────────────────────────────
const TABS = [
  { key: 'register', label: 'Register', perm: 'register' },
  { key: 'finance', label: 'Finance', perm: 'finance' },
  { key: 'insights', label: 'Insights', perm: 'insights' },
  { key: 'staff', label: 'Staff', perm: 'staff' },
];
function allowedTabs() { return TABS.filter((t) => can(t.perm)); }

function route() {
  const hash = (location.hash || '').slice(1);
  const [head, sub] = hash.split('/');
  const tabs = allowedTabs();
  if (!state.shop) { renderSetup(); return; }
  if (!tabs.length) {
    document.getElementById('app').replaceChildren(el('div', 'state-error min-h-screen justify-center', {},
      el('p', 'max-w-xs text-body text-muted', { text: 'Your role doesn’t include any screens yet. Ask the shop’s owner.' })));
    return;
  }
  const tab = tabs.find((t) => t.key === head);
  if (head === 'sign-in-methods') {
    // A deep link straight to the sheet: render the first allowed screen
    // behind it, then open the sheet on top.
    render(tabs[0].key, undefined);
    openSignInMethods();
    return;
  }
  if (!tab) { location.replace('#' + tabs[0].key); return; }
  if (tab.key === 'finance') {
    if (!['summary', 'transactions', 'payouts'].includes(sub)) {
      location.replace('#finance/' + state.financePart);
      return;
    }
    state.financePart = sub;
  }
  render(tab, sub);
}

// ── Shell: content + tab bar ─────────────────────────────────────────────
function render(tab, sub) {
  const root = document.getElementById('app');
  const tabs = allowedTabs();
  const oneTab = tabs.length === 1;
  // The register fills the viewport: the grid scrolls in its own area and
  // the receipt is docked, so the tab bar sits in the flow below it instead
  // of floating over the content.
  const docked = tab.key === 'register';
  const main = docked
    ? el('main', 'flex min-h-0 w-full flex-1 flex-col overflow-hidden')
    : el('main', 'mx-auto flex w-full max-w-3xl flex-col pb-24');
  const wrap = el('div', docked ? 'flex h-dvh flex-col overflow-hidden' : 'min-h-screen flex flex-col', {});
  wrap.append(main);
  if (!oneTab) {
    const bar = el('nav', 'tabbar z-30 shrink-0' + (docked ? '' : ' fixed inset-x-0 bottom-0 mx-auto max-w-3xl'), { 'aria-label': 'Tabs' });
    for (const t of tabs) {
      const b = el('a', 'tabbar-btn' + (t.key === tab.key ? ' tabbar-on' : ''), { href: '#' + t.key });
      b.append(icon(t.key, 'h-5 w-5'), el('span', '', { text: t.label }));
      bar.append(b);
    }
    wrap.append(bar);
  }
  clear(root);
  root.append(wrap);
  if (tab.key === 'register') renderRegister(main);
  else if (tab.key === 'finance') renderFinance(main, sub);
  else if (tab.key === 'insights') renderInsights(main);
  else if (tab.key === 'staff') renderStaff(main);
}

function demoLine() {
  return state.shop.is_demo
    ? el('p', 'shrink-0 bg-raised px-4 py-2.5 text-small text-muted', {},
        el('strong', 'font-semibold text-fg', { text: 'Staging demo. ' }),
        'A made-up coffee shop. Sales you record here stay in staging.')
    : null;
}

function screenHeader(titleEl, right) {
  const h = el('div', 'flex items-center justify-between gap-3 px-4 pb-3 pt-4');
  h.append(titleEl);
  if (right) h.append(right);
  return h;
}

// ── Register ─────────────────────────────────────────────────────────────
// The main fills the viewport height. The grid scrolls inside its own area;
// the receipt is docked below it, full width on a phone (16 px margins) and
// a full-height right column on a tablet or desktop.
function renderRegister(main) {
  const shop = state.shop;
  const header = el('div', 'shrink-0', {});
  const titleBox = el('div', '', {});
  const shopBtn = el('button', '-ml-1 flex min-h-11 items-center gap-1 text-heading font-semibold', {
    text: shop.name,
    onclick: (e) => shopMenu(e.currentTarget),
    'aria-haspopup': 'menu',
    'aria-label': shop.name + ' — switch shop',
  });
  shopBtn.append(icon('chev', 'h-4 w-4 shrink-0 rotate-90 text-muted'));
  titleBox.append(shopBtn,
    el('p', 'text-small text-muted', { text: 'You, ' + shop.role.name }));
  const right = el('div', 'flex items-center gap-2', {});
  if (can('products')) {
    const b = el('button', 'btn-secondary h-11 px-3.5 text-small', { onclick: () => openProducts() });
    b.append(icon('pencil', 'h-5 w-5'), 'Products');
    right.append(b);
  }
  header.append(screenHeader(titleBox, right));

  const chips = el('div', 'flex shrink-0 gap-2 overflow-x-auto px-4 py-3');
  const gridWrap = el('div', 'min-h-0 flex-1 overflow-y-auto px-4 pb-4');
  const receiptCol = el('div', 'flex min-h-0 shrink-0 flex-col px-4 pb-3 pt-2 md:w-[360px] md:border-l md:border-line md:px-5 md:pb-4 md:pt-4');
  const leftCol = el('div', 'flex min-h-0 min-w-0 flex-1 flex-col');
  leftCol.append(header, chips, gridWrap);
  const body = el('div', 'flex min-h-0 flex-1 flex-col md:flex-row');
  body.append(leftCol, receiptCol);

  main.append(demoLine(), body);

  const renderChips = () => {
    clear(chips);
    const all = el('button', 'chip' + (state.categoryFilter === null ? ' chip-on' : ''), { text: 'All', onclick: () => { state.categoryFilter = null; renderChips(); renderGrid(); } });
    chips.append(all);
    for (const c of state.catalog.categories) {
      const dot = el('span', 'h-2 w-2 rounded-full ' + CAT[c.color].dot);
      const b = el('button', 'chip' + (state.categoryFilter === c.id ? ' chip-on' : ''), { onclick: () => { state.categoryFilter = state.categoryFilter === c.id ? null : c.id; renderChips(); renderGrid(); } });
      b.append(dot, c.name);
      chips.append(b);
    }
  };

  const renderGrid = () => {
    clear(gridWrap);
    const products = state.catalog.products
      .filter((p) => p.on_sale)
      .filter((p) => state.categoryFilter === null || p.category_id === state.categoryFilter);
    if (!products.length) {
      gridWrap.append(el('div', 'state-empty', {},
        el('p', 'text-body font-medium', { text: state.catalog.products.length ? 'Nothing in this category yet' : 'No products yet' }),
        el('p', 'text-small text-muted', { text: state.catalog.products.length ? 'Try another category.' : 'Add what the shop sells to start taking sales.' }),
        can('products') ? el('button', 'btn-secondary mt-2', { text: 'Add product', onclick: () => openProductEditor(null) }) : null));
      return;
    }
    const grid = el('div', 'grid grid-cols-3 gap-2 md:grid-cols-4 xl:grid-cols-6');
    const counts = {};
    for (const it of state.receipt) counts[it.productId] = (counts[it.productId] || 0) + it.qty;
    for (const p of products) {
      const cat = state.catalog.categories.find((c) => c.id === p.category_id);
      const look = CAT[(cat && cat.color) || 'slate'];
      const inSale = counts[p.id] || 0;
      const tile = el('button', 'tile' + (inSale ? ' tile-in' : ''), { onclick: () => addToTicket(p, cat) });
      const sq = el('span', 'flex h-8 w-8 items-center justify-center rounded-lg ' + look.bg + ' ' + look.text);
      sq.append(icon((cat && cat.icon) || 'tag', 'h-5 w-5'));
      tile.append(sq,
        el('span', 'line-clamp-2 text-small font-medium', { text: p.name }),
        el('span', 'mt-auto text-small tabular-nums text-muted', { text: money(p.price_cents) }));
      if (inSale) tile.append(el('span', 'absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-small font-bold text-on-accent', { text: String(inSale) }));
      grid.append(tile);
    }
    gridWrap.append(grid);
  };

  const renderReceipt = () => {
    clear(receiptCol);
    const total = state.receipt.reduce((a, it) => a + it.priceCents * it.qty, 0);
    const count = state.receipt.reduce((a, it) => a + it.qty, 0);
    const paper = el('div', 'receipt flex flex-col border-t border-line md:flex-1', { 'data-receipt': '' });
    const head = el('div', 'flex min-h-11 shrink-0 items-center gap-3 text-small text-muted');
    head.append(
      el('span', 'font-semibold text-fg', { text: saleLabel(shop.next_sale_no) }),
      el('span', '', { text: count ? count + (count === 1 ? ' item' : ' items') : '' }));
    const clearBtn = el('button', 'ml-auto min-h-11 px-1 text-small font-medium text-muted underline', { text: 'Clear', onclick: () => {
      if (!state.receipt.length) return;
      confirmSheet('Clear the receipt?', 'This empties the sale in progress.', 'Clear', () => { state.receipt = []; saveTicket(); renderReceipt(); renderGrid(); });
    } });
    head.append(clearBtn);
    paper.append(head);
    if (!state.receipt.length) {
      paper.append(el('p', 'py-2 text-small text-muted', { text: 'Tap a product to start a sale' }));
    } else {
      const lines = el('div', 'max-h-56 overflow-y-auto md:min-h-0 md:max-h-none md:flex-1');
      for (const it of state.receipt) {
        const line = el('div', 'receipt-line', {});
        const minus = el('button', '-ml-3 flex h-11 w-11 items-center justify-center text-muted', { 'aria-label': 'Remove one ' + it.name, onclick: () => {
          it.qty -= 1;
          if (it.qty <= 0) state.receipt = state.receipt.filter((x) => x !== it);
          saveTicket(); renderReceipt(); renderGrid();
        } });
        minus.append(icon('minus', 'h-4 w-4'));
        line.append(minus,
          el('span', 'truncate', { text: it.qty + ' × ' + it.name }),
          el('span', 'receipt-leader'),
          el('span', 'tabular-nums', { text: amt(it.priceCents * it.qty) }));
        lines.append(line);
      }
      paper.append(lines);
    }
    const totalRow = el('div', 'mt-2 flex shrink-0 items-baseline justify-between border-t-2 border-dashed border-muted/50 pt-2.5', {});
    totalRow.append(el('span', 'text-body', { text: 'Total' }), el('b', 'text-title tabular-nums', { text: money(total) }));
    paper.append(totalRow);
    const charge = el('button', 'btn-primary mt-3 w-full shrink-0 text-body font-semibold', { style: 'height:52px', text: 'Charge ' + money(total), onclick: () => openCharge(total) });
    if (!state.receipt.length) charge.disabled = true;
    paper.append(charge);
    receiptCol.append(paper);
  };

  state._renderGrid = renderGrid;
  state._renderReceipt = renderReceipt;
  state._renderChips = renderChips;

  if (!state.catalog) {
    gridWrap.append(el('div', 'grid grid-cols-3 gap-2 md:grid-cols-4 xl:grid-cols-6', {},
      ...Array.from({ length: 9 }, () => el('div', 'skeleton h-[108px] rounded-xl'))));
    loadCatalog().then(() => { if (state._renderGrid) { renderChips(); renderGrid(); renderReceipt(); } })
      .catch(() => { clear(gridWrap); gridWrap.append(errorState('Couldn’t load the products', 'The product list didn’t come back. The register itself still works.', () => { clear(gridWrap); gridWrap.append(el('div', 'skeleton h-12')); loadCatalog().then(() => { renderChips(); renderGrid(); renderReceipt(); }).catch(() => renderRegister(main)); })); });
  } else {
    renderChips(); renderGrid();
  }
  renderReceipt();

}

function addToTicket(p, cat) {
  const existing = state.receipt.find((it) => it.productId === p.id);
  if (existing) existing.qty += 1;
  else state.receipt.push({ productId: p.id, name: p.name, priceCents: Number(p.price_cents), qty: 1, color: cat ? cat.color : 'slate', icon: cat ? cat.icon : 'tag' });
  saveTicket();
  state._renderGrid(); state._renderReceipt();
}

async function loadCatalog() {
  const data = await api('/shops/' + state.shop.id + '/catalog');
  state.catalog = data;
}

function shopMenu(anchor) {
  const shops = state.me.shops;
  const menu = el('div', 'fixed inset-0 z-50', { onclick: () => menu.remove() });
  const list = el('div', 'absolute bottom-4 left-4 right-4 mx-auto max-w-sm rounded-xl border border-line bg-surface p-2 shadow-2xl');
  // The shop list only earns its place with two or more shops to pick.
  if (shops.length >= 2 || wantsDemo()) {
    list.append(el('p', 'section-label', { text: 'Shops' }));
    for (const s of shops) {
      const b = el('button', 'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-body' + (s.id === state.shop.id ? ' font-semibold' : ''), {
        onclick: async () => { menu.remove(); state.shop = s; state.catalog = null; state.receipt = null; loadTicket(); location.hash = '#' + (allowedTabs()[0].key); route(); },
      });
      b.append(icon('register', 'h-5 w-5 text-muted'), s.name);
      list.append(b);
    }
    list.append(el('div', 'mx-1 my-1 border-t border-line'));
  }
  list.append(el('p', 'section-label mb-0', { text: 'Your account' }));
  const signin = el('button', 'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-body', {
    onclick: () => { menu.remove(); openSignInMethods(); },
  });
  signin.append(icon('lock', 'h-5 w-5 text-muted'), 'Sign-in methods');
  list.append(signin);
  if (state.me.signedInWith === 'google' || state.me.signedInWith === 'apple') {
    const out = el('button', 'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-body', {
      onclick: async () => {
        menu.remove();
        try {
          await api('/auth/oauth/signout', { method: 'POST' });
        } catch (_) {}
        location.replace('/');
      },
    });
    out.append(icon('close', 'h-5 w-5 text-muted'), 'Sign out');
    list.append(out);
  }
  menu.append(list);
  document.getElementById('app').append(menu);
}

// ── Sign-in methods ──────────────────────────────────────────────────────
// Which ways this person can sign in: Homeroom (always on) and any social
// account they've linked. Linking opens the provider in a small popup; the
// sheet polls the server for the outcome, so it never relies on
// window.opener (storage is partitioned inside the frame).
const PROVIDER_LABEL = { google: 'Google', apple: 'Apple' };
const LINK_ERRORS = {
  taken: 'That account is already linked to someone else.',
  already_linked: 'You already have an account of this kind linked. Unlink it first.',
  unverified: 'The provider hasn’t confirmed that account’s email, so it can’t be linked.',
  expired: 'Linking was cancelled.',
  cancelled: 'Linking was cancelled.',
};

let signinSheet = null; // the open Sign-in methods sheet, to close on refresh

function openSignInMethods() {
  if (signinSheet) signinSheet.close();
  const sheet = openSheet('Sign-in methods', (body) => {
    body.setAttribute('data-signin-methods', '');
    body.append(el('p', 'text-body text-muted', {
      text: 'Ways you can sign in to Smart Cashier as ' + state.me.user.username + '.',
    }));
    const holder = el('div', '', {});
    body.append(holder);
    body.append(el('p', 'text-small text-muted', {
      text: 'Once linked, you can open Smart Cashier at its own address and choose that account to sign in. Your shops, role and sales stay the same.',
    }));

    const render = (data) => {
      clear(holder);
      const rows = el('ul', 'list', {});
      rows.append(el('li', 'list-row justify-between', {},
        el('div', 'flex flex-col', {},
          el('span', 'text-body', { text: 'Homeroom' }),
          el('span', 'text-small text-muted', { text: 'Your main account' })),
        el('span', 'text-small font-medium text-accent', { text: 'On' })));
      for (const p of data.providers) {
        const label = PROVIDER_LABEL[p.provider] || p.provider;
        const smallLine = p.linked ? p.linked.email
          : (p.configured ? 'Not linked' : 'Not set up yet');
        const action = p.linked
          ? el('button', 'btn-secondary', { text: 'Unlink', onclick: () => unlinkProvider(p, data) })
          : el('button', 'btn-secondary', {
              text: 'Link',
              onclick: () => linkProvider(p, render),
              disabled: p.configured ? undefined : 'true',
            });
        if (!p.configured && !p.linked) action.disabled = true;
        rows.append(el('li', 'list-row justify-between', {},
          el('div', 'flex flex-col', {},
            el('span', 'text-body', { text: label }),
            el('span', 'text-small text-muted', { text: smallLine })),
          action));
      }
      holder.append(rows);

      // The not-set-up note, and the redirect address an Owner can paste
      // into the provider's console.
      for (const p of data.providers) {
        if (p.configured) continue;
        const label = PROVIDER_LABEL[p.provider] || p.provider;
        const note = el('div', 'mt-3 rounded-xl bg-raised p-4', {},
          el('p', 'text-body', { text: label + ' sign-in isn’t set up for this app yet.' }),
          el('p', 'text-small text-muted', {
            text: 'The app’s admins add ' + (label === 'Apple' ? 'an' : 'a') + ' ' + label + ' client ID and secret in Homeroom, under the app’s Secrets. In the provider’s console, use this as the redirect address:',
          }));
        if (data.callbackUrl) {
          note.append(el('code', 'mt-2 block break-all font-receipt text-small', { text: data.callbackUrl }));
        }
        holder.append(note);
      }
    };

    holder.append(el('div', 'flex flex-col gap-2', {},
      el('div', 'skeleton h-14'),
      el('div', 'skeleton h-14')));
    api('/auth/oauth/methods').then(render).catch(() => {
      clear(holder);
      holder.append(errorState('Couldn’t load your sign-in methods',
        'Your shops and sales are fine. Try again.',
        () => {
          clear(holder);
          holder.append(el('div', 'skeleton h-14'));
          api('/auth/oauth/methods').then(render).catch(() => openSignInMethods());
        }));
    });
  });
  signinSheet = sheet;
  return sheet;
}

function linkProvider(p) {
  const label = PROVIDER_LABEL[p.provider] || p.provider;
  // Open the popup synchronously inside the tap: a later call is what
  // browsers block.
  const popup = window.open('', 'sc-' + p.provider, 'width=480,height=640');
  const sheetBody = document.querySelector('[data-signin-methods]');
  const showError = (text, retry) => {
    if (!sheetBody) return;
    let box = sheetBody.querySelector('[data-link-error]');
    if (!box) {
      box = el('div', 'rounded-xl bg-raised p-4', { 'data-link-error': '' });
      sheetBody.insertBefore(box, sheetBody.lastChild);
    }
    clear(box);
    box.append(el('p', 'text-body', { text }));
    if (retry) box.append(el('button', 'btn-secondary mt-2', { text: 'Try again', onclick: () => { box.remove(); linkProvider(p); } }));
  };
  api('/auth/oauth/start', { method: 'POST', body: { provider: p.provider } })
    .then((r) => {
      if (!popup) {
        showError('Your browser blocked the ' + label + ' window. Allow pop-ups for this app and try again.', true);
        return;
      }
      popup.location = r.url;
      const stateValue = r.state;
      const started = Date.now();
      let closedSeen = false;
      const timer = setInterval(async () => {
        if (Date.now() - started > 10 * 60 * 1000) { clearInterval(timer); return; }
        let st;
        try { st = await api('/auth/oauth/status?state=' + encodeURIComponent(stateValue)); }
        catch (_) { return; }
        if (st.status === 'done') {
          clearInterval(timer);
          if (popup && !popup.closed) popup.close();
          toast(label + ' linked');
          openSignInMethods(); // a fresh sheet with the fresh answer
          return;
        }
        if (st.status === 'failed') {
          clearInterval(timer);
          if (popup && !popup.closed) popup.close();
          showError(LINK_ERRORS[st.error] || 'The provider didn’t answer. Try again.',
            st.error !== 'cancelled' && st.error !== 'expired');
          return;
        }
        if (popup.closed) {
          if (!closedSeen) { closedSeen = true; return; } // poll once more
          clearInterval(timer);
          showError('Linking was cancelled.', true);
        }
      }, 1500);
    })
    .catch((err) => {
      if (popup) popup.close();
      showError(err.data && err.data.error === 'not_configured'
        ? label + ' sign-in isn’t set up for this app yet.'
        : 'The provider didn’t answer. Try again.', true);
    });
}

function unlinkProvider(p, data) {
  const label = PROVIDER_LABEL[p.provider] || p.provider;
  confirmSheet('Unlink ' + label + '?',
    'You won’t be able to sign in with ' + (p.linked ? p.linked.email : 'it') + ' any more.',
    'Unlink',
    async () => {
      try {
        await api('/auth/oauth/' + p.provider, { method: 'DELETE' });
        if (state.me.signedInWith === p.provider) {
          location.replace('/');
          return;
        }
        toast(label + ' unlinked');
        openSignInMethods(); // a fresh sheet with the fresh answer
      } catch (err) {
        toast(err.message || 'Could not unlink it', true);
      }
    });
}

function confirmSheet(title, message, actionLabel, action) {
  openSheet(title, (body, close) => {
    body.append(el('p', 'text-body text-muted', { text: message }));
    const row = el('div', 'mt-2 flex gap-2');
    const cancel = el('button', 'btn-secondary flex-1', { text: 'Cancel', onclick: close });
    const go = el('button', 'btn-danger flex-1', { text: actionLabel, onclick: async () => { close(); await action(); } });
    row.append(cancel, go);
    body.append(row);
  });
}

// ── Charge sheet ─────────────────────────────────────────────────────────
function openCharge(total) {
  const clientId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random());
  let method = 'cash';
  let received = null; // cents
  const sheet = openSheet('Charge', (body, close) => {
    const due = el('p', 'text-title tabular-nums', { text: money(total) });
    const count = state.receipt.reduce((a, it) => a + it.qty, 0);
    body.append(
      el('div', 'flex items-baseline justify-between', {},
        el('span', 'font-receipt text-small text-muted', { text: saleLabel(state.shop.next_sale_no) })));
    body.append(due, el('p', 'text-small text-muted', { text: count + (count === 1 ? ' item' : ' items') }));

    body.append(el('p', 'section-label mt-2', { text: 'Paid by' }));
    const seg = el('div', 'seg', { role: 'tablist' });
    const segBtns = {};
    for (const m of ['cash', 'card', 'qr']) {
      const b = el('button', 'seg-btn' + (m === method ? ' seg-on' : ''), { type: 'button', onclick: () => {
        method = m; received = null; field.value = ''; renderChange();
        for (const k of Object.keys(segBtns)) segBtns[k].classList.toggle('seg-on', k === m);
        cashWrap.classList.toggle('hidden', m !== 'cash');
      } });
      b.append(icon(m, 'h-5 w-5'), METHOD_LABEL[m]);
      segBtns[m] = b;
      seg.append(b);
    }
    body.append(seg);

    const cashWrap = el('div', '', {});
    body.append(cashWrap);
    cashWrap.append(el('p', 'section-label mt-2', { text: 'Cash received' }));
    const pre = el('span', 'pointer-events-none absolute left-3 top-3 text-body text-muted', { text: M.currency(state.shop.currency).symbol + ' ' });
    const field = el('input', 'field pl-12 tabular-nums', { inputmode: 'decimal', placeholder: 'e.g. ' + amt(total), 'aria-label': 'Cash received' });
    const fw = el('div', 'relative', {});
    fw.append(pre, field);
    cashWrap.append(fw);
    const quick = el('div', 'mt-2 flex gap-2', {});
    cashWrap.append(quick);
    const renderQuick = () => {
      clear(quick);
      for (const [c, label] of M.quickCashAmounts(total, state.shop.currency)) {
        quick.append(el('button', 'min-h-11 flex-1 rounded-lg border border-line bg-surface text-small font-medium tabular-nums', {
          type: 'button', text: label || amt(c),
          onclick: () => { received = c; field.value = amt(c); renderChange(); },
        }));
      }
    };
    renderQuick();
    field.addEventListener('input', () => {
      const parsed = M.parseMoney(field.value, state.shop.currency);
      received = parsed;
      renderChange();
    });

    const changeRow = el('div', 'mt-3 flex items-baseline justify-between border-t border-line pt-3', {});
    const shortRow = el('p', 'hidden text-small text-danger', {});
    const record = el('button', 'btn-primary mt-3 w-full font-semibold', { style: 'height:52px', text: 'Record sale' });
    const note = el('p', 'mt-2 text-center text-small text-muted', { text: 'No money moves through the app. Take the payment at the counter.' });

    const renderChange = () => {
      clear(changeRow);
      if (method !== 'cash') { changeRow.classList.add('hidden'); shortRow.classList.add('hidden'); record.disabled = false; record.textContent = 'Record sale'; return; }
      changeRow.classList.remove('hidden');
      if (received == null) {
        changeRow.append(el('span', 'text-body', { text: 'Change to give' }), el('b', 'text-heading tabular-nums text-muted', { text: '·' }));
        record.disabled = true; record.textContent = 'Record sale';
        shortRow.classList.add('hidden');
      } else if (received < total) {
        changeRow.classList.add('hidden');
        shortRow.classList.remove('hidden');
        shortRow.textContent = 'Short by ' + money(total - received) + '. Ask for the rest or charge the card instead.';
        record.disabled = true;
      } else {
        changeRow.append(el('span', 'text-body', { text: 'Change to give' }), el('b', 'text-heading tabular-nums', { text: money(received - total) }));
        shortRow.classList.add('hidden');
        record.disabled = false;
      }
    };
    renderChange();
    body.append(changeRow, shortRow, record, note);

    let saving = false;
    record.addEventListener('click', async () => {
      if (saving) return;
      saving = true;
      record.disabled = true;
      try {
        const bodyReq = { clientId, method, items: state.receipt.map((it) => ({ productId: it.productId, qty: it.qty })) };
        if (method === 'cash') bodyReq.cashReceivedCents = received == null ? null : received;
        const res = await api('/shops/' + state.shop.id + '/sales', { method: 'POST', body: bodyReq });
        const change = method === 'cash' && received != null && received > res.sale.totalCents ? ' Change ' + money(received - res.sale.totalCents) : '';
        toast(saleLabel(res.sale.saleNo) + ' recorded.' + change);
        state.shop.next_sale_no = Math.max(state.shop.next_sale_no, res.sale.saleNo + 1);
        state.receipt = [];
        saveTicket();
        close();
        state.catalog = null;
        state._renderReceipt();
        loadCatalog().then(() => { if (state._renderChips) { state._renderChips(); state._renderGrid(); state._renderReceipt(); } }).catch(() => {});
      } catch (err) {
        saving = false;
        record.disabled = false;
        if (err.data && err.data.error === 'catalog_changed') {
          const names = (err.data.missing || []).join(', ');
          state.receipt = state.receipt.filter((it) => !(err.data.missing || []).some((m) => it.name === m));
          saveTicket();
          close();
          state.catalog = null;
          loadCatalog().then(() => { if (state._renderChips) { state._renderChips(); state._renderGrid(); state._renderReceipt(); } }).catch(() => {});
          toast(names + ' was removed from sale and taken off the receipt.', true);
        } else if (err.data && err.data.error === 'cash_short') {
          toast('Cash received is short by ' + money(err.data.short || 0) + '.', true);
        } else {
          toast('The sale was not recorded. Try again.', true);
        }
      }
    });
  });
}

// ── Products management ──────────────────────────────────────────────────
function openProducts() {
  openSheet('Products', (body, close) => {
    const listHolder = el('div', 'flex flex-col gap-3');
    body.append(listHolder);
    const renderList = () => {
      clear(listHolder);
      const add = el('button', 'btn-secondary w-full', { text: 'Add product', onclick: () => openProductEditor(null, renderList) });
      listHolder.append(add);
      const list = el('ul', 'list', {});
      for (const p of state.catalog.products) {
        const cat = state.catalog.categories.find((c) => c.id === p.category_id);
        const row = el('li', 'list-row justify-between', {});
        const left = el('div', 'flex flex-col');
        left.append(el('span', 'text-body' + (p.on_sale ? '' : ' text-muted'), { text: p.name }),
          el('span', 'text-small text-muted', { text: money(p.price_cents) + (cat ? ' · ' + cat.name : '') + (p.on_sale ? '' : ' · Off sale') }));
        const edit = el('button', 'flex h-11 w-11 items-center justify-center text-muted', { 'aria-label': 'Edit ' + p.name, onclick: () => openProductEditor(p, renderList) });
        edit.append(icon('pencil', 'h-5 w-5'));
        row.append(left, edit);
        list.append(row);
      }
      listHolder.append(list);
      const catHead = el('div', 'mt-2 flex items-center justify-between', {},
        el('p', 'section-label mb-0', { text: 'Categories' }));
      const addCat = el('button', 'min-h-11 px-2 text-small font-medium text-accent', { text: 'Add category', onclick: () => openCategoryEditor(null, renderList) });
      catHead.append(addCat);
      listHolder.append(catHead);
      const catList = el('ul', 'list', {});
      for (const c of state.catalog.categories) {
        const row = el('li', 'list-row justify-between', {});
        const left = el('div', 'flex items-center gap-2', {},
          el('span', 'h-3 w-3 rounded-full ' + CAT[c.color].dot),
          el('span', 'text-body', { text: c.name }));
        const edit = el('button', 'flex h-11 w-11 items-center justify-center text-muted', { 'aria-label': 'Edit ' + c.name, onclick: () => openCategoryEditor(c, renderList) });
        edit.append(icon('pencil', 'h-5 w-5'));
        row.append(left, edit);
        catList.append(row);
      }
      listHolder.append(catList);
    };
    renderList();
  });
}

function openProductEditor(product, done) {
  openSheet(product ? 'Edit product' : 'Add product', (body, close) => {
    const name = el('input', 'field', { placeholder: 'e.g. Iced latte', maxlength: '60', value: product ? product.name : '' });
    const price = el('input', 'field tabular-nums', { inputmode: 'decimal', placeholder: 'e.g. ' + amt(product ? product.price_cents : 0) || 'e.g. 4.50', value: product ? amt(product.price_cents) : '' });
    const catSel = el('select', 'field', {});
    for (const c of state.catalog.categories) catSel.append(el('option', '', { value: c.id, text: c.name }));
    if (product && product.category_id) catSel.value = product.category_id;
    let onSale = product ? product.on_sale : true;
    const save = el('button', 'btn-primary w-full', { text: product ? 'Save changes' : 'Add product' });
    body.append(
      el('label', 'section-label', { text: 'Name' }), name,
      el('label', 'section-label', { text: 'Price' }), price,
      el('label', 'section-label', { text: 'Category' }), catSel,
      switchRow('On sale', onSale, (v) => { onSale = v; }, 'Hides it from the register for now'),
      save);
    if (product) {
      const archive = el('button', 'min-h-11 text-small font-medium text-danger', { text: 'Remove from sale list', onclick: async () => {
        try {
          await api('/shops/' + state.shop.id + '/products/' + product.id, { method: 'PATCH', body: { archived: true } });
          await loadCatalog(); close(); if (done) done(); if (state._renderGrid) { state._renderChips(); state._renderGrid(); }
        } catch (err) { toast(err.message || 'Could not remove it', true); }
      } });
      body.append(archive);
    }
    save.addEventListener('click', async () => {
      const parsed = M.parseMoney(price.value, state.shop.currency);
      if (!name.value.trim()) { toast('Give it a name', true); return; }
      if (parsed == null) { toast('Check the price', true); return; }
      save.disabled = true;
      try {
        if (product) await api('/shops/' + state.shop.id + '/products/' + product.id, { method: 'PATCH', body: { name: name.value.trim(), priceCents: parsed, categoryId: Number(catSel.value) || null, onSale } });
        else await api('/shops/' + state.shop.id + '/products', { method: 'POST', body: { name: name.value.trim(), priceCents: parsed, categoryId: Number(catSel.value) || null, onSale } });
        await loadCatalog(); close(); if (done) done(); if (state._renderGrid) { state._renderChips(); state._renderGrid(); }
      } catch (err) { save.disabled = false; toast(err.message || 'Could not save', true); }
    });
  });
}

const SWATCHES = ['red', 'amber', 'teal', 'blue', 'plum', 'slate'];
function openCategoryEditor(category, done) {
  openSheet(category ? 'Edit category' : 'Add category', (body, close) => {
    const name = el('input', 'field', { placeholder: 'e.g. Coffee', maxlength: '30', value: category ? category.name : '' });
    let color = category ? category.color : 'slate';
    let iconSel = category ? category.icon : 'tag';
    const sw = el('div', 'flex gap-2', {});
    const renderSw = () => {
      clear(sw);
      for (const c of SWATCHES) {
        const b = el('button', 'flex h-11 w-11 items-center justify-center rounded-lg border' + (c === color ? ' border-fg' : ' border-line'), {
          'aria-label': c, onclick: () => { color = c; renderSw(); },
        });
        b.append(el('span', 'h-4 w-4 rounded-full ' + CAT[c].dot));
        sw.append(b);
      }
    };
    renderSw();
    const ic = el('div', 'flex flex-wrap gap-2', {});
    const renderIc = () => {
      clear(ic);
      for (const i of ['cup', 'leaf', 'bowl', 'loaf', 'bottle', 'bag', 'box', 'tag']) {
        const b = el('button', 'flex h-11 w-11 items-center justify-center rounded-lg border' + (i === iconSel ? ' border-fg' : ' border-line') + ' ' + CAT[color].text, {
          'aria-label': i, onclick: () => { iconSel = i; renderIc(); },
        });
        b.append(icon(i, 'h-5 w-5'));
        ic.append(b);
      }
    };
    renderIc();
    const save = el('button', 'btn-primary w-full', { text: category ? 'Save changes' : 'Add category' });
    body.append(el('label', 'section-label', { text: 'Name' }), name,
      el('label', 'section-label', { text: 'Colour' }), sw,
      el('label', 'section-label', { text: 'Icon' }), ic, save);
    save.addEventListener('click', async () => {
      if (!name.value.trim()) { toast('Give it a name', true); return; }
      save.disabled = true;
      try {
        if (category) await api('/shops/' + state.shop.id + '/categories/' + category.id, { method: 'PATCH', body: { name: name.value.trim(), color, icon: iconSel } });
        else await api('/shops/' + state.shop.id + '/categories', { method: 'POST', body: { name: name.value.trim(), color, icon: iconSel } });
        await loadCatalog(); close(); if (done) done(); if (state._renderChips) { state._renderChips(); state._renderGrid(); }
      } catch (err) { save.disabled = false; toast(err.message || 'Could not save', true); }
    });
  });
}

// ── Finance ──────────────────────────────────────────────────────────────
function segControl(options, value, onChange) {
  const seg = el('div', 'seg', {});
  for (const [key, label] of options) {
    const b = el('button', 'seg-btn' + (key === value ? ' seg-on' : ''), { type: 'button', text: label, onclick: () => onChange(key) });
    seg.append(b);
  }
  return seg;
}

function statTile(label, value) {
  return el('div', 'rounded-xl border border-line bg-surface p-4', {},
    el('p', 'text-small text-muted', { text: label }),
    el('p', 'text-title tabular-nums', { text: value }));
}

function renderFinance(main, part) {
  main.append(demoLine());
  const segWrap = el('div', 'px-4 pt-4');
  main.append(segWrap);
  const holder = el('div', '', {});
  main.append(holder);
  const renderSeg = () => {
    clear(segWrap);
    segWrap.append(segControl([['summary', 'Summary'], ['transactions', 'Transactions'], ['payouts', 'Payouts']], part, (k) => {
      state.financePart = k;
      location.hash = '#finance/' + k;
    }));
  };
  renderSeg();
  if (part === 'summary') renderSummary(holder);
  else if (part === 'transactions') renderTransactions(holder);
  else renderPayouts(holder);
}

function renderSummary(holder) {
  holder.setAttribute('data-finance-summary', '');
  holder.append(el('div', 'px-4 pb-2 pt-3', {}));
  const periodWrap = el('div', 'px-4', {});
  holder.append(periodWrap);
  const body = el('div', 'px-4 pb-4', {});
  holder.append(body);
  const render = () => {
    clear(periodWrap); clear(body);
    periodWrap.append(segControl([['today', 'Today'], ['week', 'This week'], ['month', 'This month']], state.financePeriod, (k) => { state.financePeriod = k; render(); }));
    body.append(el('div', 'mt-3 flex flex-col gap-2', {},
      ...Array.from({ length: 4 }, () => el('div', 'skeleton h-20'))));
    api('/shops/' + state.shop.id + '/finance/summary?period=' + state.financePeriod).then((s) => {
      const grid = el('div', 'mt-3 grid grid-cols-2 gap-2', {},
        statTile('Net sales', money(s.totalCents)),
        statTile('Sales', String(s.count)),
        statTile('Average sale', money(s.averageCents)),
        statTile('Payouts', money(s.payoutsCents)));
      const after = el('div', 'mt-2 rounded-xl border border-line bg-surface p-4', {},
        el('p', 'text-small text-muted', { text: 'Left after payouts' }),
        el('p', 'text-title tabular-nums', { text: money(s.afterPayoutsCents) }));
      const methods = el('ul', 'list mt-2', {});
      for (const m of ['cash', 'card', 'qr']) {
        const row = el('li', 'list-row justify-between', {},
          el('span', 'text-body', { text: METHOD_LABEL[m] }),
          el('span', 'tabular-nums', { text: money(s.byMethod[m] || 0) }));
        methods.append(row);
      }
      const npo = el('div', 'mt-2 rounded-xl border border-line bg-surface p-4', {},
        el('p', 'text-small text-muted', { text: 'Not yet paid out' }),
        el('p', 'text-heading tabular-nums', { text: money(s.notPaidOutCents) }),
        el('p', 'text-small text-muted', { text: 'All sales so far minus all payouts so far.' }));
      clear(body);
      body.append(grid, after, el('p', 'section-label mt-4', { text: 'Paid by method' }), methods, npo);
    }).catch(() => {
      clear(body);
      body.append(errorState('Couldn’t load the summary', 'The numbers didn’t come back. Your recorded sales are safe.', () => render()));
    });
  };
  render();
}

function renderTransactions(holder) {
  const body = el('div', 'px-4 pb-4 pt-3', {});
  holder.append(body);
  body.append(el('div', 'flex flex-col gap-2', {}, ...Array.from({ length: 5 }, () => el('div', 'skeleton h-16'))));
  api('/shops/' + state.shop.id + '/sales?limit=60').then((data) => {
    clear(body);
    if (!data.sales.length) {
      body.append(el('div', 'state-empty', {},
        el('p', 'text-body font-medium', { text: 'No sales yet' }),
        el('p', 'text-small text-muted', { text: 'Sales you record at the register show up here.' })));
      return;
    }
    const groups = new Map();
    for (const s of data.sales) {
      const day = localDate(new Date(s.createdAt));
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(s);
    }
    for (const [day, sales] of groups) {
      body.append(el('p', 'section-label mt-3 first:mt-0', { text: dayLabel(new Date(sales[0].createdAt)) }));
      const list = el('ul', 'list', {});
      for (const s of sales) {
        const row = el('li', 'list-row justify-between' + (s.voidedAt ? ' opacity-60' : ''), { onclick: () => openSale(s), role: 'button', tabindex: '0' });
        const left = el('div', 'flex flex-col');
        left.append(
          el('span', 'font-receipt text-small font-semibold' + (s.voidedAt ? ' line-through' : ''), { text: saleLabel(s.saleNo) + ' · ' + timeLabel(new Date(s.createdAt)) }),
          el('span', 'text-small text-muted', { text: s.cashierUsername + ', ' + METHOD_LABEL[s.method] }));
        const right = el('div', 'flex items-center gap-2', {});
        right.append(el('span', 'tabular-nums' + (s.voidedAt ? ' line-through' : ''), { text: money(s.totalCents) }));
        if (s.voidedAt) right.append(el('span', 'rounded-full bg-raised px-2 py-0.5 text-small text-muted', { text: 'Voided' }));
        row.append(left, right);
        list.append(row);
      }
      body.append(list);
    }
  }).catch(() => {
    clear(body);
    body.append(errorState('Couldn’t load the transactions', 'The sales list didn’t come back. Try again.', () => renderTransactions(holder)));
  });
}

function openSale(s) {
  openSheet(saleLabel(s.saleNo), (body, close) => {
    const holder = el('div', '', {});
    body.append(holder);
    const renderItems = (items, sale) => {
      clear(holder);
      const paper = el('div', 'receipt rounded-lg border border-line', { 'data-receipt': '' });
      paper.append(el('p', 'text-center text-small text-muted', { text: dayLabel(new Date(sale.createdAt)) + ' · ' + timeLabel(new Date(sale.createdAt)) }));
      paper.append(el('p', 'mt-1 text-center font-receipt text-small font-semibold', { text: saleLabel(sale.saleNo) }));
      for (const it of items) {
        const line = el('div', 'receipt-line', {});
        line.append(
          el('span', 'truncate', { text: it.qty + ' × ' + it.name }),
          el('span', 'receipt-leader'),
          el('span', 'tabular-nums', { text: amt(Number(it.unit_price_cents) * it.qty) }));
        paper.append(line);
      }
      const totalRow = el('div', 'mt-2 flex items-baseline justify-between border-t-2 border-dashed border-muted/50 pt-2.5', {});
      totalRow.append(el('span', 'text-body', { text: 'Total · ' + METHOD_LABEL[sale.method] }), el('b', 'text-heading tabular-nums', { text: money(sale.totalCents) }));
      paper.append(totalRow);
      if (sale.method === 'cash' && sale.cashReceivedCents != null) {
        paper.append(el('p', 'mt-1 flex justify-between text-small text-muted', {},
          el('span', '', { text: 'Cash received' }), el('span', 'tabular-nums', { text: amt(sale.cashReceivedCents) })),
          el('p', 'flex justify-between text-small text-muted', {},
            el('span', '', { text: 'Change to give' }), el('span', 'tabular-nums', { text: amt(sale.cashReceivedCents - sale.totalCents) })));
      }
      if (sale.voidedAt) {
        paper.append(el('p', 'mt-2 text-center text-small font-semibold text-danger', { text: 'Voided' + (sale.voidReason ? ': ' + sale.voidReason : '') }));
      }
      holder.append(paper);
      if (can('finance') && !sale.voidedAt) {
        const voidBtn = el('button', 'btn-secondary mt-3 w-full border-danger/40 text-danger', { text: 'Void sale', onclick: () => {
          openSheet('Void sale', (vbody, vclose) => {
            vbody.append(el('p', 'text-body text-muted', { text: 'It stays in the list, struck through, and stops counting in totals.' }));
            const reason = el('input', 'field', { placeholder: 'Reason (optional), e.g. rang up twice' });
            vbody.append(reason);
            const go = el('button', 'btn-primary w-full bg-danger text-on-danger', { text: 'Void sale' });
            vbody.append(go);
            go.addEventListener('click', async () => {
              go.disabled = true;
              try {
                await api('/shops/' + state.shop.id + '/sales/' + sale.id + '/void', { method: 'POST', body: { reason: reason.value.trim() || null } });
                vclose(); close();
                toast(saleLabel(sale.saleNo) + ' voided');
                const holder2 = document.querySelector('[data-finance-transactions]') || null;
                route(); // re-render current screen
              } catch (err) { go.disabled = false; toast(err.message || 'Could not void it', true); }
            });
          });
        } });
        holder.append(voidBtn);
      }
    };
    holder.append(el('div', 'skeleton h-40'));
    api('/shops/' + state.shop.id + '/sales/' + s.id).then((d) => renderItems(d.items, d.sale))
      .catch(() => { clear(holder); holder.append(errorState('Couldn’t load that sale', 'The sale’s details didn’t come back. Try again.', () => openSale(s))); });
  });
}

function renderPayouts(holder) {
  holder.setAttribute('data-finance-payouts', '');
  const head = el('div', 'flex items-center justify-between px-4 pb-1 pt-3', {},
    el('p', 'section-label mb-0', { text: 'Money taken out of the shop' }));
  const logBtn = el('button', 'btn-secondary h-11 px-3.5 text-small', { onclick: () => openPayoutEditor(() => renderPayouts(holder)) });
  logBtn.append(icon('plus', 'h-5 w-5'), 'Log payout');
  head.append(logBtn);
  const body = el('div', 'px-4 pb-4 pt-2', {});
  holder.append(head, body);
  body.append(el('div', 'flex flex-col gap-2', {}, ...Array.from({ length: 3 }, () => el('div', 'skeleton h-16'))));
  api('/shops/' + state.shop.id + '/payouts').then((data) => {
    clear(body);
    if (!data.payouts.length) {
      body.append(el('div', 'state-empty', {},
        el('p', 'text-body font-medium', { text: 'No payouts logged yet' }),
        el('p', 'text-small text-muted', { text: 'Log money you take out of the shop. Logging a payout moves no money.' }),
        el('button', 'btn-secondary mt-2', { text: 'Log payout', onclick: () => openPayoutEditor(() => renderPayouts(holder)) })));
      return;
    }
    const list = el('ul', 'list', {});
    for (const p of data.payouts) {
      const row = el('li', 'list-row justify-between', {});
      const left = el('div', 'flex flex-col');
      left.append(el('span', 'text-body tabular-nums', { text: money(p.amountCents) }),
        el('span', 'text-small', { text: p.paidTo }),
        el('span', 'text-small text-muted', { text: p.paidOn + (p.note ? ' · ' + p.note : '') + ' · logged by ' + p.loggedBy }));
      const del = el('button', 'flex h-11 w-11 items-center justify-center text-muted', { 'aria-label': 'Delete payout', onclick: () => {
        confirmSheet('Delete this payout?', 'It stops counting in the totals. This cannot be undone.', 'Delete', async () => {
          try { await api('/shops/' + state.shop.id + '/payouts/' + p.id, { method: 'DELETE' }); renderPayouts(holder); }
          catch (err) { toast(err.message || 'Could not delete it', true); }
        });
      } });
      del.append(icon('trash', 'h-5 w-5'));
      row.append(left, del);
      list.append(row);
    }
    body.append(list);
  }).catch(() => {
    clear(body);
    body.append(errorState('Couldn’t load the payouts', 'The payout list didn’t come back. Try again.', () => renderPayouts(holder)));
  });
}

function openPayoutEditor(done) {
  openSheet('Log payout', (body, close) => {
    const amount = el('input', 'field tabular-nums', { inputmode: 'decimal', placeholder: 'e.g. ' + amt(25000) });
    const paidTo = el('input', 'field', { placeholder: "e.g. Owner's bank account", maxlength: '80' });
    const d = now();
    const paidOn = el('input', 'field tabular-nums', { type: 'date', value: localDate(d) });
    const note = el('input', 'field', { placeholder: 'Note (optional)', maxlength: '200' });
    const save = el('button', 'btn-primary w-full', { text: 'Log payout' });
    body.append(
      el('label', 'section-label', { text: 'Amount' }), amount,
      el('label', 'section-label', { text: 'Paid to' }), paidTo,
      el('label', 'section-label', { text: 'Date' }), paidOn,
      el('label', 'section-label', { text: 'Note' }), note, save,
      el('p', 'text-small text-muted', { text: 'This records the money leaving. It does not move money.' }));
    save.addEventListener('click', async () => {
      const parsed = M.parseMoney(amount.value, state.shop.currency);
      if (parsed == null || parsed <= 0) { toast('Check the amount', true); return; }
      if (!paidTo.value.trim()) { toast('Say where the money went', true); return; }
      save.disabled = true;
      try {
        await api('/shops/' + state.shop.id + '/payouts', { method: 'POST', body: { amountCents: parsed, paidTo: paidTo.value.trim(), paidOn: paidOn.value, note: note.value.trim() || null } });
        close(); toast('Payout logged'); if (done) done();
      } catch (err) { save.disabled = false; toast(err.message || 'Could not log it', true); }
    });
  });
}

// ── Insights ─────────────────────────────────────────────────────────────
function renderInsights(main) {
  main.append(demoLine());
  main.append(el('div', 'px-4 pb-1 pt-4', {},
    el('h1', 'text-heading', { text: 'Insights' })));
  const rangeWrap = el('div', 'px-4', {});
  const body = el('div', 'px-4 pb-6', {});
  main.append(rangeWrap, body);
  const render = () => {
    clear(rangeWrap); clear(body);
    rangeWrap.append(segControl([['today', 'Today'], ['7d', '7 days'], ['30d', '30 days']], state.insightsRange, (k) => { state.insightsRange = k; render(); }));
    body.append(el('div', 'mt-3 flex flex-col gap-2', {},
      ...Array.from({ length: 4 }, () => el('div', 'skeleton h-20'))));
    api('/shops/' + state.shop.id + '/insights?range=' + state.insightsRange).then((d) => {
      clear(body);
      if (!d.count && !d.prevCount) {
        body.append(el('div', 'state-empty', {},
          el('p', 'text-body font-medium', { text: 'Not enough sales yet to show insights' }),
          el('p', 'text-small text-muted', { text: 'Record sales at the register and they appear here.' })));
        return;
      }
      const changeLine = d.change == null ? null
        : el('p', 'text-small ' + (d.change >= 0 ? 'text-accent' : 'text-danger'),
            { text: (d.change >= 0 ? 'up ' : 'down ') + Math.abs(d.change) + '% on the previous ' + (d.range === 'today' ? 'day' : d.range === '7d' ? '7 days' : '30 days') });
      body.append(
        el('div', 'mt-3 rounded-xl border border-line bg-surface p-4', {},
          el('p', 'text-small text-muted', { text: 'Total sales' }),
          el('p', 'text-title tabular-nums', { text: money(d.totalCents) }),
          changeLine,
          el('p', 'text-small text-muted', { text: d.count + (d.count === 1 ? ' sale' : ' sales') + ' · average ' + money(d.averageCents) })));
      // Sales per day (or hour)
      body.append(el('p', 'section-label mt-4', { text: d.range === 'today' ? 'Sales by hour' : 'Sales per day' }));
      const chart = el('div', 'flex h-32 items-end gap-1 rounded-xl border border-line bg-surface p-3', {});
      const max = Math.max(1, ...d.series.map((s) => s.total));
      for (const s of d.series) {
        const barWrap = el('div', 'flex flex-1 flex-col items-center justify-end gap-1 self-stretch', {});
        const bar = el('div', 'w-full rounded-t-sm bg-accent motion-safe:transition-none', {});
        bar.style.height = Math.max(2, Math.round((s.total / max) * 100)) + '%';
        barWrap.append(bar);
        chart.append(barWrap);
      }
      body.append(chart);
      const axis = el('div', 'flex justify-between px-1 pt-1 text-small text-muted', {});
      const first = d.series[0], last = d.series[d.series.length - 1];
      axis.append(el('span', { text: d.range === 'today' ? '7 am' : (first ? first.day.slice(5) : '') }),
        el('span', { text: d.range === 'today' ? '10 pm' : (last ? last.day.slice(5) : '') }));
      body.append(axis);

      body.append(el('p', 'section-label mt-4', { text: 'Best sellers' }));
      if (!d.top.length) {
        body.append(el('p', 'px-1 text-small text-muted', { text: 'No sales in this period.' }));
      } else {
        const list = el('ul', 'list', {});
        const maxQty = d.top[0].qty;
        for (const t of d.top) {
          const row = el('li', 'list-row flex-col items-stretch gap-1', {});
          const line = el('div', 'flex items-center gap-2', {});
          const look = CAT[t.color] || CAT.slate;
          const sq = el('span', 'flex h-8 w-8 items-center justify-center rounded-lg ' + look.bg + ' ' + look.text);
          sq.append(icon(t.icon || 'tag', 'h-5 w-5'));
          line.append(sq,
            el('div', 'flex flex-1 flex-col', {},
              el('span', 'text-body', { text: t.name }),
              el('span', 'text-small text-muted', { text: t.qty + ' sold' })),
            el('span', 'tabular-nums', { text: money(t.totalCents) }));
          const bar = el('div', 'h-1.5 w-full overflow-hidden rounded-full bg-raised', {},
            el('div', 'h-full rounded-full ' + look.bar, { style: 'width:' + Math.max(4, Math.round((t.qty / maxQty) * 100)) + '%' }));
          row.append(line, bar);
          list.append(row);
        }
        body.append(list);
      }

      body.append(el('p', 'section-label mt-4', { text: 'Busiest hours' }));
      const busy = d.busiestHour;
      const hoursList = el('ul', 'list', {});
      const maxHour = Math.max(1, ...d.hours.map((h) => h.count));
      const topHours = d.hours.filter((h) => h.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
      if (!topHours.length) {
        body.append(el('p', 'px-1 text-small text-muted', { text: 'No sales in this period.' }));
      } else {
        for (const h of topHours) {
          const row = el('li', 'list-row flex-col items-stretch gap-1', {});
          row.append(el('div', 'flex items-center justify-between', {},
            el('span', 'text-body', { text: hourWord(h.hour) }),
            el('span', 'text-small text-muted tabular-nums', { text: h.count + (h.count === 1 ? ' sale' : ' sales') })));
          row.append(el('div', 'h-1.5 w-full overflow-hidden rounded-full bg-raised', {},
            el('div', 'h-full rounded-full bg-accent', { style: 'width:' + Math.round((h.count / maxHour) * 100) + '%' })));
          hoursList.append(row);
        }
        body.append(busy != null ? el('p', 'px-1 pb-1 text-small text-muted', { text: 'Busiest: ' + hourWord(busy) }) : null, hoursList);
      }
    }).catch(() => {
      clear(body);
      body.append(errorState('Couldn’t load the insights', 'The numbers didn’t come back. Try again.', () => render()));
    });
  };
  render();
}

// ── Staff ────────────────────────────────────────────────────────────────
const PERM_LABEL = { register: 'Register', products: 'Products', finance: 'Finance', insights: 'Insights', staff: 'Staff' };

function renderStaff(main) {
  main.append(demoLine());
  main.append(el('div', 'px-4 pb-1 pt-4', {},
    el('h1', 'text-heading', { text: 'Staff' })));
  const body = el('div', 'px-4 pb-6', {});
  main.append(body);
  body.append(el('div', 'flex flex-col gap-2', {}, ...Array.from({ length: 4 }, () => el('div', 'skeleton h-14'))));
  Promise.all([
    api('/shops/' + state.shop.id + '/staff'),
    api('/shops/' + state.shop.id + '/roles'),
  ]).then(([staffData, rolesData]) => {
    clear(body);
    const roles = rolesData.roles;
    const isOwner = state.shop.role.is_owner;

    body.append(el('p', 'section-label', { text: 'Staff' }));
    const staffList = el('ul', 'list', {});
    for (const s of staffData.staff) {
      const row = el('li', 'list-row justify-between', {});
      const left = el('div', 'flex flex-col');
      left.append(el('span', 'text-body', { text: s.username + (s.userId === state.me.user.id ? ' (You)' : '') }),
        el('span', 'text-small text-muted', { text: s.roleName }));
      row.append(left, icon('chev', 'h-4 w-4 text-muted'));
      row.addEventListener('click', () => openStaffEditor(s, staffData, roles, () => renderStaff(main)));
      staffList.append(row);
    }
    body.append(staffList);
    const addStaff = el('button', 'btn-secondary mt-2 w-full', { text: 'Add staff', onclick: () => openAddStaff(roles, () => renderStaff(main)) });
    body.append(addStaff);

    body.append(el('p', 'section-label mt-5', { text: 'Roles' }));
    const roleList = el('ul', 'list', {});
    for (const r of roles) {
      const words = r.is_owner ? 'Everything' : PERMS_LIST.filter((p) => r['can_' + p]).map((p) => PERM_LABEL[p]).join(', ') || 'Nothing yet';
      const row = el('li', 'list-row justify-between', {});
      const left = el('div', 'flex flex-col');
      left.append(el('span', 'text-body', { text: r.name }),
        el('span', 'text-small text-muted', { text: words }));
      row.append(left, el('span', 'text-small text-muted', { text: r.holders + (r.holders === 1 ? ' person' : ' people') }));
      row.addEventListener('click', () => openRoleEditor(r, roles, () => renderStaff(main)));
      roleList.append(row);
    }
    body.append(roleList);
    if (isOwner) {
      body.append(el('button', 'btn-secondary mt-2 w-full', { text: 'Add role', onclick: () => openRoleEditor(null, roles, () => renderStaff(main)) }));
    }

    body.append(el('p', 'section-label mt-5', { text: 'Shop details' }));
    body.append(el('button', 'btn-secondary w-full', { text: 'Shop details', onclick: () => openShopDetails(() => renderStaff(main)) }));
  }).catch(() => {
    clear(body);
    body.append(errorState('Couldn’t load the staff', 'The staff list didn’t come back. Try again.', () => renderStaff(main)));
  });
}
const PERMS_LIST = ['register', 'products', 'finance', 'insights', 'staff'];

function openStaffEditor(s, staffData, roles, done) {
  const isSelf = s.userId === state.me.user.id;
  const canEdit = state.shop.role.is_owner || can('staff');
  if (!canEdit) { toast('Only the owner can change staff'); return; }
  openSheet(s.username, (body, close) => {
    body.append(el('p', 'section-label', { text: 'Role' }));
    const roleList = el('ul', 'list', {});
    for (const r of roles) {
      if (r.is_owner && !state.shop.role.is_owner) continue;
      const row = el('li', 'list-row justify-between' + (r.id === s.roleId ? ' font-semibold' : ''), { role: 'button', tabindex: '0' });
      row.append(el('span', 'text-body', { text: r.name }));
      if (r.id === s.roleId) row.append(el('span', 'text-small text-accent', { text: 'Current' }));
      row.addEventListener('click', async () => {
        try {
          await api('/shops/' + state.shop.id + '/staff/' + s.id, { method: 'PATCH', body: { roleId: r.id } });
          close(); toast(s.username + ' is now ' + r.name); done();
        } catch (err) { toast(err.message || 'Could not change the role', true); }
      });
      roleList.append(row);
    }
    body.append(roleList);
    if (!isSelf) {
      const remove = el('button', 'btn-secondary mt-2 w-full border-danger/40 text-danger', { text: 'Remove from the shop', onclick: () => {
        confirmSheet('Remove ' + s.username + '?', 'They lose access to this shop. Their past sales stay.', 'Remove', async () => {
          try { await api('/shops/' + state.shop.id + '/staff/' + s.id, { method: 'DELETE' }); close(); toast(s.username + ' removed'); done(); }
          catch (err) { toast(err.message || 'Could not remove them', true); }
        });
      } });
      body.append(remove);
    }
  });
}

function openAddStaff(roles, done) {
  openSheet('Add staff', (body, close) => {
    body.append(el('p', 'text-small text-muted', { text: 'They sign in with their own Homeroom account, added by username.' }));
    const username = el('input', 'field', { placeholder: 'e.g. @sari', maxlength: '40', autocomplete: 'off' });
    body.append(username);
    const sugg = el('div', 'flex flex-col gap-1', {});
    body.append(sugg);
    let debounce = null;
    username.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = username.value.trim().replace(/^@/, '');
      if (!q) { clear(sugg); return; }
      debounce = setTimeout(async () => {
        let users = [];
        try {
          if (window.usernode && typeof window.usernode.searchUsers === 'function') {
            const r = await window.usernode.searchUsers(q);
            users = (r && (r.users || r)) || [];
          } else {
            users = (await api('/shops/' + state.shop.id + '/user-search?q=' + encodeURIComponent(q))).users;
          }
        } catch (_) { users = []; }
        clear(sugg);
        for (const u of users.slice(0, 6)) {
          if (u.username === username.value.trim().replace(/^@/, '')) continue;
          sugg.append(el('button', 'flex min-h-11 items-center rounded-lg px-3 text-left text-body hover:bg-raised', {
            type: 'button', text: u.username,
            onclick: () => { username.value = u.username; clear(sugg); },
          }));
        }
      }, 200);
    });
    body.append(el('p', 'section-label mt-2', { text: 'Role' }));
    const roleSel = el('select', 'field', {});
    const nonOwner = roles.filter((r) => !r.is_owner);
    const least = nonOwner[nonOwner.length - 1];
    for (const r of nonOwner) roleSel.append(el('option', '', { value: r.id, text: r.name }));
    if (least) roleSel.value = least.id;
    body.append(roleSel);
    if (state.shop.role.is_owner) {
      body.append(el('p', 'text-small text-muted', { text: 'Only an Owner can give someone the Owner role. Change their role after adding them.' }));
    }
    const save = el('button', 'btn-primary w-full', { text: 'Add to the shop' });
    body.append(save);
    save.addEventListener('click', async () => {
      const name = username.value.trim().replace(/^@/, '');
      if (!name) { toast('Type a Homeroom username', true); return; }
      save.disabled = true;
      try {
        await api('/shops/' + state.shop.id + '/staff', { method: 'POST', body: { username: name, roleId: Number(roleSel.value) } });
        close(); toast(name + ' added'); done();
      } catch (err) {
        save.disabled = false;
        if (err.status === 503 && state.me.signedInWith === 'google') {
          toast('Username search needs Homeroom sign-in.', true);
        } else {
          toast(err.message || 'Could not add them', true);
        }
      }
    });
  });
}

function openRoleEditor(role, roles, done) {
  const isEdit = !!role;
  openSheet(isEdit ? 'Edit role' : 'Add role', (body, close) => {
    const name = el('input', 'field', { placeholder: 'e.g. Shift lead', maxlength: '30', value: isEdit ? role.name : '' });
    body.append(el('label', 'section-label', { text: 'Name' }), name);
    if (isEdit && role.is_owner) {
      body.append(el('p', 'text-small text-muted', { text: 'The Owner role always has every permission and can’t be deleted. You can rename it.' }));
    }
    const permsState = {};
    for (const p of PERMS_LIST) permsState[p] = isEdit ? (role.is_owner || role['can_' + p]) : false;
    if (!isEdit || !role.is_owner) {
      for (const p of PERMS_LIST) {
        body.append(switchRow(PERM_LABEL[p] + ' · ' + PERM_DESC[p], permsState[p], (v) => { permsState[p] = v; }));
      }
    }
    const save = el('button', 'btn-primary w-full', { text: isEdit ? 'Save changes' : 'Add role' });
    body.append(save);
    if (isEdit && !role.is_owner) {
      const del = el('button', 'btn-secondary w-full border-danger/40 text-danger', { text: 'Delete role', onclick: () => {
        confirmSheet('Delete ' + role.name + '?', 'A role nobody holds can be deleted.', 'Delete', async () => {
          try { await api('/shops/' + state.shop.id + '/roles/' + role.id, { method: 'DELETE' }); close(); toast('Role deleted'); done(); }
          catch (err) { toast(err.message || 'Could not delete it', true); }
        });
      } });
      body.append(del);
    }
    save.addEventListener('click', async () => {
      if (!name.value.trim()) { toast('Give the role a name', true); return; }
      save.disabled = true;
      try {
        if (isEdit) {
          await api('/shops/' + state.shop.id + '/roles/' + role.id, { method: 'PATCH', body: { name: name.value.trim(), perms: role.is_owner ? undefined : permsState } });
        } else {
          await api('/shops/' + state.shop.id + '/roles', { method: 'POST', body: { name: name.value.trim(), perms: permsState } });
        }
        close(); toast(isEdit ? 'Role saved' : 'Role added'); done();
      } catch (err) { save.disabled = false; toast(err.message || 'Could not save', true); }
    });
  });
}
const PERM_DESC = {
  register: 'take sales',
  products: 'add and edit products',
  finance: 'see money, void sales, log payouts',
  insights: 'see how the shop is doing',
  staff: 'manage staff, roles and shop details',
};

function openShopDetails(done) {
  openSheet('Shop details', (body, close) => {
    const canEdit = can('staff');
    const name = el('input', 'field', { value: state.shop.name, maxlength: '60', disabled: canEdit ? undefined : 'true' });
    body.append(el('label', 'section-label', { text: 'Name' }), name);
    const curSel = el('select', 'field', { disabled: canEdit ? undefined : 'true' });
    for (const [code, c] of Object.entries(M.CURRENCIES)) curSel.append(el('option', '', { value: code, text: code + ' · ' + c.name }));
    curSel.value = state.shop.currency;
    body.append(el('label', 'section-label', { text: 'Currency' }), curSel,
      el('p', 'text-small text-muted', { text: 'Changing the currency changes the symbol only. Prices are not converted.' }));
    const tz = el('input', 'field', { value: state.shop.time_zone, disabled: canEdit ? undefined : 'true' });
    body.append(el('label', 'section-label', { text: 'Time zone' }), tz);
    if (canEdit) {
      const save = el('button', 'btn-primary w-full', { text: 'Save changes' });
      body.append(save);
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          const res = await api('/shops/' + state.shop.id, { method: 'PATCH', body: { name: name.value.trim(), currency: curSel.value, timeZone: tz.value.trim() } });
          Object.assign(state.shop, res.shop);
          close(); toast('Shop details saved'); done();
        } catch (err) { save.disabled = false; toast(err.message || 'Could not save', true); }
      });
    }
  });
}

// Go.
boot();
