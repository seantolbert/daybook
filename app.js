// Daybook — app shell. Vanilla ES module, no build step.
import {
  esc, safeUrl, safeColor, renderMarkdown, splitSections,
  isoDateInTz, minutesInTz, startOfDayInTz, addDays, weekdayOf, mondayOf, daysBetween,
  fmtDate, monthLabel, dayShort, fmtClock, fmtMinutes, fmtInstant, fmtBytes, timeAgo, greeting, normTag, uuid,
} from './lib.js';

// ---------------------------------------------------------------------------
// Config + client
// ---------------------------------------------------------------------------
const CONFIG = JSON.parse(document.getElementById('daybook-config').textContent);
const TZ = CONFIG.timeZone || 'America/New_York';
const OWNER = CONFIG.ownerName || 'there';
const CACHE_KEY = 'daybook:cache:v1';
const QUEUE_KEY = 'daybook:queue';
const BUSINESSES = ['Berner Studio', 'Tolbert Sheet Fab', 'DuctLink', 'Voice Agent', 'Client Work', 'Personal'];
const COLORS = ['#8B7CF6', '#5B4DBE', '#E58BB0', '#E5615B', '#E9A23B', '#9CBF3B', '#3FAE8C', '#3B8FD9', '#1E1E1E'];

const configured = !/YOUR-PROJECT|YOUR-ANON/.test(CONFIG.supabaseUrl + CONFIG.supabaseAnonKey);
const sb = configured && window.supabase
  ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  user: null,
  projects: [],
  tasks: [],
  notes: [],
  files: [],
  briefing: null,
  events: [],
  threads: [],
  googleConnected: null,
  googleEmail: null,
  loadedAt: null,
  ui: {
    taskFilter: 'todo',
    calFilter: 'all',
    selectedDate: null,
    library: 'projects',
    projectTab: 'tasks',
    noteQuery: '',
    briefingOpen: false,
    online: navigator.onLine,
  },
};

const today = () => isoDateInTz(new Date(), TZ);
const nowMinutes = () => minutesInTz(new Date(), TZ);

// ---------------------------------------------------------------------------
// Icons (inline SVG, stroke-based)
// ---------------------------------------------------------------------------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4Z"/><path d="M10 21h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  left: '<path d="M15 5 8 12l7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  note: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  pin: '<path d="M9 4h6l-1 5 4 4H6l4-4Z"/><path d="M12 13v8"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  google: '<path d="M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5Z"/><path d="M12 21c2.4 0 4.5-.8 5.9-2.2L15 16.5c-.8.5-1.8.9-3 .9a5.2 5.2 0 0 1-4.9-3.6H4.1v2.3A9 9 0 0 0 12 21Z"/><path d="M7.1 13.8a5.4 5.4 0 0 1 0-3.5V8H4.1a9 9 0 0 0 0 8.1Z"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4.1 8l3 2.3A5.2 5.2 0 0 1 12 6.6Z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6Z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  wifiOff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14 10.3A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.5-3M10 5.2A15 15 0 0 1 22 9.5"/><circle cx="12" cy="20" r=".8"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const viewEl = $('#view');
const navEl = $('#nav');

function toast(message, { error = false, action = null, onAction = null, ms = 3200 } = {}) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = `toast${error ? ' err' : ''}`;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 180); };
  if (action) el.querySelector('button').addEventListener('click', () => { close(); onAction?.(); });
  root.appendChild(el);
  if (ms) setTimeout(close, ms);
  return close;
}

// ---------------------------------------------------------------------------
// Sheets (bottom sheet on mobile, centered modal on desktop)
// ---------------------------------------------------------------------------
let sheetStack = [];

function openSheet(html, { onMount, onClose, label = 'Dialog' } = {}) {
  closeSheet(true);
  const root = $('#sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <div class="sheet-grip" aria-hidden="true"></div>
      ${html}
    </section>`;
  const sheet = $('.sheet', root);
  sheetStack = [{ onClose }];
  requestAnimationFrame(() => {
    $('.sheet-backdrop', root).classList.add('in');
    sheet.classList.add('in');
  });
  onMount?.(sheet);
  const first = sheet.querySelector('[autofocus]');
  if (first && matchMedia('(min-width: 640px)').matches) setTimeout(() => first.focus(), 60);
  document.body.style.overflow = 'hidden';
  return sheet;
}

function closeSheet(immediate = false) {
  const root = $('#sheet-root');
  const sheet = $('.sheet', root);
  if (!sheet) return;
  const entry = sheetStack.pop();
  document.body.style.overflow = '';
  if (immediate) { root.innerHTML = ''; entry?.onClose?.(); return; }
  sheet.classList.remove('in');
  $('.sheet-backdrop', root)?.classList.remove('in');
  setTimeout(() => { if ($('.sheet', root) === sheet) root.innerHTML = ''; entry?.onClose?.(); }, 200);
}

// Swipe-down to dismiss on touch
(() => {
  let startY = null; let sheet = null;
  document.addEventListener('touchstart', (e) => {
    const grip = e.target.closest('.sheet-grip, .sheet-head');
    sheet = grip?.closest('.sheet');
    startY = sheet && sheet.scrollTop <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (startY === null || !sheet) return;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transition = 'none';
    sheet.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (startY === null || !sheet) return;
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 110) closeSheet();
    startY = null; sheet = null;
  });
})();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];

function parseRoute() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home';
  const [view, id] = raw.split('/');
  const known = ['home', 'projects', 'notes', 'files', 'calendar', 'profile', 'task', 'note', 'project', 'file'];
  return known.includes(view) ? { view, id: id || null } : { view: 'home', id: null };
}

function navTabFor(view) {
  if (['projects', 'notes', 'files', 'project', 'note', 'file'].includes(view)) return 'projects';
  if (view === 'task') return null;
  return view;
}

function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

function renderNav(route) {
  const active = navTabFor(route.view);
  navEl.innerHTML = TABS.map((t) => `
    <a href="#${t.id}" class="${active === t.id ? 'active' : ''}" aria-label="${t.label}" ${active === t.id ? 'aria-current="page"' : ''}>
      ${icon(t.icon)}<span>${t.label}</span>
    </a>`).join('');
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const VIEWS = {};
let lastRouteKey = '';

function render() {
  if (!state.user) {
    navEl.hidden = true;
    viewEl.className = 'view no-nav';
    viewEl.innerHTML = configured ? viewLogin() : viewNotConfigured();
    return;
  }
  const route = parseRoute();
  const key = `${route.view}/${route.id || ''}`;
  const scrollY = key === lastRouteKey ? window.scrollY : 0;
  navEl.hidden = false;
  renderNav(route);
  const fn = VIEWS[route.view] || VIEWS.home;
  viewEl.className = 'view';
  if (key !== lastRouteKey) {
    // retrigger the entry animation only on navigation
    viewEl.style.animation = 'none'; void viewEl.offsetHeight; viewEl.style.animation = '';
  }
  viewEl.innerHTML = offlineBanner() + fn(route);
  if (key !== lastRouteKey) window.scrollTo(0, 0); else if (Math.abs(window.scrollY - scrollY) > 2) window.scrollTo(0, scrollY);
  lastRouteKey = key;
}

function offlineBanner() {
  if (state.ui.online) return '';
  const q = readQueue().length;
  return `<div class="offline-pill">${icon('wifiOff', 'xs')} Offline${q ? ` · ${q} change${q > 1 ? 's' : ''} waiting` : ' · showing saved data'}</div>`;
}

const emptyLine = (text) => `<div class="empty">${esc(text)}</div>`;

function header({ title, back = null, actions = '' }) {
  const left = back
    ? `<div class="back-title"><button class="icon-btn sm" data-action="back" data-fallback="${esc(back)}" aria-label="Back">${icon('left')}</button><h1 class="page-title">${esc(title)}</h1></div>`
    : `<h1 class="page-title">${esc(title)}</h1>`;
  return `<header class="header">${left}<div class="header-actions">${actions}</div></header>`;
}

// ---------------------------------------------------------------------------
// Login / unconfigured
// ---------------------------------------------------------------------------
function viewNotConfigured() {
  return `<section class="login">
    <div class="brand"><div class="brand-mark">${icon('sun')}</div><b>Daybook</b></div>
    <h1 class="display">Almost there.</h1>
    <p class="lede">Paste your Supabase URL and anon key into the config block at the top of <code>index.html</code> (README, step 2.7), then reload.</p>
  </section>`;
}

function viewLogin() {
  return `<section class="login">
    <div class="brand"><div class="brand-mark">${icon('sun')}</div><b>Daybook</b></div>
    <h1 class="display">Welcome back.</h1>
    <p class="lede">Sign in to see your day.</p>
    <form class="card" id="login-form" novalidate>
      <div id="login-msg"></div>
      <div class="field"><label for="login-email">Email</label>
        <input class="input" id="login-email" name="email" type="email" autocomplete="username" required inputmode="email"></div>
      <div class="field"><label for="login-password">Password</label>
        <input class="input" id="login-password" name="password" type="password" autocomplete="current-password"></div>
      <button class="btn dark big block" type="submit">Sign in</button>
      <button class="btn block" type="button" data-action="magic-link" style="margin-top:10px">Email me a magic link instead</button>
    </form>
  </section>`;
}

function loginMsg(text, ok = false) {
  const el = $('#login-msg');
  if (el) el.innerHTML = text ? `<p class="form-msg ${ok ? 'ok' : 'err'}">${esc(text)}</p>` : '';
}

async function handleLogin(form) {
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) return loginMsg('Enter your email and password.');
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Sign in';
  if (error) loginMsg(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
}

async function handleMagicLink() {
  const email = $('#login-email')?.value.trim();
  if (!email) return loginMsg('Enter your email first.');
  const { error } = await sb.auth.signInWithOtp({
    email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + '/' },
  });
  if (error) loginMsg(error.message); else loginMsg('Check your email for a sign-in link.', true);
}

// ---------------------------------------------------------------------------
// Placeholder views (filled in by later milestones)
// ---------------------------------------------------------------------------
VIEWS.home = () => `
  <header class="header">
    <div class="header-left"><div class="avatar">${esc(OWNER[0] || 'D')}</div>
      <div class="hello"><div class="hello-sub">${esc(greeting(nowMinutes()))}</div><div class="hello-name">${esc(OWNER)}</div></div></div>
    <div class="header-actions">
      <button class="icon-btn" data-action="open-add" aria-label="Add">${icon('plus')}</button>
      <button class="icon-btn dark" aria-label="Briefing">${icon('sparkle')}</button>
    </div>
  </header>
  <h1 class="display">Let’s make today productive</h1>
  <div class="card empty">Nothing here yet.</div>`;
VIEWS.projects = () => header({ title: 'Projects' }) + '<div class="card empty">No projects yet.</div>';
VIEWS.calendar = () => header({ title: 'Calendar' }) + '<div class="card empty">Your calendar will appear here.</div>';
VIEWS.profile = () => header({ title: 'Profile' }) + `<div class="card">
  <div class="settings-row"><span class="k">Account</span><span class="v">${esc(state.user?.email)}</span></div>
  <button class="btn block" data-action="sign-out" style="margin-top:12px">${icon('logout', 'sm')} Sign out</button></div>`;

// ---------------------------------------------------------------------------
// Actions (event delegation)
// ---------------------------------------------------------------------------
const ACTIONS = {
  'close-sheet': () => closeSheet(),
  back: (el) => { if (navDepth > 0) history.back(); else go(el.dataset.fallback || '#home'); },
  'magic-link': () => handleMagicLink(),
  'sign-out': async () => { await sb.auth.signOut(); },
  'open-add': () => toast('Coming soon'),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (form.id === 'login-form') { e.preventDefault(); handleLogin(form); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('.sheet')) closeSheet();
});

let navDepth = 0;
window.addEventListener('hashchange', () => { navDepth += 1; closeSheet(true); render(); });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

// Local preview without Supabase: http://localhost:PORT/?demo (never active on a real host).
const DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('demo');

async function boot() {
  if (DEMO) { state.user = { id: 'demo', email: 'demo@localhost' }; render(); return; }
  if (!sb) { render(); return; }
  const { data: { session } } = await sb.auth.getSession();
  state.user = session?.user ?? null;
  render();
  sb.auth.onAuthStateChange((event, sess) => {
    const prev = state.user?.id;
    state.user = sess?.user ?? null;
    if (event === 'SIGNED_OUT' || (state.user?.id !== prev)) render();
  });
}

window.addEventListener('online', () => { state.ui.online = true; render(); });
window.addEventListener('offline', () => { state.ui.online = false; render(); });

boot();
