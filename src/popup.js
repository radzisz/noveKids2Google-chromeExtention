// ── DOM refs ──
const appTitle = document.getElementById('appTitle');
const statusEl = document.getElementById('status');
const bottomArea = document.getElementById('bottomArea');
const btnAction = document.getElementById('btnAction');
const autoSyncChip = document.getElementById('autoSyncChip');
const autoSyncLabel = document.getElementById('autoSyncLabel');
const autoSyncToggle = document.getElementById('autoSyncToggle');
const autoSyncHint = document.getElementById('autoSyncHint');
const btnDisconnect = document.getElementById('btnDisconnect');
const loaderEl = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const structureWarning = document.getElementById('structureWarning');
const structureWarningText = document.getElementById('structureWarningText');
const langSwitch = document.getElementById('langSwitch');
const linkCoffee = document.getElementById('linkCoffee');
const linkRate = document.getElementById('linkRate');

const lessonsSection = document.getElementById('lessonsSection');
const lessonsHeader = document.getElementById('lessonsHeader');
const lessonsHeaderText = document.getElementById('lessonsHeaderText');
const lessonsBody = document.getElementById('lessonsBody');
const settingsSection = document.getElementById('settingsSection');
const settingsHeader = document.getElementById('settingsHeader');
const settingsHeaderText = document.getElementById('settingsHeaderText');
const settingsBody = document.getElementById('settingsBody');

// ── State ──
let scannedLessons = [];
let isLoggedIn = false;
let userCalendars = [];
let calendarsLoaded = false;
let childSettings = {};
let knownChildren = [];
let eventPrefix = 'NovaKid:';
let googleEmail = '';

const USER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// TODO: replace with actual URLs after creating accounts
const COFFEE_URL = 'https://buymeacoffee.com/radzisz';
const RATE_URL = 'https://chromewebstore.google.com/detail/YOUR_EXTENSION_ID/reviews';

const GCAL_COLORS = [
  { id: '11', hex: '#d50000' },
  { id: '4',  hex: '#e67c73' },
  { id: '6',  hex: '#f4511e' },
  { id: '5',  hex: '#f6bf26' },
  { id: '2',  hex: '#33b679' },
  { id: '10', hex: '#0b8043' },
  { id: '7',  hex: '#039be5' },
  { id: '9',  hex: '#3f51b5' },
  { id: '1',  hex: '#7986cb' },
  { id: '3',  hex: '#8e24aa' },
  { id: '8',  hex: '#616161' },
];

// ── UI helpers ──
function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
}

function clearStatus() {
  statusEl.textContent = '';
  statusEl.className = 'status';
}

function showLoader(msg) { loaderText.textContent = msg; loaderEl.style.display = 'flex'; }
function hideLoader() { loaderEl.style.display = 'none'; }

function toggleSection(section) { section.classList.toggle('collapsed'); }
function collapseSection(section) { section.classList.add('collapsed'); }
function expandSection(section) { section.classList.remove('collapsed'); }
function showSection(section) { section.classList.add('visible'); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

lessonsHeader.addEventListener('click', () => toggleSection(lessonsSection));
settingsHeader.addEventListener('click', () => toggleSection(settingsSection));

// ── Language dropdown ──
function renderLangDropdown() {
  const meta = I18n.getLangMeta();
  const current = I18n.getLang();
  const langs = I18n.getSupportedLangs();

  langSwitch.innerHTML = '';
  langSwitch.className = 'lang-dropdown';

  const btn = document.createElement('div');
  btn.className = 'lang-current';
  btn.innerHTML = `<img src="${meta[current].flagFile}" alt="${meta[current].label}"><span>${meta[current].label}</span><span class="dd-arrow">\u25BC</span>`;

  const menu = document.createElement('div');
  menu.className = 'lang-menu';
  for (const lang of langs) {
    const opt = document.createElement('div');
    opt.className = 'lang-option' + (lang === current ? ' active' : '');
    opt.innerHTML = `<img src="${meta[lang].flagFile}" alt="${meta[lang].label}"><span>${meta[lang].label}</span>`;
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.remove('open');
      I18n.setLanguage(lang);
      chrome.storage.local.set({ langManuallySet: true });
      renderLangDropdown();
      updateUI();
    });
    menu.appendChild(opt);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  langSwitch.appendChild(btn);
  langSwitch.appendChild(menu);
}

document.addEventListener('click', () => {
  const menu = document.querySelector('.lang-menu');
  if (menu) menu.classList.remove('open');
});

// Footer links - open in new tab (popup links don't work directly)
linkCoffee.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: COFFEE_URL }); });
linkRate.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: RATE_URL }); });

// ── Update all UI text + layout ──
function updateUI() {
  appTitle.textContent = I18n.t('appTitle');
  structureWarningText.textContent = I18n.t('structureWarning');
  settingsHeaderText.textContent = I18n.t('settingsTitle');
  lessonsHeaderText.textContent = scannedLessons.length > 0
    ? I18n.t('lessonsSection', { count: scannedLessons.length })
    : I18n.t('lessonsSectionEmpty');

  linkCoffee.textContent = '\u2615 ' + I18n.t('buyMeCoffee');
  linkRate.textContent = '\u2B50 ' + I18n.t('rateExtension');

  updateBottomArea();
  if (settingsSection.classList.contains('visible')) renderChildSettings();
}

// ── Bottom area: auto-sync chip + action button ──
function updateBottomArea() {
  if (scannedLessons.length === 0) {
    bottomArea.style.display = 'none';
    return;
  }
  bottomArea.style.display = 'block';

  btnAction.disabled = false;
  btnAction.className = 'btn btn-blue';

  if (isLoggedIn) {
    btnAction.textContent = I18n.t('syncButton');
    btnAction.onclick = doSync;
    autoSyncChip.style.display = 'flex';
    autoSyncHint.style.display = 'block';
    autoSyncLabel.textContent = I18n.t('autoSyncLabel');
    autoSyncHint.textContent = I18n.t('autoSyncHint');
    btnDisconnect.textContent = I18n.t('disconnectGoogle');
    btnDisconnect.style.display = 'block';
    chrome.storage.local.get('autoSync', (data) => {
      setAutoSyncState(!!data.autoSync);
    });
  } else {
    btnAction.textContent = I18n.t('connectGoogle');
    btnAction.onclick = doConnect;
    autoSyncChip.style.display = 'none';
    autoSyncHint.style.display = 'none';
    btnDisconnect.style.display = 'none';
  }
}

function setAutoSyncState(on) {
  if (on) {
    autoSyncToggle.classList.add('on');
    autoSyncChip.classList.add('active');
  } else {
    autoSyncToggle.classList.remove('on');
    autoSyncChip.classList.remove('active');
  }
}

autoSyncChip.addEventListener('click', () => {
  const isOn = autoSyncToggle.classList.contains('on');
  const newState = !isOn;
  setAutoSyncState(newState);
  chrome.storage.local.set({ autoSync: newState });
  chrome.runtime.sendMessage({ type: 'autoSyncChanged', enabled: newState });
});

// ── Disconnect ──
btnDisconnect.addEventListener('click', async () => {
  if (!confirm(I18n.t('disconnectConfirm'))) return;
  try {
    const token = await chrome.identity.getAuthToken({ interactive: false });
    await chrome.identity.removeCachedAuthToken({ token: token.token });
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token.token}`);
  } catch {}
  try {
    await chrome.identity.clearAllCachedAuthTokens();
  } catch {}
  isLoggedIn = false;
  googleEmail = '';
  calendarsLoaded = false;
  userCalendars = [];
  // Disable auto-sync
  setAutoSyncState(false);
  chrome.storage.local.set({ autoSync: false });
  chrome.runtime.sendMessage({ type: 'autoSyncChanged', enabled: false });
  // Hide settings
  settingsSection.classList.remove('visible');
  updateBottomArea();
});

// ── Init ──
I18n.init().then(async () => {
  renderLangDropdown();

  // Auto-detect language from NovaKid page
  const stored = await new Promise(r => chrome.storage.local.get('langManuallySet', d => r(d.langManuallySet)));
  if (!stored) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('school.novakidschool.com')) {
        const pageLang = await executeOnTab(tab, () => {
          const htmlLang = document.documentElement.lang?.split('-')[0]?.toLowerCase();
          if (htmlLang) return htmlLang;
          const urlMatch = location.pathname.match(/^\/([a-z]{2})\//);
          return urlMatch ? urlMatch[1] : null;
        });
        if (pageLang && I18n.getSupportedLangs().includes(pageLang)) {
          I18n.setLanguage(pageLang);
          renderLangDropdown();
        }
      }
    } catch {}
  }

  await loadSavedSettings();
  await checkGoogleLogin();
  updateUI();

  chrome.storage.local.get('structureBroken', (data) => {
    if (data.structureBroken) structureWarning.classList.add('visible');
  });

  // Auto-scan if on NovaKid page
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.url && activeTab.url.includes('school.novakidschool.com')) {
    await doScan(activeTab);
  } else {
    setStatus(I18n.t('openNovakid'), 'info');
  }
});

// ── Settings persistence ──
async function loadSavedSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['childSettings', 'knownChildren', 'eventPrefix', 'scannedLessons'], (data) => {
      if (data.childSettings) childSettings = data.childSettings;
      if (data.knownChildren) knownChildren = data.knownChildren;
      if (data.eventPrefix !== undefined) eventPrefix = data.eventPrefix;
      if (data.scannedLessons) scannedLessons = data.scannedLessons;
      resolve();
    });
  });
}

function saveChildSettings() {
  chrome.storage.local.set({ childSettings, knownChildren });
}

// ── Google Auth ──
async function checkGoogleLogin() {
  try {
    const token = await chrome.identity.getAuthToken({ interactive: false });
    if (token?.token) {
      isLoggedIn = true;
      if (knownChildren.length > 0) {
        showSection(settingsSection);
        collapseSection(settingsSection);
        if (!calendarsLoaded) await loadCalendars();
        renderChildSettings();
      }
      return;
    }
  } catch {}
  isLoggedIn = false;
}

async function doConnect() {
  setBtnState(I18n.t('connecting'), 'btn-loading');
  try {
    const token = await chrome.identity.getAuthToken({ interactive: true });
    if (token?.token) {
      isLoggedIn = true;

      collapseSection(lessonsSection);
      showSection(settingsSection);
      collapseSection(settingsSection);

      await loadCalendars();
      renderChildSettings();
      updateBottomArea();
    }
  } catch (e) {
    setBtnTemp(I18n.t('connectFailed', { message: e.message }), 'btn-error', 4000);
  }
}

async function executeOnTab(tab, func) {
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func });
  return results[0]?.result;
}

// ── Calendars ──
async function loadCalendars() {
  try {
    let token;
    try { token = await chrome.identity.getAuthToken({ interactive: false }); } catch { return; }
    if (!token?.token) return;

    let cals = await fetchCalendarList(token.token);

    if (cals === null) {
      await chrome.identity.removeCachedAuthToken({ token: token.token });
      try { token = await chrome.identity.getAuthToken({ interactive: true }); } catch { return; }
      cals = await fetchCalendarList(token.token);
    }

    userCalendars = cals || [];
    calendarsLoaded = true;
    isLoggedIn = true;
    updateBottomArea();
    if (settingsSection.classList.contains('visible')) renderChildSettings();
  } catch (e) {
    console.error('Failed to load calendars:', e);
  }
}

async function fetchCalendarList(token) {
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=100', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.items || [];
  const primary = items.find(c => c.primary);
  if (primary) googleEmail = primary.id;
  return items.map(c => ({ id: c.id, summary: c.summary || c.id }));
}

// ── Child settings render ──
function renderChildSettings() {
  // Google account info
  const accountHtml = `
    <div class="account-row">
      <span class="account-label">${I18n.t('googleAccount')}:</span>
      <span class="account-email">${escapeHtml(googleEmail)}</span>
    </div>`;

  // Prefix input
  const prefixHtml = `
    <div class="prefix-row">
      <label>${I18n.t('eventPrefix')}:</label>
      <input type="text" id="prefixInput" value="${escapeHtml(eventPrefix)}" placeholder="NovaKid:">
    </div>`;

  let childrenHtml = '';
  if (knownChildren.length === 0) {
    childrenHtml = `<div class="empty-hint">${I18n.t('noChildrenYet')}</div>`;
  } else {
    childrenHtml = knownChildren.map(name => {
      const cfg = childSettings[name] || {};
      const selectedCalendar = cfg.calendarId || 'primary';
      const selectedColor = cfg.colorId || '';

      let calendarOptions = '';
      if (userCalendars.length > 0) {
        for (const cal of userCalendars) {
          const sel = cal.id === selectedCalendar ? 'selected' : '';
          calendarOptions += `<option value="${escapeHtml(cal.id)}" ${sel}>${escapeHtml(cal.summary)}</option>`;
        }
        if (!userCalendars.find(c => c.id === selectedCalendar)) {
          calendarOptions = calendarOptions.replace('selected', '');
          calendarOptions = `<option value="primary" selected>${escapeHtml(I18n.t('primaryCalendar'))}</option>` + calendarOptions;
        }
      } else {
        calendarOptions = `<option value="primary" selected>${escapeHtml(I18n.t('primaryCalendar'))}</option>`;
      }

      const noneSelected = selectedColor === '' ? 'selected' : '';
      let colorCircles = `<div class="color-circle color-none ${noneSelected}" data-child="${escapeHtml(name)}" data-color="" title="${I18n.t('defaultColor')}"></div>`;
      for (const c of GCAL_COLORS) {
        const sel = c.id === selectedColor ? 'selected' : '';
        colorCircles += `<div class="color-circle ${sel}" data-child="${escapeHtml(name)}" data-color="${c.id}" style="background:${c.hex}"></div>`;
      }

      return `
        <div class="child-config" data-child="${escapeHtml(name)}">
          <div class="child-config-name">${escapeHtml(name)}</div>
          <div class="child-config-row">
            <label>${I18n.t('calendar')}:</label>
            <select class="cfg-calendar" data-child="${escapeHtml(name)}">${calendarOptions}</select>
          </div>
          <div class="child-config-row">
            <label>${I18n.t('eventColor')}:</label>
            <div class="color-grid">${colorCircles}</div>
          </div>
        </div>`;
    }).join('');
  }

  settingsBody.innerHTML = accountHtml + prefixHtml + childrenHtml;

  // Bind prefix input
  const prefixInput = settingsBody.querySelector('#prefixInput');
  if (prefixInput) {
    prefixInput.addEventListener('input', () => {
      eventPrefix = prefixInput.value;
      chrome.storage.local.set({ eventPrefix });
    });
  }

  // Bind calendar selectors
  settingsBody.querySelectorAll('.cfg-calendar').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const name = e.target.dataset.child;
      if (!childSettings[name]) childSettings[name] = {};
      childSettings[name].calendarId = e.target.value;
      saveChildSettings();
    });
  });

  // Bind color circles
  settingsBody.querySelectorAll('.color-circle').forEach(circle => {
    circle.addEventListener('click', (e) => {
      const el = e.currentTarget;
      const name = el.dataset.child;
      if (!childSettings[name]) childSettings[name] = {};
      childSettings[name].colorId = el.dataset.color;
      saveChildSettings();

      el.closest('.color-grid').querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}

// ── Scan with retry (waits for SPA to load) ──
const SCAN_MAX_RETRIES = 8;
const SCAN_RETRY_DELAY = 1500;

async function doScan(tab) {
  showLoader(I18n.t('scanning'));

  try {
    let lessons = null;
    let lastError = null;

    for (let attempt = 0; attempt < SCAN_MAX_RETRIES; attempt++) {
      // Wait for tab to finish loading
      if (tab.status !== 'complete') {
        await new Promise(r => setTimeout(r, SCAN_RETRY_DELAY));
        const [refreshed] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (refreshed) tab = refreshed;
        continue;
      }

      const result = await executeOnTab(tab, () => {
        return window.__novakidExtract ? window.__novakidExtract() : { error: 'content_not_loaded' };
      });

      // Content script not injected yet
      if (result.error === 'content_not_loaded') {
        lastError = 'content_not_loaded';
        await new Promise(r => setTimeout(r, SCAN_RETRY_DELAY));
        continue;
      }

      // Page loaded but SPA hasn't rendered schedule yet
      if (result.structureChanged || result.error === 'noLessonsFound') {
        lastError = result.error;
        await new Promise(r => setTimeout(r, SCAN_RETRY_DELAY));
        continue;
      }

      // Other error (genuine)
      if (result.error) {
        lastError = result.error;
        break;
      }

      // Success
      lessons = result;
      break;
    }

    hideLoader();

    // All retries exhausted
    if (!lessons) {
      if (lastError === 'content_not_loaded') {
        setStatus(I18n.t('contentNotLoaded'), 'error');
      } else if (lastError === 'noCards' || lastError === 'noTimePattern' || lastError === 'noMonthNames') {
        // Genuine structure change — only show after retries
        structureWarning.classList.add('visible');
        chrome.storage.local.set({ structureBroken: true });
        chrome.runtime.sendMessage({ type: 'structureBroken' });
        console.warn('Structure changed:', lastError);
      }
      return;
    }

    structureWarning.classList.remove('visible');
    chrome.storage.local.set({ structureBroken: false });
    chrome.runtime.sendMessage({ type: 'structureOk' });

    scannedLessons = lessons;
    chrome.storage.local.set({ scannedLessons });
    for (const l of scannedLessons) {
      if (l.childName === '__unknown__') l.childName = I18n.t('unknownChild');
    }

    // Discover children
    const childNames = [...new Set(lessons.map(l => l.childName))];
    let changed = false;
    for (const name of childNames) {
      if (!knownChildren.includes(name)) { knownChildren.push(name); changed = true; }
    }
    if (changed) saveChildSettings();

    // Show lessons collapsed
    lessonsHeaderText.textContent = I18n.t('lessonsSection', { count: lessons.length });
    renderPreview(lessons);
    showSection(lessonsSection);
    collapseSection(lessonsSection);

    updateBottomArea();

    if (isLoggedIn) {
      showSection(settingsSection);
      collapseSection(settingsSection);
      if (!calendarsLoaded) await loadCalendars();
      renderChildSettings();
    }
  } catch (e) {
    hideLoader();
    setStatus(I18n.t('error', { message: e.message }), 'error');
  }
}

function renderPreview(lessons) {
  lessonsBody.innerHTML = lessons.map(l => {
    const cfg = childSettings[l.childName] || {};
    const colorId = cfg.colorId;
    const borderColor = colorId
      ? GCAL_COLORS.find(c => c.id === colorId)?.hex || l.color || '#ff6b00'
      : l.color || '#ff6b00';
    return `<div class="lesson" style="border-left-color:${borderColor}">
      <div class="child">${escapeHtml(l.childName)}</div>
      <div class="time">${l.date} ${l.timeStart}\u2013${l.timeEnd}</div>
      <div class="detail">${escapeHtml(l.teacher || '')} ${l.type ? '(' + escapeHtml(l.type) + ')' : ''}</div>
    </div>`;
  }).join('');
}

// ── Button state helpers ──
let btnResetTimer = null;
const btnDefaultText = () => isLoggedIn ? I18n.t('syncButton') : I18n.t('connectGoogle');

function setBtnState(text, cssClass) {
  if (btnResetTimer) { clearTimeout(btnResetTimer); btnResetTimer = null; }
  if (cssClass === 'btn-loading') {
    btnAction.innerHTML = '<span class="btn-spinner"></span>';
  } else {
    btnAction.textContent = text;
  }
  btnAction.className = 'btn ' + cssClass;
  btnAction.disabled = cssClass === 'btn-loading';
}

function setBtnTemp(text, cssClass, ms = 3000) {
  setBtnState(text, cssClass);
  btnResetTimer = setTimeout(() => {
    btnAction.textContent = btnDefaultText();
    btnAction.className = 'btn btn-blue';
    btnAction.disabled = false;
  }, ms);
}

// ── Sync ──
async function doSync() {
  setBtnState('\u2026', 'btn-loading');

  try {
    const token = await chrome.identity.getAuthToken({ interactive: true });
    const accessToken = token.token;

    if (!calendarsLoaded) {
      userCalendars = await fetchCalendarList(accessToken) || [];
      calendarsLoaded = true;
      if (settingsSection.classList.contains('visible')) renderChildSettings();
    }

    // Collect all relevant calendar IDs
    const calendarIds = [...new Set(scannedLessons.map(l => getChildCalendarId(l.childName)))];
    for (const cfg of Object.values(childSettings)) {
      if (cfg.calendarId && !calendarIds.includes(cfg.calendarId)) calendarIds.push(cfg.calendarId);
    }
    if (!calendarIds.includes('primary')) calendarIds.push('primary');

    // Fetch existing managed events
    const existingMap = new Map();
    for (const calId of calendarIds) {
      try {
        const events = await fetchAllNovakidEvents(accessToken, calId);
        for (const ev of events) {
          const nkId = ev.extendedProperties?.private?.novakidId;
          if (nkId) existingMap.set(nkId, { googleEventId: ev.id, calendarId: calId, colorId: ev.colorId || '' });
        }
      } catch (e) {
        console.warn(`Skip calendar ${calId}:`, e.message);
      }
    }

    const scannedIds = new Set(scannedLessons.map(l => l.id));

    let added = 0, updated = 0, skipped = 0;
    for (const lesson of scannedLessons) {
      const existing = existingMap.get(lesson.id);
      const targetCalendar = getChildCalendarId(lesson.childName);
      const targetColorId = getChildColorId(lesson.childName) || '';

      if (existing) {
        if (existing.calendarId !== targetCalendar) {
          await deleteCalendarEvent(accessToken, existing.googleEventId, existing.calendarId);
          await createCalendarEvent(accessToken, buildCalendarEvent(lesson), targetCalendar);
          added++;
        } else if (existing.colorId !== targetColorId) {
          await updateCalendarEvent(accessToken, existing.googleEventId, existing.calendarId, { colorId: targetColorId || undefined });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      await createCalendarEvent(accessToken, buildCalendarEvent(lesson), targetCalendar);
      added++;
    }

    let deleted = 0;
    for (const [nkId, info] of existingMap) {
      if (!scannedIds.has(nkId)) {
        await deleteCalendarEvent(accessToken, info.googleEventId, info.calendarId);
        deleted++;
      }
    }

    const parts = [];
    if (added > 0) parts.push(I18n.t('syncAdded', { count: added }));
    if (updated > 0) parts.push(I18n.t('syncUpdated', { count: updated }));
    if (skipped > 0) parts.push(I18n.t('syncSkipped', { count: skipped }));
    if (deleted > 0) parts.push(I18n.t('syncDeleted', { count: deleted }));

    setBtnTemp('\u2713 ' + parts.join(', '), 'btn-success');

    isLoggedIn = true;
    if (settingsSection.classList.contains('visible')) renderChildSettings();
  } catch (e) {
    setBtnTemp(I18n.t('gcalError', { message: e.message }), 'btn-error', 4000);
  }
}

// ── Calendar event helpers ──
function getChildCalendarId(childName) {
  return childSettings[childName]?.calendarId || 'primary';
}

function getChildColorId(childName) {
  return childSettings[childName]?.colorId || undefined;
}

function buildCalendarEvent(lesson) {
  const colorId = getChildColorId(lesson.childName);
  return {
    summary: `${eventPrefix} ${lesson.childName}`.trim(),
    description: [lesson.teacher ? `${I18n.t('teacher')}: ${lesson.teacher}` : '', lesson.type].filter(Boolean).join(' | '),
    start: { dateTime: `${lesson.date}T${lesson.timeStart}:00`, timeZone: USER_TIMEZONE },
    end: { dateTime: `${lesson.date}T${lesson.timeEnd}:00`, timeZone: USER_TIMEZONE },
    colorId: colorId || undefined,
    extendedProperties: { private: { novakidId: lesson.id, managedBy: 'novakid-ext' } }
  };
}

async function fetchAllNovakidEvents(token, calendarId) {
  const allEvents = [];
  let pageToken = '';
  const timeMin = new Date();
  const timeMax = new Date();
  timeMax.setMonth(timeMax.getMonth() + 6);
  const calId = encodeURIComponent(calendarId || 'primary');

  do {
    let url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?` +
      `privateExtendedProperty=${encodeURIComponent('managedBy=novakid-ext')}&` +
      `timeMin=${timeMin.toISOString()}&` +
      `timeMax=${timeMax.toISOString()}&` +
      `maxResults=250&singleEvents=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || I18n.t('fetchEventsFailed'));
    }
    const data = await res.json();
    if (data.items) allEvents.push(...data.items);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return allEvents;
}

async function createCalendarEvent(token, event, calendarId) {
  const calId = encodeURIComponent(calendarId || 'primary');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || I18n.t('createEventFailed'));
  }
}

async function updateCalendarEvent(token, eventId, calendarId, fields) {
  const calId = encodeURIComponent(calendarId || 'primary');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to update event');
  }
}

async function deleteCalendarEvent(token, eventId, calendarId) {
  const calId = encodeURIComponent(calendarId || 'primary');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 410) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || I18n.t('deleteEventFailed', { id: eventId }));
  }
}
