"use strict";

/* ===================== data ===================== */

// Seed used only if ../data/jobs.json can't be loaded (e.g. opened without a
// static server, or the scraper hasn't run yet). The real list is produced
// daily by scraper/scrape-jobs.js — see .github/workflows/scrape-jobs.yml.
const FALLBACK_JOBS = [
  ['Stripe', 'Software Engineer Intern', 'San Francisco, CA', 'SimplifyJobs/Summer2027-Internships', 'Summer 2027'],
  ['Figma', 'Product Engineer, New Grad', 'New York, NY', 'SimplifyJobs/New-Grad-Positions', 'New Grad 2027'],
  ['Ramp', 'Software Engineer Intern', 'New York, NY', 'vanshb03/Summer2027-Internships', 'Summer 2027'],
  ['Notion', 'Software Engineer Intern, AI', 'San Francisco, CA', 'speedyapply/2027-SWE-College-Jobs', 'Summer 2027'],
].map(([company, role, location, repo, term], i) => ({
  id: 'j' + i, company, role, location, posted: '—', repo, term, hasListing: true, url: '',
}));

let JOBS = [];
let REPO_COUNT = 4;
let jobsGeneratedAt = null;

const PEOPLE = [
  ['Priya Shah', 'Senior Software Engineer', '2nd', 'UC Berkeley alum · CS ’21'],
  ['Marcus Lee', 'Engineering Manager', '2nd', '3 mutual connections'],
  ['Hannah Okafor', 'Software Engineer II', 'Alumni', 'Same school · ACM club'],
  ['Diego Alvarez', 'Technical Recruiter', '3rd', 'Recruits for this team'],
  ['Sofia Chen', 'Staff Engineer', '2nd', 'Former intern at your last company'],
];

const SPEEDS = { Fast: 350, Normal: 700, Slow: 1200 };

const slug = (co) => co.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
const initials = (n) => n.split(' ').map((s) => s[0]).join('').slice(0, 2);
const logLines = (co) => [
  'Launching browser session',
  'Signed in to LinkedIn',
  'Searching "' + co + '" employees · 1st, 2nd, alumni',
  'Found 41 profiles — ranking by relevance to role',
  'Checking alumni + mutual overlap with your profile',
  'Drafting referral notes from your resume',
  'Searching web for ' + co + ' recruiting / HR emails',
  'Verified email pattern first.last@' + slug(co),
  'Drafting email to hiring team',
  'Done',
];

const DEFAULT_PROFILE = {
  name: 'Alex Rivera',
  school: "UC Berkeley '27, Computer Science",
  highlight: 'built a real-time collaborative code editor used by 2,000+ students',
  resume: [
    'ALEX RIVERA',
    'UC Berkeley — B.S. Computer Science, May 2027',
    '',
    'EXPERIENCE',
    'Software Engineering Intern, Brex (Summer 2026)',
    '- Shipped card-controls API used by 400+ customers',
    '- Cut p95 latency of spend-limit checks by 38%',
    '',
    'PROJECTS',
    'PairPad — real-time collaborative editor (CRDTs, WebSockets), 2k+ users',
    '',
    'SKILLS',
    'TypeScript, Go, Python, Postgres, React',
  ].join('\n'),
};

/* ===================== state ===================== */

const state = {
  screen: 'jobs',
  jobId: null,
  prevScreen: 'jobs',
  query: '',
  companyFilters: [],
  locationFilters: [],
  termFilters: [],
  companyJobs: [],
  data: {},
  profile: { ...DEFAULT_PROFILE },
  busy: {},
  collectSpeed: 'Normal',
  showRepo: true,
};

const timers = {};
const aiRefs = {};

const allJobs = () => JOBS.concat(state.companyJobs);
const findJob = (id) => allJobs().find((j) => j.id === id);

/* ===================== drafting ===================== */

function draftNote(contact, job, p) {
  const first = contact.name.split(' ')[0];
  const ask = job.hasListing
    ? "I'm applying for the " + job.role + ' role at ' + job.company
    : "I'm hoping to join " + job.company + ' as a software engineer';
  return 'Hi ' + first + ", I'm " + p.name + ' (' + p.school.split(',')[0] + '). ' +
    ask + " and would be grateful for a referral if you're comfortable. I recently " +
    p.highlight + '. Thanks either way!';
}

function draftEmail(job, p) {
  const role = job.hasListing ? 'the ' + job.role + ' position' : 'software engineering opportunities';
  return "Hi " + job.company + " Recruiting team,\n\nI'm " + p.name + ', ' + p.school +
    ". I'm reaching out about " + role + ' and wanted to introduce myself directly.' +
    "\n\nLast summer at Brex I shipped a card-controls API used by 400+ customers and cut p95 latency on spend-limit checks by 38%. On the side, I " +
    p.highlight + ".\n\nI'd love to bring that same ownership to " + job.company +
    '. My resume is attached — happy to share more or chat whenever works.' +
    '\n\nBest,\n' + p.name;
}

function buildDone(job, p) {
  const contacts = PEOPLE.map(([name, title, degree, reason], i) => {
    const c = {
      id: 'c' + i, name,
      title: title + ' at ' + job.company,
      degree, reason, status: 'Not sent',
    };
    c.text = draftNote(c, job, p);
    return c;
  });
  return {
    status: 'done',
    contacts,
    email: {
      to: 'diego.alvarez@' + slug(job.company),
      toName: 'Diego Alvarez · Technical Recruiter',
      confidence: 'pattern verified · 86%',
      subject: job.hasListing
        ? job.role + ' — ' + p.name
        : 'Software Engineering at ' + job.company + ' — ' + p.name,
      text: draftEmail(job, p),
    },
  };
}

/* ===================== element helper ===================== */

function h(tag, props, kids) {
  const n = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'value') n.value = v;
      else if (k === 'rows') n.rows = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
  }
  if (kids != null) {
    const list = Array.isArray(kids) ? kids : [kids];
    for (const kid of list) {
      if (kid == null || kid === false) continue;
      n.append(typeof kid === 'string' || typeof kid === 'number' ? String(kid) : kid);
    }
  }
  return n;
}
const frag = (kids) => { const f = document.createDocumentFragment(); for (const k of kids) if (k) f.append(k); return f; };
const view = () => document.getElementById('view');

/* ===================== navigation ===================== */

function go(screen) {
  state.screen = screen;
  render();
  window.scrollTo(0, 0);
}

function openJob(job, from) {
  state.screen = 'job';
  state.jobId = job.id;
  state.prevScreen = from || 'jobs';
  render();
  window.scrollTo(0, 0);
}

function tabActive(key) {
  if (state.screen === key) return true;
  return state.screen === 'job' && state.prevScreen === key;
}

function renderTabs() {
  const tabs = document.getElementById('tabs');
  tabs.replaceChildren(frag([
    ['Jobs', 'jobs'], ['Company search', 'company'], ['Profile', 'profile'],
  ].map(([label, key]) => h('button', {
    class: 'tab' + (tabActive(key) ? ' on' : ''),
    text: label,
    'aria-current': tabActive(key) ? 'page' : null,
    onclick: () => go(key),
  }))));
}

function renderHeaderName() {
  document.getElementById('hdr-name').textContent = 'resume loaded · ' + state.profile.name;
}

/* ===================== status helpers ===================== */

function statusOf(id) {
  const d = state.data[id];
  if (!d) return { text: 'Not collected', cls: 'pill pill-neutral' };
  if (d.status === 'collecting') return { text: 'Collecting…', cls: 'pill pill-warn' };
  const sent = d.contacts.filter((c) => c.status !== 'Not sent').length;
  return {
    text: d.contacts.length + ' people' + (sent ? ' · ' + sent + ' sent' : ''),
    cls: 'pill pill-accent',
  };
}

const STATUS_CYCLE = { 'Not sent': 'Sent', 'Sent': 'Replied', 'Replied': 'Not sent' };
const STATUS_CLASS = { 'Not sent': 'st st-notsent', 'Sent': 'st st-sent', 'Replied': 'st st-replied' };

/* ===================== collection run ===================== */

function startCollect(job) {
  const lines = logLines(job.company);
  const done = buildDone(job, state.profile);
  clearInterval(timers[job.id]);
  state.data[job.id] = { status: 'collecting', step: 0, contacts: [] };
  refresh(job.id);

  const tick = SPEEDS[state.collectSpeed] || SPEEDS.Normal;
  let step = 0;
  timers[job.id] = setInterval(() => {
    step++;
    const d = state.data[job.id];
    if (!d || d.status !== 'collecting') { clearInterval(timers[job.id]); return; }
    if (step >= lines.length) {
      clearInterval(timers[job.id]);
      d.step = step;
      refresh(job.id);
      setTimeout(() => { state.data[job.id] = done; refresh(job.id); }, 500);
      return;
    }
    d.step = step;
    d.contacts = step < 3 ? [] : done.contacts.slice(0, Math.min(5, (step - 2) * 2));
    refresh(job.id);
  }, tick);
}

/** Re-render whatever is on screen after data[jobId] changed. */
function refresh(jobId) {
  if (state.screen === 'job' && state.jobId === jobId) {
    const d = state.data[jobId];
    if (d && d.status === 'collecting' && document.getElementById('term')) updateCollecting(jobId);
    else render();
  } else if (state.screen === 'jobs') {
    renderTable();
  } else if (state.screen === 'company') {
    renderRecents();
  }
}

/* ===================== AI rewrite ===================== */

let samplePromise = null;
function getSample() {
  if (!samplePromise) {
    const use = window.claude && window.claude.use;
    samplePromise = (use ? window.claude.use('sample') : Promise.resolve(null))
      .catch(() => null);
  }
  return samplePromise;
}

function localRewrite(text, instruction) {
  const i = instruction.toLowerCase();
  let t = text;
  if (i.includes('short')) {
    const s = t.split(/(?<=[.!?])\s+/);
    t = s.slice(0, 2).join(' ') + ' Thanks!';
  }
  if (i.includes('formal')) {
    t = t.replace(/^Hi /, 'Hello ')
         .replace('Thanks either way!', 'Thank you for your time and consideration.')
         .replace(/I'm /g, 'I am ');
  }
  if (i.includes('warm') || i.includes('friend')) {
    t = t.replace(/^(Hi|Hello) ([^,\n]+),/, "$1 $2, hope your week's going well!");
  }
  if (i.includes('project')) {
    t = t.replace(/Thanks/, 'I can share a quick demo of PairPad if helpful. Thanks');
  }
  return t;
}

function setAiBusy(key, busy) {
  state.busy[key] = busy;
  const ref = aiRefs[key];
  if (!ref) return;
  ref.btn.textContent = busy ? 'Rewriting…' : 'Rewrite';
  ref.btn.disabled = busy;
}

async function rewrite(key, getText, instruction, apply) {
  const ins = (instruction || '').trim();
  if (!ins || state.busy[key]) return;
  setAiBusy(key, true);
  const text = getText();
  const p = state.profile;
  const limit = key.endsWith(':email') ? '' : 'Keep it under 300 characters (LinkedIn note limit). ';
  let out = null;
  try {
    const sample = await getSample();
    if (sample) {
      const res = await sample(
        'Rewrite this job-referral outreach message. Instruction: "' + ins + '". ' +
        "Keep it truthful to the sender's background. " + limit +
        'Return ONLY the rewritten message, no preamble.\n\n' +
        'Sender: ' + p.name + ', ' + p.school + '. Highlight: ' + p.highlight + '.\n' +
        'Resume:\n' + p.resume + '\n\nMessage:\n' + text,
        { modelTier: 'quick', cache: false }
      );
      out = (res && res.text) || null;
    }
  } catch (e) {
    out = (e && e.text) || null;
  }
  if (!out) {
    await new Promise((r) => setTimeout(r, 600));
    out = localRewrite(text, ins);
  }
  apply(out.trim());
  const ref = aiRefs[key];
  if (ref && ref.input) ref.input.value = '';
  setAiBusy(key, false);
}

/** Preset chips + prompt row + Rewrite button, shared by notes and the email. */
function aiToolbar(key, presets, getText, apply, extra) {
  const input = h('input', {
    class: 'inp-sm', id: 'ai-' + key, type: 'text',
    placeholder: key.endsWith(':email') ? 'Ask AI to change this email…' : 'Ask AI to change this message…',
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); rewrite(key, getText, input.value, apply); } },
  });
  const btn = h('button', {
    class: 'btn btn-run', type: 'button',
    text: state.busy[key] ? 'Rewriting…' : 'Rewrite',
    onclick: () => rewrite(key, getText, input.value, apply),
  });
  if (state.busy[key]) btn.disabled = true;
  aiRefs[key] = { btn, input };

  return h('div', { class: 'toolbar' }, [
    h('div', { class: 'presets' }, presets.map((label) =>
      h('button', { class: 'chip-preset', type: 'button', text: label,
        onclick: () => rewrite(key, getText, label, apply) }))),
    h('div', { class: 'askrow' }, [input, btn]),
    extra || null,
  ]);
}

function copyToClipboard(text, btn, label) {
  try { navigator.clipboard.writeText(text); } catch (e) { /* label still confirms */ }
  btn.textContent = 'Copied ✓';
  setTimeout(() => { btn.textContent = label; }, 1500);
}

/* ===================== screen: jobs ===================== */

/** A pill button that opens a checklist panel — multi-select stand-in for a native <select>. */
function multiSelect({ id, allLabel, ariaLabel, options, selected, onChange }) {
  const btn = h('button', {
    class: 'sel msel-btn', type: 'button', id, 'aria-haspopup': 'listbox',
    'aria-label': ariaLabel,
  });
  const panel = h('div', { class: 'msel-panel', role: 'listbox', 'aria-multiselectable': 'true' });
  panel.hidden = true;

  function syncBtn() {
    btn.textContent = selected.length === 0 ? allLabel
      : selected.length === 1 ? selected[0]
      : selected.length + ' selected';
  }
  syncBtn();

  panel.replaceChildren(frag(options.map((opt) => {
    const cb = h('input', {
      type: 'checkbox', checked: selected.includes(opt) ? 'checked' : null,
      onchange: () => {
        if (cb.checked) selected.push(opt);
        else { const i = selected.indexOf(opt); if (i >= 0) selected.splice(i, 1); }
        syncBtn();
        onChange();
      },
    });
    return h('label', { class: 'msel-opt' }, [cb, h('span', { text: opt })]);
  })));

  btn.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; });

  return h('div', { class: 'msel' }, [btn, panel]);
}

// Close any open multi-select panel on an outside click. Registered once at
// module load rather than per-dropdown, so repeated renders don't pile up
// duplicate document-level listeners.
document.addEventListener('click', (e) => {
  document.querySelectorAll('.msel-panel:not([hidden])').forEach((panel) => {
    const btn = panel.previousElementSibling;
    if (!panel.contains(e.target) && e.target !== btn) panel.hidden = true;
  });
});

const categoryOf = (job) => (/new grad/i.test(job.term || '') ? 'New Grad' : 'Internship');

function gridCols() {
  return state.showRepo
    ? 'minmax(0,1fr) minmax(0,1.8fr) minmax(0,1.1fr) 64px minmax(0,1.4fr) 140px'
    : 'minmax(0,1fr) minmax(0,2fr) minmax(0,1.2fr) 64px 140px';
}

function filteredRows() {
  const q = state.query.trim().toLowerCase();
  return JOBS.filter((j) =>
    (!q || (j.role + ' ' + j.company).toLowerCase().includes(q)) &&
    (!state.companyFilters.length || state.companyFilters.includes(j.company)) &&
    (!state.locationFilters.length || state.locationFilters.includes(j.location)) &&
    (!state.termFilters.length || state.termFilters.includes(categoryOf(j))));
}

function renderTable() {
  const card = document.getElementById('tbl');
  if (!card) return;
  const cols = gridCols();
  const head = h('div', { class: 'tbl-head', style: 'grid-template-columns:' + cols }, [
    h('div', { text: 'Company' }), h('div', { text: 'Role' }),
    h('div', { text: 'Location' }), h('div', { text: 'Posted' }),
    state.showRepo ? h('div', { text: 'Source' }) : null,
    h('div', { text: 'Outreach' }),
  ]);

  const rows = filteredRows();
  const body = rows.map((j) => {
    const st = statusOf(j.id);
    return h('button', {
      class: 'tbl-row', type: 'button',
      style: 'grid-template-columns:' + cols,
      onclick: () => openJob(j, 'jobs'),
    }, [
      h('div', { class: 'c-company', text: j.company }),
      h('div', { class: 'c-role' }, [
        h('div', { class: 'c-role-title', text: j.role }),
        h('div', { class: 'c-term', text: j.term }),
      ]),
      h('div', { class: 'c-loc', text: j.location }),
      h('div', { class: 'c-posted num', text: j.posted }),
      state.showRepo ? h('div', { class: 'c-repo', text: j.repo }) : null,
      h('div', { class: 'c-status' }, h('span', { class: st.cls, text: st.text })),
    ]);
  });

  const empty = h('div', { class: 'empty-rows' }, [
    h('div', { text: 'No listings match these filters.' }),
    h('button', { class: 'btn btn-solid', type: 'button',
      text: 'Find connections at a company instead',
      onclick: () => companySearch(state.companyFilters[0] || state.query || 'Linear') }),
  ]);

  card.replaceChildren(frag([head].concat(rows.length ? body : [empty])));
}

function syncedLabel() {
  if (!jobsGeneratedAt) return 'synced just now';
  const mins = Math.max(0, Math.round((Date.now() - jobsGeneratedAt.getTime()) / 60000));
  if (mins < 1) return 'synced just now';
  if (mins < 60) return 'synced ' + mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return 'synced ' + hrs + 'h ago';
  return 'synced ' + Math.round(hrs / 24) + 'd ago';
}

function renderJobs() {
  const uniq = (xs) => Array.from(new Set(xs)).sort();
  const hasFilters = () => !!(state.query || state.companyFilters.length ||
    state.locationFilters.length || state.termFilters.length);

  const q = h('input', {
    class: 'inp', id: 'q', type: 'search', value: state.query,
    placeholder: 'Search role title…', 'aria-label': 'Search role title',
    oninput: (e) => { state.query = e.target.value; renderTable(); syncClear(); },
  });
  const selCompany = multiSelect({
    id: 'f-company', allLabel: 'All companies', ariaLabel: 'Filter by company',
    options: uniq(JOBS.map((j) => j.company)), selected: state.companyFilters,
    onChange: () => { renderTable(); syncClear(); },
  });
  const selLocation = multiSelect({
    id: 'f-location', allLabel: 'All locations', ariaLabel: 'Filter by location',
    options: uniq(JOBS.map((j) => j.location)), selected: state.locationFilters,
    onChange: () => { renderTable(); syncClear(); },
  });
  const selType = multiSelect({
    id: 'f-type', allLabel: 'Internship or new grad', ariaLabel: 'Filter by internship or new grad',
    options: ['Internship', 'New Grad'], selected: state.termFilters,
    onChange: () => { renderTable(); syncClear(); },
  });

  const clearBtn = h('button', { class: 'btn btn-under', type: 'button', text: 'Clear',
    onclick: () => {
      state.query = ''; state.companyFilters = []; state.locationFilters = []; state.termFilters = [];
      renderJobsInto();
    } });
  clearBtn.hidden = !hasFilters();
  function syncClear() {
    clearBtn.hidden = !hasFilters();
  }
  function renderJobsInto() {
    view().replaceChildren(renderJobs());
    renderTable();
  }

  return frag([
    h('div', { class: 'page-head' }, [
      h('div', null, [
        h('h1', { text: 'Open roles' }),
        h('p', { class: 'sub', text: JOBS.length + ' listings pulled from ' + REPO_COUNT +
          ' GitHub repos · ' + syncedLabel() }),
      ]),
      h('button', { class: 'btn btn-ghost', type: 'button',
        text: 'No listing? Search a company →', onclick: () => go('company') }),
    ]),
    h('div', { class: 'filters' }, [q, selCompany, selLocation, selType, clearBtn]),
    h('div', { class: 'card', id: 'tbl' }),
  ]);
}

/* ===================== screen: company search ===================== */

function companySearch(rawName) {
  const name = (rawName || '').trim();
  if (!name) return;
  const id = 'co-' + name.toLowerCase().replace(/\s+/g, '-');
  let job = state.companyJobs.find((j) => j.id === id);
  if (!job) {
    job = { id, company: name, role: 'General referral', location: 'Any location',
      posted: '', repo: '', term: '', hasListing: false };
    state.companyJobs = [job].concat(state.companyJobs);
  }
  openJob(job, 'company');
}

function renderCompany() {
  const input = h('input', {
    class: 'inp inp-lg', id: 'co-input', type: 'text',
    placeholder: 'Company name, e.g. Linear', 'aria-label': 'Company name',
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); companySearch(input.value); } },
  });

  return h('div', { class: 'col-640' }, [
    h('h1', { text: 'Find connections by company' }),
    h('p', { class: 'sub', style: 'margin:8px 0 24px',
      text: "No posted listing? We'll find people at the company and draft general referral asks plus an email to their recruiting team." }),
    h('div', { style: 'display:flex;gap:10px' }, [
      input,
      h('button', { class: 'btn btn-accent-sm', type: 'button', style: 'padding:0 18px;font-weight:500',
        text: 'Find people', onclick: () => companySearch(input.value) }),
    ]),
    state.companyJobs.length ? h('div', { style: 'margin-top:32px' }, [
      h('div', { class: 'eyebrow', style: 'margin-bottom:10px', text: 'Recent company searches' }),
      h('div', { class: 'card', id: 'recents' }),
    ]) : null,
  ]);
}

/** Only the recents list — so a background collect can never wipe what's typed above it. */
function renderRecents() {
  const box = document.getElementById('recents');
  if (!box) return;
  box.replaceChildren(frag(state.companyJobs.map((j) =>
    h('button', { class: 'recent-row', type: 'button', onclick: () => openJob(j, 'company') }, [
      h('span', { style: 'font-weight:500', text: j.company }),
      h('span', { style: 'font-size:12px;color:var(--ink-3)', text: statusOf(j.id).text }),
    ]))));
}

/* ===================== screen: job detail ===================== */

function jobMeta(job) {
  return job.hasListing
    ? job.term + ' · posted ' + job.posted + ' · via ' + job.repo
    : 'No listing — general referral outreach';
}

function renderJob() {
  const job = findJob(state.jobId);
  if (!job) return renderJobs();
  const d = state.data[job.id];
  const isDone = !!d && d.status === 'done';

  const head = frag([
    h('button', { class: 'btn btn-back', type: 'button',
      text: '← ' + (state.prevScreen === 'company' ? 'Company search' : 'All jobs'),
      onclick: () => go(state.prevScreen) }),
    h('div', { class: 'job-head' }, [
      h('div', { style: 'min-width:0' }, [
        h('div', { style: 'font-size:14px;color:var(--ink-3);font-weight:500', text: job.company }),
        h('h1', { style: 'margin:4px 0 10px', text: job.role }),
        h('div', { class: 'job-meta' }, [
          h('span', { text: job.location }),
          h('span', { class: 'mono', style: 'font-size:12px;color:var(--ink-3)', text: jobMeta(job) }),
        ]),
      ]),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        isDone ? h('button', { class: 'btn btn-ghost', type: 'button', text: 'Re-run search',
          onclick: () => startCollect(job) }) : null,
        job.hasListing && job.url ? h('a', { class: 'btn btn-solid', href: job.url,
          target: '_blank', rel: 'noopener', text: 'Open application ↗' }) : null,
      ]),
    ]),
  ]);

  let body;
  if (!d) body = renderNone(job);
  else if (d.status === 'collecting') body = renderCollecting(job);
  else body = renderDone(job, d);

  return frag([head, body]);
}

function renderNone(job) {
  return h('div', { class: 'none-panel' }, [
    h('div', { class: 'none-title', text: 'No connections collected yet' }),
    h('p', { class: 'none-body', text: "We'll open a browser, find people at " + job.company +
      ' you can reach out to, draft a referral note for each using your resume, and look up a recruiter or HR email.' }),
    h('button', { class: 'btn btn-accent', type: 'button', style: 'margin-top:6px',
      text: 'Collect connections & HR email', onclick: () => startCollect(job) }),
    h('div', { class: 'eyebrow', style: 'text-transform:none;letter-spacing:0',
      text: 'takes ~1–2 min · uses your LinkedIn session' }),
  ]);
}

function renderCollecting(job) {
  return h('div', { class: 'collect-col' }, [
    h('div', { class: 'term', id: 'term' }, [
      h('div', { class: 'term-top' }, [
        h('span', { text: 'browser agent' }),
        h('span', { class: 'num', id: 'pct', text: '0%' }),
      ]),
      h('div', { class: 'term-track' }, h('div', { class: 'term-bar', id: 'bar', style: 'width:0%' })),
      h('div', { id: 'log' }),
      h('span', { class: 'cursor', 'aria-hidden': 'true' }),
    ]),
    h('div', { class: 'found' }, [
      h('div', { class: 'eyebrow', id: 'found-count', text: 'People found · 0' }),
      h('div', { class: 'found', id: 'found-list' }),
    ]),
  ]);
}

function updateCollecting(jobId) {
  const job = findJob(jobId);
  const d = state.data[jobId];
  if (!job || !d || d.status !== 'collecting') return;
  const lines = logLines(job.company);
  // The source design evaluates this once more at step === lines.length, which
  // yields 111% and spills the fill past the panel edge — clamped here.
  const pct = Math.min(100, Math.round((d.step / (lines.length - 1)) * 100));

  const pctEl = document.getElementById('pct');
  const barEl = document.getElementById('bar');
  const logEl = document.getElementById('log');
  const cEl = document.getElementById('found-count');
  const lEl = document.getElementById('found-list');
  if (!pctEl || !barEl || !logEl || !cEl || !lEl) return;

  pctEl.textContent = pct + '%';
  barEl.style.width = pct + '%';
  logEl.replaceChildren(frag(lines.slice(0, d.step + 1).map((t, i) =>
    h('div', { class: 'term-line' }, [
      h('span', { class: 'term-mark', text: i < d.step ? '✓' : '›' }),
      h('span', { text: t }),
    ]))));
  cEl.textContent = 'People found · ' + d.contacts.length;
  lEl.replaceChildren(frag(d.contacts.map((c) =>
    h('div', { class: 'found-row' }, [
      h('div', { class: 'av av-36', text: initials(c.name) }),
      h('div', { style: 'min-width:0' }, [
        h('div', { style: 'font-size:14px;font-weight:500', text: c.name }),
        h('div', { style: 'font-size:12px;color:var(--ink-3)', text: c.title }),
      ]),
    ]))));
}

function renderDone(job, d) {
  const sentCount = () => d.contacts.filter((c) => c.status !== 'Not sent').length;
  const sentEl = h('span', { style: 'font-size:12px;color:var(--ink-3)', text: sentCount() + ' sent' });

  const cards = d.contacts.map((c) => {
    const key = job.id + ':' + c.id;
    const counter = h('span', { class: 'num', text: c.text.length + '/300' });
    const syncCounter = () => {
      const len = c.text.length;
      counter.textContent = len + '/300';
      counter.className = 'num' + (len > 300 ? ' count-over' : '');
    };
    syncCounter();

    const ta = h('textarea', {
      class: 'ta', id: 'note-' + key.replace(':', '-'), rows: 5, value: c.text,
      'aria-label': 'Referral note to ' + c.name,
      oninput: (e) => { c.text = e.target.value; syncCounter(); },
    });

    const statusBtn = h('button', {
      class: STATUS_CLASS[c.status], type: 'button', text: c.status,
      'aria-label': 'Outreach status for ' + c.name + ': ' + c.status + '. Click to change.',
      onclick: () => {
        c.status = STATUS_CYCLE[c.status];
        statusBtn.className = STATUS_CLASS[c.status];
        statusBtn.textContent = c.status;
        sentEl.textContent = sentCount() + ' sent';
      },
    });

    const copyBtn = h('button', { class: 'btn-text', type: 'button', text: 'Copy message',
      onclick: () => copyToClipboard(c.text, copyBtn, 'Copy message') });

    return h('div', { class: 'ccard' }, [
      h('div', { class: 'ccard-top' }, [
        h('div', { class: 'av av-40', text: initials(c.name) }),
        h('div', { class: 'ccard-id' }, [
          h('div', { class: 'ccard-name-row' }, [
            h('span', { class: 'ccard-name', text: c.name }),
            h('span', { class: 'deg', text: c.degree }),
          ]),
          h('div', { class: 'ccard-title', text: c.title }),
          h('div', { class: 'reason', text: c.reason }),
        ]),
        statusBtn,
      ]),
      h('div', { class: 'ccard-body' }, [
        ta,
        h('div', { class: 'count-row' }, [h('span', { text: 'connection note' }), counter]),
      ]),
      aiToolbar(key, ['Shorter', 'Warmer', 'More formal', 'Mention my project'],
        () => c.text,
        (t) => { c.text = t; ta.value = t; syncCounter(); },
        h('div', { class: 'links' }, [
          copyBtn,
          h('a', { href: '#', text: 'Open LinkedIn profile ↗', onclick: (e) => e.preventDefault() }),
        ])),
    ]);
  });

  const email = d.email;
  const mailto = () => 'mailto:' + email.to +
    '?subject=' + encodeURIComponent(email.subject) +
    '&body=' + encodeURIComponent(email.text);

  const subjectInput = h('input', {
    class: 'inp-flat', id: 'email-subject-' + job.id, type: 'text', value: email.subject,
    'aria-label': 'Email subject',
    oninput: (e) => { email.subject = e.target.value; mailLink.href = mailto(); },
  });
  const bodyTa = h('textarea', {
    class: 'ta-flat', id: 'email-body-' + job.id, rows: 13, value: email.text,
    'aria-label': 'Email body',
    oninput: (e) => { email.text = e.target.value; mailLink.href = mailto(); },
  });
  const mailLink = h('a', { class: 'btn btn-accent-sm', href: mailto(), text: 'Open in mail app' });
  const emailCopy = h('button', { class: 'btn btn-outline', type: 'button', text: 'Copy',
    onclick: () => copyToClipboard(email.text, emailCopy, 'Copy') });

  const emailKey = job.id + ':email';

  return h('div', { class: 'two-col' }, [
    h('section', null, [
      h('div', { class: 'sec-head' }, [
        h('h2', null, ['LinkedIn connections ',
          h('span', { class: 'sec-count', text: '· ' + d.contacts.length })]),
        sentEl,
      ]),
      h('div', { class: 'ccards' }, cards),
    ]),
    h('section', { class: 'sticky-col' }, [
      h('h2', { style: 'margin-bottom:12px', text: 'Email to hiring team' }),
      h('div', { class: 'card card-18' }, [
        h('div', { class: 'ehead' }, [
          h('span', { class: 'ehead-k', text: 'To' }),
          h('div', { class: 'eto' }, [
            h('span', { class: 'eto-addr', text: email.to }),
            h('span', { class: 'conf', text: email.confidence }),
          ]),
          h('span', { class: 'ehead-k', text: 'Name' }),
          h('span', { text: email.toName }),
          h('span', { class: 'ehead-k', text: 'Subject' }),
          subjectInput,
        ]),
        bodyTa,
        aiToolbar(emailKey, ['Shorter', 'More enthusiastic', 'More formal', 'Add a question'],
          () => email.text,
          (t) => { email.text = t; bodyTa.value = t; mailLink.href = mailto(); },
          h('div', { class: 'esend' }, [mailLink, emailCopy])),
      ]),
      h('div', { class: 'esource', text: 'Found via company careers page + email pattern check. ' +
        state.profile.name + "'s resume will be attached." }),
    ]),
  ]);
}

/* ===================== screen: profile ===================== */

function renderProfile() {
  const field = (id, label, key, long) => {
    const control = long
      ? h('textarea', { class: 'ta ta-mono', id, rows: 12, value: state.profile[key],
          oninput: (e) => { state.profile[key] = e.target.value; } })
      : h('input', { class: 'inp', id, type: 'text', value: state.profile[key],
          oninput: (e) => {
            state.profile[key] = e.target.value;
            if (key === 'name') renderHeaderName();
          } });
    return h('label', { class: 'lbl', for: id }, [label, control]);
  };

  return h('div', { class: 'col-720' }, [
    h('div', null, [
      h('h1', { text: 'About you' }),
      h('p', { class: 'sub', style: 'margin-top:8px',
        text: 'The AI uses this to write every referral note and email.' }),
    ]),
    h('div', { class: 'pf-grid' }, [
      field('pf-name', 'Name', 'name'),
      field('pf-school', 'School / background', 'school'),
    ]),
    field('pf-highlight', 'One-line highlight to mention', 'highlight'),
    field('pf-resume', 'Resume (paste text)', 'resume', true),
    h('div', { style: 'font-size:12px;color:var(--ink-4)', text: 'Saved automatically.' }),
  ]);
}

/* ===================== footer settings ===================== */

function renderSettings() {
  const speed = document.getElementById('seg-speed');
  speed.replaceChildren(frag(['Fast', 'Normal', 'Slow'].map((s) =>
    h('button', { type: 'button', class: state.collectSpeed === s ? 'on' : '', text: s.toLowerCase(),
      'aria-pressed': String(state.collectSpeed === s),
      onclick: () => { state.collectSpeed = s; renderSettings(); } }))));

  const repo = document.getElementById('seg-repo');
  repo.replaceChildren(frag([['on', true], ['off', false]].map(([label, v]) =>
    h('button', { type: 'button', class: state.showRepo === v ? 'on' : '', text: label,
      'aria-pressed': String(state.showRepo === v),
      onclick: () => { state.showRepo = v; renderSettings(); if (state.screen === 'jobs') renderTable(); } }))));
}

/* ===================== render ===================== */

function render() {
  if (state.screen === 'job' && !findJob(state.jobId)) state.screen = 'jobs';
  renderTabs();
  renderHeaderName();
  const v = view();
  if (state.screen === 'jobs') { v.replaceChildren(renderJobs()); renderTable(); }
  else if (state.screen === 'company') { v.replaceChildren(renderCompany()); renderRecents(); }
  else if (state.screen === 'job') v.replaceChildren(renderJob());
  else v.replaceChildren(renderProfile());
}

/* ===================== boot ===================== */

async function loadJobs() {
  try {
    const res = await fetch('../data/jobs.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const payload = await res.json();
    if (!Array.isArray(payload.jobs) || payload.jobs.length === 0) throw new Error('empty feed');
    JOBS = payload.jobs;
    REPO_COUNT = Array.isArray(payload.repos) ? payload.repos.length : 4;
    jobsGeneratedAt = payload.generatedAt ? new Date(payload.generatedAt) : null;
  } catch (e) {
    console.warn('Could not load data/jobs.json, using fallback listings.', e);
    JOBS = FALLBACK_JOBS;
    REPO_COUNT = 4;
    jobsGeneratedAt = null;
  }
}

function start() {
  const p = state.profile;
  // Seed the first couple of listings as already "done" so the first screen
  // shows real worked rows instead of an empty shell.
  for (const job of JOBS.slice(0, 2)) state.data[job.id] = buildDone(job, p);
  renderSettings();
  render();
}

loadJobs().then(start);
