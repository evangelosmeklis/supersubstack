'use strict';

const SETTINGS_KEYS = [
  'progressBar',
  'bionicReading',
  'bionicIntensity',
  'fontPreset',
  'fontSize',
  'lineHeight',
  'contentWidth',
];

const DEFAULT_SETTINGS = {
  progressBar: true,
  bionicReading: false,
  bionicIntensity: 'light',
  fontPreset: 'classic',
  fontSize: '18',
  lineHeight: '1.8',
  contentWidth: '720',
};

let currentTab = null;
let currentPageInfo = null;
let readingList = [];

// ─── Reader settings ──────────────────────────────────────────────────────────

chrome.storage.sync.get(SETTINGS_KEYS, (result) => {
  const settings = { ...DEFAULT_SETTINGS, ...result };

  applySettingsToControls(settings);
});

function applySettingsToControls(settings) {
  document.getElementById('progressBar').checked = settings.progressBar !== false;
  document.getElementById('bionicReading').checked = settings.bionicReading === true;
  document.getElementById('fontPreset').value = settings.fontPreset;
  document.getElementById('fontSize').value = settings.fontSize;
  document.getElementById('lineHeight').value = settings.lineHeight;
  document.getElementById('contentWidth').value = settings.contentWidth;

  updateIntensityUI(settings.bionicIntensity || 'light');
  updateIntensityVisibility();
  updateRangeValue('fontSize', `${settings.fontSize} px`);
  updateRangeValue('lineHeight', settings.lineHeight);
  updateRangeValue('contentWidth', `${settings.contentWidth} px`);
}

function updateIntensityVisibility() {
  const on = document.getElementById('bionicReading').checked;
  document.getElementById('bionicIntensity').style.display = on ? 'flex' : 'none';
}

function updateIntensityUI(intensity) {
  document.querySelectorAll('#bionicIntensity button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.intensity === intensity);
  });
}

function updateRangeValue(id, value) {
  const el = document.getElementById(`${id}Value`);
  if (el) el.textContent = value;
}

function notifyReader(settings) {
  chrome.storage.sync.set(settings);

  if (!currentTab?.id) return;

  chrome.tabs.sendMessage(currentTab.id, { type: 'SETTINGS_CHANGED', settings }, () => {
    void chrome.runtime.lastError;
  });
}

document.getElementById('progressBar').addEventListener('change', () => {
  notifyReader({ progressBar: document.getElementById('progressBar').checked });
});

document.getElementById('bionicReading').addEventListener('change', () => {
  updateIntensityVisibility();
  notifyReader({ bionicReading: document.getElementById('bionicReading').checked });
});

document.querySelectorAll('#bionicIntensity button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const intensity = btn.dataset.intensity;
    updateIntensityUI(intensity);
    notifyReader({ bionicIntensity: intensity });
  });
});

document.getElementById('fontPreset').addEventListener('change', (event) => {
  notifyReader({ fontPreset: event.target.value });
});

document.getElementById('fontSize').addEventListener('input', (event) => {
  updateRangeValue('fontSize', `${event.target.value} px`);
  notifyReader({ fontSize: event.target.value });
});

document.getElementById('lineHeight').addEventListener('input', (event) => {
  updateRangeValue('lineHeight', event.target.value);
  notifyReader({ lineHeight: event.target.value });
});

document.getElementById('contentWidth').addEventListener('input', (event) => {
  updateRangeValue('contentWidth', `${event.target.value} px`);
  notifyReader({ contentWidth: event.target.value });
});

document.getElementById('resetTypography').addEventListener('click', () => {
  const typographyDefaults = {
    fontPreset: DEFAULT_SETTINGS.fontPreset,
    fontSize: DEFAULT_SETTINGS.fontSize,
    lineHeight: DEFAULT_SETTINGS.lineHeight,
    contentWidth: DEFAULT_SETTINGS.contentWidth,
  };

  applySettingsToControls({
    ...DEFAULT_SETTINGS,
    progressBar: document.getElementById('progressBar').checked,
    bionicReading: document.getElementById('bionicReading').checked,
    bionicIntensity:
      document.querySelector('#bionicIntensity button.active')?.dataset.intensity || DEFAULT_SETTINGS.bionicIntensity,
    ...typographyDefaults,
  });

  notifyReader(typographyDefaults);
});

// ─── Archive utilities ────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120)
    .trim() || 'article';
}

function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;');
}

function setArchiveStatus(msg, type = 'info') {
  const el = document.getElementById('archive-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `archive-status visible ${type}`;
}

function clearArchiveStatus() {
  const el = document.getElementById('archive-status');
  if (el) el.className = 'archive-status';
}

// ─── Archive UI ───────────────────────────────────────────────────────────────

function renderNotSubstack() {
  document.getElementById('archive-content').innerHTML = `
    <div class="not-substack">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/>
      </svg>
      Navigate to a Substack article to archive it.
    </div>`;
}

function renderArchiveUI(info) {
  const meta = [info.author, new URL(info.url).hostname].filter(Boolean).join(' · ');
  const defaultFilename = sanitizeFilename(info.title);

  document.getElementById('archive-content').innerHTML = `
    <div class="article-info">
      <div class="article-title" title="${escapeAttr(info.title)}">${escapeHTML(info.title)}</div>
      <div class="article-meta">${escapeHTML(meta)}</div>
    </div>
    <div class="filename-row">
      <label class="filename-label" for="filename-input">Filename</label>
      <div class="filename-input-wrap">
        <input
          id="filename-input"
          class="filename-input"
          type="text"
          value="${escapeAttr(defaultFilename)}"
          spellcheck="false"
          autocomplete="off"
        >
        <span class="filename-ext">.html</span>
      </div>
    </div>
    <button class="btn-archive" id="btn-archive">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <div class="btn-label">
        <span class="btn-title">Download HTML</span>
        <span class="btn-sub">Self-contained file, opens offline</span>
      </div>
    </button>
    <div class="archive-status" id="archive-status"></div>`;

  document.getElementById('btn-archive').addEventListener('click', downloadHTML);
}

// ─── Reading list ─────────────────────────────────────────────────────────────

function getReadingListStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['readingList'], (result) => {
      resolve(Array.isArray(result.readingList) ? result.readingList : []);
    });
  });
}

function setReadingListStorage(list) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ readingList: list }, resolve);
  });
}

function formatSavedDate(savedAt) {
  return new Date(savedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function isCurrentSaved() {
  if (!currentPageInfo?.url) return false;
  return readingList.some((item) => item.url === currentPageInfo.url);
}

function updateReadingListButton() {
  const button = document.getElementById('saveToReadingList');
  if (!button) return;

  if (!currentPageInfo?.isSubstack || !currentPageInfo?.isArticle) {
    button.textContent = 'Open a Substack article to save it';
    button.disabled = true;
    button.classList.remove('active');
    return;
  }

  const saved = isCurrentSaved();
  button.disabled = false;
  button.textContent = saved ? 'Saved to reading list' : 'Save current article';
  button.classList.toggle('active', saved);
}

function renderReadingList() {
  const listEl = document.getElementById('readingList');
  if (!listEl) return;

  if (!readingList.length) {
    listEl.innerHTML = '<div class="reading-list-empty">Save articles here so you can come back to long reads later.</div>';
    updateReadingListButton();
    return;
  }

  listEl.innerHTML = readingList
    .slice()
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .map((item) => {
      const meta = [item.author, item.hostname, formatSavedDate(item.savedAt)].filter(Boolean).join(' · ');
      return `
        <div class="reading-item" data-url="${escapeAttr(item.url)}">
          <div class="reading-item-title">${escapeHTML(item.title)}</div>
          <div class="reading-item-meta">${escapeHTML(meta)}</div>
          <div class="reading-item-actions">
            <button type="button" data-action="open" data-url="${escapeAttr(item.url)}">Open</button>
            <button type="button" data-action="remove" data-url="${escapeAttr(item.url)}">Remove</button>
          </div>
        </div>`;
    })
    .join('');

  updateReadingListButton();
}

async function loadReadingList() {
  readingList = await getReadingListStorage();
  renderReadingList();
}

async function toggleCurrentArticleInReadingList() {
  if (!currentPageInfo?.isSubstack || !currentPageInfo?.isArticle) return;

  const existing = readingList.find((item) => item.url === currentPageInfo.url);
  if (existing) {
    readingList = readingList.filter((item) => item.url !== currentPageInfo.url);
  } else {
    readingList.push({
      title: currentPageInfo.title,
      author: currentPageInfo.author,
      url: currentPageInfo.url,
      hostname: new URL(currentPageInfo.url).hostname,
      savedAt: new Date().toISOString(),
    });
  }

  await setReadingListStorage(readingList);
  renderReadingList();
}

document.getElementById('saveToReadingList').addEventListener('click', toggleCurrentArticleInReadingList);

document.getElementById('readingList').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, url } = button.dataset;
  if (action === 'open') {
    await chrome.tabs.create({ url });
    return;
  }

  if (action === 'remove') {
    readingList = readingList.filter((item) => item.url !== url);
    await setReadingListStorage(readingList);
    renderReadingList();
  }
});

// ─── Archive download ─────────────────────────────────────────────────────────

async function downloadHTML() {
  clearArchiveStatus();
  const btn = document.getElementById('btn-archive');
  const btnTitle = btn.querySelector('.btn-title');
  btn.disabled = true;
  const origTitle = btnTitle.textContent;
  btnTitle.textContent = 'Working...';
  setArchiveStatus('Collecting page content...', 'info');

  const tab = currentTab;
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (_) {
    // already injected
  }

  chrome.tabs.sendMessage(tab.id, { action: 'collectHTML' }, async (response) => {
    if (chrome.runtime.lastError || !response) {
      setArchiveStatus('Could not reach page. Try reloading the tab.', 'error');
      btn.disabled = false;
      btnTitle.textContent = origTitle;
      return;
    }

    if (response.error) {
      setArchiveStatus(`Error: ${response.error}`, 'error');
      btn.disabled = false;
      btnTitle.textContent = origTitle;
      return;
    }

    const inputEl = document.getElementById('filename-input');
    const rawName = inputEl ? inputEl.value.trim() : '';
    const filename = `${sanitizeFilename(rawName) || 'article'}.html`;

    setArchiveStatus('Saving file...', 'info');

    chrome.runtime.sendMessage(
      { action: 'triggerHTMLDownload', html: response.html, filename },
      (dlResponse) => {
        btn.disabled = false;
        btnTitle.textContent = origTitle;
        if (chrome.runtime.lastError || !dlResponse?.success) {
          setArchiveStatus('Download failed. Check browser download settings.', 'error');
        } else {
          setArchiveStatus(`Saved as "${filename}"`, 'success');
        }
      }
    );
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadReadingList();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab || null;

  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('brave://')) {
    renderNotSubstack();
    updateReadingListButton();
    return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (_) {
    // already present
  }

  chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' }, (info) => {
    if (chrome.runtime.lastError || !info || !info.isSubstack || !info.isArticle) {
      currentPageInfo = null;
      renderNotSubstack();
      updateReadingListButton();
      return;
    }

    currentPageInfo = info;
    renderArchiveUI(info);
    updateReadingListButton();
  });
}

document.addEventListener('DOMContentLoaded', init);
