const $ = id => document.getElementById(id);
const C = 2 * Math.PI * 130, CA = 2 * Math.PI * 42;
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const el = {
  time: $('time'), sub: $('sub'), ring: $('ring'), mode: $('modeLabel'),
  start: $('startBtn'), reset: $('resetBtn'),
  focus: $('focusMin'), brk: $('breakMin'), long: $('longMin'), every: $('longEvery'), goal: $('goalHr'),
  aRing: $('aRing'), aPct: $('aPct'), aTime: $('aTime'),
  goalAdd: $('goalAdd'), goalBox: $('goalBox'), goalRemove: $('goalRemove')
};

const s = {
  mode: 'focus', running: false, paused: false,
  remaining: 0, total: 0, last: 0, timer: null, cycle: 0, waiting: false,
  achieved: store.get('achieved', 0) // ms
};

// The achievement counter is per day: it starts again from zero on a new day
const today = () => new Date().toLocaleDateString('en-CA');
let achievedDate = store.get('achievedDate', today());
let goalOn = store.get('goalOn', false); // no daily goal by default
let autoFocus = store.get('autoFocus', false); // start focus automatically after a break (off by default)
let autoBreak = store.get('autoBreak', true);  // start a break automatically after focus (on by default)
let fx = store.get('fx', true); // visual effects: gradients, animations and the theme wave (on by default)
document.body.classList.toggle('no-fx', !fx);
function dayCheck(){
  const t = today();
  if (t !== achievedDate) { achievedDate = t; s.achieved = 0; store.set('achieved', 0); }
  store.set('achievedDate', achievedDate);
}

/* ---------- Theme ---------- */
document.documentElement.dataset.theme = store.get('theme', 'dark');
const setTheme = t => { document.documentElement.dataset.theme = t; store.set('theme', t); };
let waving = false;

// Circular waves spread from the button across the whole page while the new theme is revealed.
// A frozen copy of the page (old theme) sits on top and a growing hole in it shows the new theme.
function themeWaves(next, x, y){
  waving = true;
  const old = document.documentElement.dataset.theme, b = document.body.getBoundingClientRect();
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script').forEach(n => n.remove());
  clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  const src = document.body.querySelectorAll('input,textarea');
  clone.querySelectorAll('input,textarea').forEach((n, i) => { n.value = src[i].value; n.checked = src[i].checked; });
  Object.assign(clone.style, { position: 'absolute', margin: '0', left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });
  clone.dataset.theme = old;

  const cover = document.createElement('div'); cover.className = 'wave-cover'; cover.append(clone);
  const box = document.createElement('div'); box.className = 'wave-rings';
  const color = next === 'dark' ? '#5eead4' : '#3b82f6';
  const rings = [[0, 1], [110, .6], [220, .35]].map(([off, k]) => {
    const i = document.createElement('i'); i.style.setProperty('--wc', color); box.append(i); return { i, off, k };
  });
  [cover, box].forEach(n => { n.style.setProperty('--x', x + 'px'); n.style.setProperty('--y', y + 'px'); });
  cover.style.setProperty('--r', '0px');
  document.body.append(cover, box);

  // keep the frozen copy's running animations in step with the real page (no visible jump)
  const oa = document.body.getAnimations({ subtree: true }), ca = clone.getAnimations({ subtree: true });
  ca.forEach((a, i) => { if (oa[i] && oa[i].animationName === a.animationName) a.currentTime = oa[i].currentTime; });

  setTheme(next);
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 100, dur = 1400, t0 = performance.now();
  const frame = now => {
    const p = Math.min(1, (now - t0) / dur), R = (p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) * end;
    cover.style.setProperty('--r', R + 'px');
    rings.forEach(({ i, off, k }) => {
      const d = Math.max(0, R - off) * 2;
      i.style.width = i.style.height = d + 'px';
      i.style.opacity = d > 20 ? k * (1 - p * p) : 0;
    });
    if (p < 1) requestAnimationFrame(frame); else { cover.remove(); box.remove(); waving = false; }
  };
  requestAnimationFrame(frame);
}

$('themeBtn').onclick = () => {
  if (waving) return;
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  if (!fx || matchMedia('(prefers-reduced-motion: reduce)').matches) return setTheme(next);
  const r = $('themeBtn').getBoundingClientRect();
  themeWaves(next, r.left + r.width / 2, r.top + r.height / 2);
};

/* ---------- Helpers ---------- */
const pad = n => String(n).padStart(2, '0');
const clampMin = (input, def, max) => Math.min(max, Math.max(1, parseInt(input.value) || def));
const every = () => Math.min(12, Math.max(2, parseInt(el.every.value) || 4));
const duration = mode => (mode === 'focus' ? clampMin(el.focus, 25, 180) : mode === 'long' ? clampMin(el.long, 15, 120) : clampMin(el.brk, 5, 60)) * 60000;

function subText(){
  if (!s.running) return 'جاهز للبدء';
  if (s.paused && s.waiting) return s.mode === 'focus' ? 'انتهت الراحة • اضغط بدء للتركيز' : 'انتهى التركيز • اضغط بدء للراحة';
  if (s.paused) return 'متوقف مؤقتاً';
  if (s.mode === 'focus') return `ركّز على مهمتك • الدورة ${s.cycle % every() + 1} من ${every()}`;
  return s.mode === 'long' ? 'استراحة طويلة، استرح جيداً' : 'خذ قسطاً من الراحة';
}

function saveTimer(){
  store.set('timer', { mode: s.mode, running: s.running, paused: s.paused, remaining: s.remaining, total: s.total, cycle: s.cycle, waiting: s.waiting });
}

function render(){
  const secs = Math.ceil(Math.max(0, s.remaining) / 1000);
  el.time.textContent = `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
  const elapsed = s.total ? 1 - s.remaining / s.total : 0;
  el.ring.style.strokeDasharray = C;
  el.ring.style.strokeDashoffset = C * (1 - Math.min(1, Math.max(0, elapsed)));
  document.title = s.running ? `${el.time.textContent} • ${s.mode === 'focus' ? 'تركيز' : 'راحة'}` : 'همّة | مساعدك في الدراسة';
  renderAchieve();
}

function renderAchieve(){
  dayCheck();
  const t = Math.floor(s.achieved / 1000);
  el.aTime.textContent = `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t % 3600 / 60))}:${pad(t % 60)}`;
  let p;
  if (goalOn) { // progress toward the chosen daily goal
    const goal = Math.max(0.5, parseFloat(el.goal.value) || 2) * 3600000;
    p = Math.min(1, s.achieved / goal);
    el.aPct.textContent = Math.round(p * 100) + '%';
  } else { // plain counter: the ring fills once per hour
    p = (s.achieved % 3600000) / 3600000;
    el.aPct.textContent = Math.floor(s.achieved % 3600000 / 60000) + 'د';
  }
  el.aRing.style.strokeDashoffset = CA * (1 - p);
}

function setMode(mode, keep){
  s.mode = mode;
  if (!keep) s.total = s.remaining = duration(mode);
  document.body.classList.toggle('break', mode !== 'focus');
  el.mode.textContent = mode === 'focus' ? 'تركيز' : mode === 'long' ? 'استراحة طويلة' : 'استراحة';
  el.sub.textContent = subText();
}

/* ---------- Soft chime (Web Audio) ---------- */
let ctx;
function audio(){
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
  return ctx;
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, audio, { once: true }));

function chime(){
  const a = audio(); if (!a) return;
  const out = a.createGain(); out.gain.value = .55;
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
  out.connect(lp); lp.connect(a.destination);
  const notes = [1046.5, 1318.5, 1568, 2093]; // C6 E6 G6 C7, a gentle rising arpeggio
  [0, 2.4].forEach((pass, p) => {
    notes.forEach((f, i) => {
      const t0 = a.currentTime + .05 + pass + i * .2, peak = (p ? .16 : .24) * (1 - i * .08);
      [[f, 1], [f * 2, .12]].forEach(([fr, v]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'sine'; o.frequency.value = fr;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(peak * v, t0 + .03);
        g.gain.exponentialRampToValueAtTime(.0008, t0 + 2);
        o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 2.1);
      });
    });
  });
}

/* ---------- Ambient sounds (your own audio files, endless loop) ---------- */
// Put the path of each audio file here, e.g. 'sounds/rain.mp3'
const SOUND_FILES = {
  rain: 'audio/1.mp3',
  waves: 'audio/2.mp3'
};

const live = {};
function setSound(name, on){
  const b = document.querySelector(`.snd[data-sound="${name}"]`);
  if (on && !live[name]){
    if (!SOUND_FILES[name]) return; // no file set yet
    const au = new Audio(SOUND_FILES[name]); au.loop = true;
    live[name] = au;
    au.play().catch(() => { delete live[name]; b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
  } else if (!on && live[name]){
    live[name].pause(); delete live[name];
  }
  b.classList.toggle('on', !!live[name]); b.setAttribute('aria-pressed', String(!!live[name]));
}
document.querySelectorAll('.snd').forEach(b => b.onclick = () => setSound(b.dataset.sound, !live[b.dataset.sound]));

/* ---------- Timer ---------- */
function tick(){
  if (!s.running || s.paused) return;
  const now = Date.now(), d = now - s.last; s.last = now;
  s.remaining -= d;
  dayCheck();
  if (s.mode === 'focus') { s.achieved += Math.min(d, 65000); store.set('achieved', s.achieved); }
  if (s.remaining <= 0){
    chime();
    if (s.mode === 'focus') { s.cycle++; setMode(s.cycle % every() === 0 ? 'long' : 'break'); }
    else setMode('focus');
    if (!(s.mode === 'focus' ? autoFocus : autoBreak)) { s.paused = true; s.waiting = true; ui(); } // wait for the user
  }
  render(); saveTimer();
}

function run(){
  clearInterval(s.timer);
  s.last = Date.now();
  s.timer = setInterval(tick, 200);
}

function start(){
  audio();
  s.running = true; s.paused = false; s.waiting = false; s.cycle = 0;
  setMode('focus');
  run(); ui(); render(); saveTimer();
}

function togglePause(){
  s.paused = !s.paused;
  if (!s.paused) { s.last = Date.now(); s.waiting = false; } // paused time is never counted
  ui(); render(); saveTimer();
}

function fullReset(){
  clearInterval(s.timer);
  s.running = false; s.paused = false; s.waiting = false; s.cycle = 0;
  setMode('focus');
  ui(); render(); saveTimer();
}

function ui(){
  const b = el.start;
  if (!s.running) { b.textContent = 'بدء'; b.className = 'main-btn go'; }
  else if (s.paused) { b.textContent = s.waiting ? 'بدء' : 'استئناف'; b.className = 'main-btn go'; }
  else { b.textContent = 'إيقاف مؤقت'; b.className = 'main-btn stop'; }
  el.sub.textContent = subText();
}

el.start.onclick = () => s.running ? togglePause() : start();
el.reset.onclick = fullReset;

/* ---------- Settings ---------- */
const settingInputs = [[el.focus, 'focusMin', 25], [el.brk, 'breakMin', 5], [el.long, 'longMin', 15], [el.every, 'longEvery', 4], [el.goal, 'goalHr', 2]];
settingInputs.forEach(([inp, key, def]) => inp.value = store.get(key, def));

[el.focus, el.brk, el.long, el.every].forEach(i => {
  i.addEventListener('input', () => store.set(settingInputs.find(x => x[0] === i)[1], i.value));
  i.addEventListener('change', () => {
    const m = i === el.focus ? 'focus' : i === el.brk ? 'break' : i === el.long ? 'long' : null;
    if (!s.running) setMode('focus');
    else if (m && m === s.mode) { // changing the active period's length applies now
      const d = duration(s.mode); s.remaining = Math.max(0, s.remaining + d - s.total); s.total = d;
    }
    render(); saveTimer();
  });
});
el.goal.addEventListener('input', () => { store.set('goalHr', el.goal.value); renderAchieve(); });
function applyGoalUI(){ el.goalAdd.hidden = goalOn; el.goalBox.hidden = !goalOn; renderAchieve(); }
el.goalAdd.onclick = () => { goalOn = true; store.set('goalOn', true); applyGoalUI(); };
el.goalRemove.onclick = () => { goalOn = false; store.set('goalOn', false); applyGoalUI(); };
$('aReset').onclick = () => { s.achieved = 0; store.set('achieved', 0); renderAchieve(); };

/* ---------- Settings drawer ---------- */
const drawer = $('drawer'), overlay = $('overlay');
function toggleDrawer(open){
  drawer.classList.toggle('open', open); overlay.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  (open ? $('closeSettings') : $('gearBtn')).focus();
}
$('gearBtn').onclick = () => toggleDrawer(true);
$('closeSettings').onclick = overlay.onclick = () => toggleDrawer(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) toggleDrawer(false); });
const cFocus = $('autoFocus'), cBreak = $('autoBreak');
cFocus.checked = autoFocus; cBreak.checked = autoBreak;
cFocus.onchange = () => { autoFocus = cFocus.checked; store.set('autoFocus', autoFocus); };
cBreak.onchange = () => { autoBreak = cBreak.checked; store.set('autoBreak', autoBreak); };
const cFx = $('fx');
cFx.checked = fx;
cFx.onchange = () => { fx = cFx.checked; store.set('fx', fx); document.body.classList.toggle('no-fx', !fx); };

/* ---------- Todo ---------- */
let todos = store.get('todos', []);
function renderTodos(){
  const ul = $('todoList'); ul.innerHTML = '';
  $('empty').style.display = todos.length ? 'none' : 'block';
  todos.forEach((t, i) => {
    const li = document.createElement('li'); if (t.done) li.className = 'done';
    const c = document.createElement('input'); c.type = 'checkbox'; c.className = 'chk'; c.checked = t.done;
    c.onchange = () => { t.done = c.checked; store.set('todos', todos); renderTodos(); };
    const sp = document.createElement('span'); sp.textContent = t.text;
    const d = document.createElement('button'); d.className = 'del'; d.textContent = '×'; d.setAttribute('aria-label', 'حذف');
    d.onclick = () => { todos.splice(i, 1); store.set('todos', todos); renderTodos(); };
    li.append(c, sp, d); ul.append(li);
  });
}
function addTodo(){
  const v = $('todoInput').value.trim(); if (!v) return;
  todos.unshift({ text: v, done: false }); store.set('todos', todos);
  $('todoInput').value = ''; renderTodos();
}
$('addBtn').onclick = addTodo;
$('todoInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });

/* ---------- Notes ---------- */
const notes = $('notes');
notes.value = store.get('notes', '');
notes.addEventListener('input', () => store.set('notes', notes.value));

/* ---------- Restore saved state ---------- */
const saved = store.get('timer', null);
if (saved && ['focus', 'break', 'long'].includes(saved.mode) && saved.total > 0 && saved.remaining >= 0 && saved.remaining <= saved.total) {
  s.mode = saved.mode; s.total = saved.total; s.remaining = saved.remaining;
  s.cycle = saved.cycle || 0; s.running = !!saved.running; s.paused = s.running; s.waiting = s.running && !!saved.waiting; // reopening always comes back paused, ready to resume
  setMode(s.mode, true);
  if (s.running) run(); // continues from the exact point it was left at
} else {
  setMode('focus');
}
applyGoalUI(); ui(); render(); renderTodos();

// save the exact position when the tab is closed or hidden
const flush = () => { tick(); saveTimer(); };
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else renderAchieve(); });

/* ---------- Entrance animation: the word grows in, then shrinks into the header while everything else appears ---------- */
(async function intro(){
  const body = document.body, screen = $('intro');
  const finish = () => { body.classList.remove('intro', 'hold-brand'); screen.remove(); };
  if (!fx || matchMedia('(prefers-reduced-motion: reduce)').matches || !screen.animate) return finish();
  try {
    await Promise.race([document.fonts ? document.fonts.ready : 0, new Promise(r => setTimeout(r, 1500))]);
    const brand = document.querySelector('.brand'), cs = getComputedStyle(brand), tgt = brand.getBoundingClientRect();
    const word = document.createElement('div'); word.className = 'intro-word'; word.textContent = brand.textContent;
    Object.assign(word.style, { fontSize: cs.fontSize, fontFamily: cs.fontFamily, visibility: 'hidden' });
    screen.append(word);
    const w0 = word.getBoundingClientRect().width;
    word.style.fontSize = parseFloat(cs.fontSize) * Math.min(innerWidth * .55, 560) / w0 + 'px'; // big, so it stays sharp when scaled down
    const r = word.getBoundingClientRect();
    word.style.left = (innerWidth - r.width) / 2 + 'px'; word.style.top = (innerHeight - r.height) / 2 + 'px';
    word.style.visibility = '';
    const k = tgt.width / r.width, dx = tgt.left + tgt.width / 2 - innerWidth / 2, dy = tgt.top + tgt.height / 2 - innerHeight / 2;
    const T = 2800, hold = .55, still = { opacity: 1, transform: 'translate(0px,0px) scale(1)', filter: 'blur(0px)', textShadow: '0 0 60px #5eead4' };
    const a = word.animate([
      { opacity: 0, transform: 'translate(0px,0px) scale(.85)', filter: 'blur(16px)', textShadow: '0 0 0 #5eead4', offset: 0, easing: 'cubic-bezier(.2,.8,.2,1)' },
      { ...still, offset: .3 },
      { ...still, offset: hold, easing: 'cubic-bezier(.7,0,.2,1)' },
      { opacity: 1, transform: `translate(${dx}px,${dy}px) scale(${k})`, filter: 'blur(0px)', textShadow: `0 0 ${22 / k}px #5eead4`, offset: 1 }
    ], { duration: T, fill: 'forwards' });
    screen.firstElementChild.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, delay: T * hold + 200, fill: 'forwards' });
    setTimeout(() => body.classList.remove('intro'), T * hold + 350); // the rest of the page appears as the word travels
    await a.finished;
  } catch {}
  finish();
})();