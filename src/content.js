// Content script - runs on NovaKid schedule page
(function () {
  'use strict';

  // Support multiple languages for month names (NovaKid may display in different locales)
  const MONTH_MAPS = {
    pl: {
      'styczeń': 1, 'luty': 2, 'marzec': 3, 'kwiecień': 4,
      'maj': 5, 'czerwiec': 6, 'lipiec': 7, 'sierpień': 8,
      'wrzesień': 9, 'październik': 10, 'listopad': 11, 'grudzień': 12
    },
    en: {
      'january': 1, 'february': 2, 'march': 3, 'april': 4,
      'may': 5, 'june': 6, 'july': 7, 'august': 8,
      'september': 9, 'october': 10, 'november': 11, 'december': 12
    },
    de: {
      'januar': 1, 'februar': 2, 'märz': 3, 'april': 4,
      'mai': 5, 'juni': 6, 'juli': 7, 'august': 8,
      'september': 9, 'oktober': 10, 'november': 11, 'dezember': 12
    },
    es: {
      'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
      'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
      'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    },
    fr: {
      'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4,
      'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8,
      'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12
    },
    it: {
      'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4,
      'maggio': 5, 'giugno': 6, 'luglio': 7, 'agosto': 8,
      'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
    },
    pt: {
      'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4,
      'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
      'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12
    },
    tr: {
      'ocak': 1, 'şubat': 2, 'mart': 3, 'nisan': 4,
      'mayıs': 5, 'haziran': 6, 'temmuz': 7, 'ağustos': 8,
      'eylül': 9, 'ekim': 10, 'kasım': 11, 'aralık': 12
    },
    zh: {
      '一月': 1, '二月': 2, '三月': 3, '四月': 4,
      '五月': 5, '六月': 6, '七月': 7, '八月': 8,
      '九月': 9, '十月': 10, '十一月': 11, '十二月': 12
    },
    ja: {
      '1月': 1, '2月': 2, '3月': 3, '4月': 4,
      '5月': 5, '6月': 6, '7月': 7, '8月': 8,
      '9月': 9, '10月': 10, '11月': 11, '12月': 12
    }
  };

  // Build a unified month lookup from all languages
  const MONTH_MAP = {};
  for (const langMap of Object.values(MONTH_MAPS)) {
    for (const [name, num] of Object.entries(langMap)) {
      MONTH_MAP[name] = num;
    }
  }

  // Default colors per child (can be overridden in extension settings)
  const CHILD_COLORS = {
    'Jan': '#4D96FF',
    'Łucja': '#FFD93D',
    'Piotr': '#6BCB77',
  };

  // Detect which language the page is using for month names
  let detectedPageLang = null;

  function detectPageLanguage() {
    const h5s = document.querySelectorAll('h5, .MuiTypography-h5');
    for (const h5 of h5s) {
      const text = h5.textContent.trim().toLowerCase();
      for (const [lang, map] of Object.entries(MONTH_MAPS)) {
        if (map[text] !== undefined) {
          detectedPageLang = lang;
          return lang;
        }
      }
    }
    return null;
  }

  window.__novakidValidateStructure = function () {
    const cards = document.querySelectorAll('.MuiCardHeader-root');
    if (cards.length === 0) return { valid: false, reason: 'noCards' };

    let hasTime = false;
    for (const card of cards) {
      if (/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/.test(card.textContent)) {
        hasTime = true;
        break;
      }
    }
    if (!hasTime) return { valid: false, reason: 'noTimePattern' };

    const h5s = document.querySelectorAll('h5, .MuiTypography-h5');
    let hasMonth = false;
    for (const h5 of h5s) {
      if (MONTH_MAP[h5.textContent.trim().toLowerCase()] !== undefined) {
        hasMonth = true;
        break;
      }
    }
    if (!hasMonth) return { valid: false, reason: 'noMonthNames' };

    return { valid: true };
  };

  window.__novakidExtract = function () {
    try {
      const validation = window.__novakidValidateStructure();
      if (!validation.valid) {
        return { error: validation.reason, structureChanged: true };
      }
      detectPageLanguage();
      return extractLessons();
    } catch (e) {
      return { error: 'extractionError', errorParams: { message: e.message }, structureChanged: true };
    }
  };

  function extractLessons() {
    const lessons = [];
    const now = new Date();
    let currentYear = now.getFullYear();
    let prevMonthNum = 0;

    let currentMonth = null;
    let currentDay = null;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.matches && node.matches('h5, .MuiTypography-h5')) {
        const text = node.textContent.trim().toLowerCase();
        if (MONTH_MAP[text] !== undefined) {
          currentMonth = MONTH_MAP[text];
          if (currentMonth < prevMonthNum) {
            currentYear++;
          }
          prevMonthNum = currentMonth;
          currentDay = null;
          continue;
        }
        const dayMatch = node.textContent.trim().match(/^(\d{1,2})$/);
        if (dayMatch && currentMonth) {
          currentDay = dayMatch[1].padStart(2, '0');
          continue;
        }
      }

      if (node.matches && node.matches('.MuiCardHeader-root') && currentMonth && currentDay) {
        const cardText = node.textContent || '';
        const timeMatch = cardText.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
        if (!timeMatch) continue;

        const infoEl = node.querySelector('.MuiTypography-body2, [class*="MuiTypography-body2"]');
        let childName = '__unknown__';
        let teacher = '';

        if (infoEl) {
          const infoText = infoEl.textContent.trim();
          // Support multiple separator words for child/teacher split
          // PL: "X i Y", EN: "X and Y", etc.
          const separators = [' i ', ' and ', ' und ', ' y ', ' et ', ' e ', '\u548c', '\u3068'];
          let splitDone = false;
          for (const sep of separators) {
            const idx = infoText.indexOf(sep);
            if (idx !== -1) {
              childName = infoText.substring(0, idx) || '__unknown__';
              teacher = infoText.substring(idx + sep.length) || '';
              splitDone = true;
              break;
            }
          }
          if (!splitDone) {
            childName = infoText || '__unknown__';
          }
        }

        let lessonType = '';
        const cardContainer = node.closest('[class*="MuiButtonBase-root"]') || node.parentElement;
        if (cardContainer) {
          const captions = cardContainer.querySelectorAll('.MuiTypography-caption, [class*="MuiTypography-caption"]');
          for (const cap of captions) {
            const capText = cap.textContent.trim();
            if (capText === 'Jednorazowo' || capText === 'Cotygodniowo' ||
                capText === 'One-time' || capText === 'Weekly' ||
                capText === 'Einmalig' || capText === 'Wöchentlich') {
              lessonType = capText;
              break;
            }
          }
        }

        const monthStr = String(currentMonth).padStart(2, '0');
        const dateStr = `${currentYear}-${monthStr}-${currentDay}`;

        lessons.push({
          childName,
          teacher,
          date: dateStr,
          timeStart: timeMatch[1],
          timeEnd: timeMatch[2],
          type: lessonType,
          id: `${childName}-${dateStr}-${timeMatch[1]}`,
          color: CHILD_COLORS[childName] || '#FF6B00'
        });
      }
    }

    if (lessons.length === 0) {
      return { error: 'noLessonsFound' };
    }

    return lessons;
  }

  // Auto-sync on page load
  function autoSyncOnLoad() {
    setTimeout(() => {
      chrome.storage.local.get(['structureBroken'], (data) => {
        if (data.structureBroken) return;
        const lessons = window.__novakidExtract();
        if (lessons.error || lessons.structureChanged) {
          if (lessons.structureChanged) {
            chrome.storage.local.set({ structureBroken: true });
            chrome.runtime.sendMessage({ type: 'structureBroken' });
          }
          return;
        }
        chrome.runtime.sendMessage({ type: 'autoSyncLessons', lessons });
      });
    }, 3000);
  }

  autoSyncOnLoad();

  // SPA navigation detection
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.href.includes('/parent/schedule')) {
        autoSyncOnLoad();
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
