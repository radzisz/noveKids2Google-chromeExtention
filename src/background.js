// Background service worker - handles auto-sync
importScripts('i18n.js');

const ALARM_NAME = 'novakid-autosync';
const SYNC_INTERVAL_MINUTES = 30;
const USER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Init i18n on startup
I18n.init();

chrome.runtime.onInstalled.addListener(() => {
  console.log('NovaKid Calendar extension installed');
  chrome.storage.local.get('autoSync', (data) => {
    if (data.autoSync) startAlarm();
  });
});

chrome.storage.local.get('autoSync', (data) => {
  if (data.autoSync) startAlarm();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'autoSyncChanged') {
    if (msg.enabled) {
      startAlarm();
    } else {
      chrome.alarms.clear(ALARM_NAME);
      console.log('Auto-sync disabled');
    }
  }

  if (msg.type === 'structureBroken') setErrorIcon();
  if (msg.type === 'structureOk') setNormalIcon();

  if (msg.type === 'autoSyncLessons' && msg.lessons) {
    syncLessons(msg.lessons);
  }
});

function startAlarm() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: SYNC_INTERVAL_MINUTES });
  console.log(`Auto-sync alarm set: every ${SYNC_INTERVAL_MINUTES} min`);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const { structureBroken } = await chrome.storage.local.get('structureBroken');
  if (structureBroken) {
    setErrorIcon();
    return;
  }

  const tabs = await chrome.tabs.query({ url: 'https://school.novakidschool.com/*' });
  if (tabs.length === 0) return;

  try {
    const extractResults = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => window.__novakidExtract ? window.__novakidExtract() : { error: 'not loaded' }
    });
    const lessons = extractResults[0]?.result;

    if (!lessons || lessons.structureChanged) {
      chrome.storage.local.set({ structureBroken: true });
      setErrorIcon();
      return;
    }
    if (lessons.error) return;

    await syncLessons(lessons);
  } catch (e) {
    console.error('Alarm sync error:', e);
  }
});

// --- Load settings ---
async function loadChildSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get('childSettings', (data) => {
      resolve(data.childSettings || {});
    });
  });
}

async function loadEventPrefix() {
  return new Promise((resolve) => {
    chrome.storage.local.get('eventPrefix', (data) => {
      resolve(data.eventPrefix !== undefined ? data.eventPrefix : 'NovaKid:');
    });
  });
}

function getChildCalendarId(childSettings, childName) {
  return childSettings[childName]?.calendarId || 'primary';
}

function getChildColorId(childSettings, childName) {
  return childSettings[childName]?.colorId || undefined;
}

async function syncLessons(lessons) {
  try {
    let accessToken;
    try {
      const token = await chrome.identity.getAuthToken({ interactive: false });
      accessToken = token.token;
    } catch {
      console.log('Auto-sync skipped: not logged in to Google');
      return;
    }

    const settings = await loadChildSettings();
    const prefix = await loadEventPrefix();

    // Determine all unique calendar IDs
    const calendarIds = [...new Set(lessons.map(l => getChildCalendarId(settings, l.childName)))];
    for (const cfg of Object.values(settings)) {
      if (cfg.calendarId && !calendarIds.includes(cfg.calendarId)) {
        calendarIds.push(cfg.calendarId);
      }
    }
    if (!calendarIds.includes('primary')) calendarIds.push('primary');

    // Fetch existing NovaKid events from all relevant calendars
    const existingMap = new Map();
    for (const calId of calendarIds) {
      try {
        const events = await fetchAllNovakidEvents(accessToken, calId);
        for (const ev of events) {
          const nkId = ev.extendedProperties?.private?.novakidId;
          if (nkId) existingMap.set(nkId, { googleEventId: ev.id, calendarId: calId, colorId: ev.colorId || '' });
        }
      } catch (e) {
        console.error(`Failed to fetch events from calendar ${calId}:`, e);
      }
    }

    const scannedIds = new Set(lessons.map(l => l.id));

    let added = 0, updated = 0;
    for (const lesson of lessons) {
      const existing = existingMap.get(lesson.id);
      const targetCalendar = getChildCalendarId(settings, lesson.childName);
      const targetColorId = getChildColorId(settings, lesson.childName) || '';

      if (existing) {
        if (existing.calendarId !== targetCalendar) {
          await deleteCalendarEvent(accessToken, existing.googleEventId, existing.calendarId);
          await createCalendarEvent(accessToken, lesson, settings, prefix, targetCalendar);
          added++;
        } else if (existing.colorId !== targetColorId) {
          await updateCalendarEvent(accessToken, existing.googleEventId, existing.calendarId, { colorId: targetColorId || undefined });
          updated++;
        }
        continue;
      }
      await createCalendarEvent(accessToken, lesson, settings, prefix, targetCalendar);
      added++;
    }

    let deleted = 0;
    for (const [nkId, info] of existingMap) {
      if (!scannedIds.has(nkId)) {
        await deleteCalendarEvent(accessToken, info.googleEventId, info.calendarId);
        deleted++;
      }
    }

    console.log(`Auto-sync done: +${added} ~${updated} -${deleted}`);
    setNormalIcon();
    if (added > 0 || updated > 0 || deleted > 0) {
      updateBadge('OK', '#2e7d32');
      setTimeout(() => updateBadge('', ''), 5000);
    }
  } catch (e) {
    console.error('Auto-sync error:', e);
  }
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// --- Dynamic icon switching ---
function makeIconImageData(size, error) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.167;

  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();

  ctx.fillStyle = error ? '#D32F2F' : '#FF6B00';
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (error) {
    ctx.font = `bold ${size * 0.65}px Arial`;
    ctx.fillText('!', size / 2, size / 2 + size * 0.03);
  } else {
    ctx.font = `bold ${size * 0.45}px Arial`;
    ctx.fillText('NK', size / 2, size / 2 + size * 0.03);
  }

  return ctx.getImageData(0, 0, size, size);
}

function setErrorIcon() {
  chrome.action.setIcon({
    imageData: { 48: makeIconImageData(48, true), 128: makeIconImageData(128, true) }
  });
  chrome.action.setTitle({ title: I18n.t('errorTooltip') });
}

function setNormalIcon() {
  chrome.action.setIcon({
    imageData: { 48: makeIconImageData(48, false), 128: makeIconImageData(128, false) }
  });
  chrome.action.setTitle({ title: I18n.t('normalTooltip') });
}

chrome.storage.local.get('structureBroken', (data) => {
  if (data.structureBroken) setErrorIcon();
});

// --- Google Calendar helpers ---

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
    if (!res.ok) throw new Error('Failed to fetch events');
    const data = await res.json();
    if (data.items) allEvents.push(...data.items);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return allEvents;
}

function buildCalendarEvent(lesson, childSettings, prefix) {
  const colorId = getChildColorId(childSettings, lesson.childName);
  return {
    summary: `${prefix} ${lesson.childName}`.trim(),
    description: [lesson.teacher ? `${I18n.t('teacher')}: ${lesson.teacher}` : '', lesson.type].filter(Boolean).join(' | '),
    start: { dateTime: `${lesson.date}T${lesson.timeStart}:00`, timeZone: USER_TIMEZONE },
    end: { dateTime: `${lesson.date}T${lesson.timeEnd}:00`, timeZone: USER_TIMEZONE },
    colorId: colorId || undefined,
    extendedProperties: { private: { novakidId: lesson.id, managedBy: 'novakid-ext' } }
  };
}

async function createCalendarEvent(token, lesson, childSettings, prefix, calendarId) {
  const event = buildCalendarEvent(lesson, childSettings, prefix);
  const calId = encodeURIComponent(calendarId || 'primary');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  if (!res.ok) throw new Error('Failed to create event');
}

async function updateCalendarEvent(token, eventId, calendarId, fields) {
  const calId = encodeURIComponent(calendarId || 'primary');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields)
  });
  if (!res.ok) throw new Error('Failed to update event');
}

async function deleteCalendarEvent(token, eventId, calendarId) {
  const calId = encodeURIComponent(calendarId || 'primary');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 410) throw new Error('Failed to delete event');
}
