'use strict';

// ─── Archive helpers ──────────────────────────────────────────────────────────

function isSubstackPage() {
  if (window.location.hostname.includes('substack.com')) return true;
  const generator = document.querySelector('meta[name="generator"]');
  if (generator && generator.content && generator.content.toLowerCase().includes('substack')) return true;
  if (document.querySelector('div#entry') || document.querySelector('article.post')) return true;
  if (document.querySelector('meta[property="og:site_name"][content*="Substack"]')) return true;
  return false;
}

function getPageInfo() {
  const isSubstack = isSubstackPage();
  const articlePage = isArticlePage();
  const titleEl =
    document.querySelector('h1.post-title') ||
    document.querySelector('h1[class*="post-title"]') ||
    document.querySelector('h1[class*="title"]') ||
    document.querySelector('h1');

  const title = titleEl ? titleEl.textContent.trim() : document.title || 'Untitled Article';
  const authorEl =
    document.querySelector('.byline-names a') ||
    document.querySelector('a[class*="author"]') ||
    document.querySelector('[class*="byline"] a');
  const author = authorEl ? authorEl.textContent.trim() : '';

  return { isSubstack, isArticle: articlePage, title, author, url: window.location.href };
}

// Convert relative/protocol-relative URLs in an HTML string to absolute
function makeAbsoluteURLs(html, base) {
  return html
    .replace(/(src|href|action)="(\/\/[^"]+)"/g, (_, attr, url) => `${attr}="https:${url}"`)
    .replace(/(src|href|action)="(\/[^/"\/][^"]*?)"/g, (_, attr, path) => {
      try { return `${attr}="${new URL(path, base).href}"`; } catch { return _; }
    });
}

// Inline all stylesheets into a single <style> block
async function collectInlineCSS() {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules || []);
      css += rules.map(r => r.cssText).join('\n') + '\n';
    } catch (_) {
      if (sheet.href) {
        try {
          const res = await fetch(sheet.href, { credentials: 'omit' });
          if (res.ok) css += (await res.text()) + '\n';
        } catch (_2) { /* skip unfetchable sheets */ }
      }
    }
  }
  return css;
}

// Build a self-contained HTML archive of the current page
async function buildHTMLArchive() {
  const base = window.location.href;

  let html = document.documentElement.outerHTML;
  html = makeAbsoluteURLs(html, base);

  const inlinedCSS = await collectInlineCSS();

  html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, '');
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<script\b[^>]*\/>/gi, '');

  const archiveMeta = `
<!-- ========================================================
     Archived by SuperSubstack extension
     Source  : ${base}
     Archived: ${new Date().toISOString()}
     ======================================================== -->
<meta name="supersubstack-archive" content="true">
<style id="supersubstack-inline-css">
/* ── Inlined styles ── */
${inlinedCSS}
/* ── Archiver overrides ── */
.subscription-widget, .paywall-container, .metered-paywall,
[class*="subscribe-widget"], [class*="paywall"], .post-paywall,
.modal, .modal-overlay, .cookie-banner { display: none !important; }

/* ── Responsive iframes (YouTube, Vimeo, etc.) ── */
iframe[src*="youtube.com"],
iframe[src*="youtube-nocookie.com"],
iframe[src*="youtu.be"],
iframe[src*="vimeo.com"] {
  display: block;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  aspect-ratio: 16 / 9;
}
</style>`;

  html = html.replace(/<\/head>/i, archiveMeta + '\n</head>');
  return html;
}

// ─── Reader state ─────────────────────────────────────────────────────────────

let settings = {
  progressBar: true,
  bionicReading: false,
  bionicIntensity: 'light',
  fontPreset: 'classic',
  fontSize: '18',
  lineHeight: '1.8',
  contentWidth: '720',
};

const INTENSITY = {
  light:  { boldRatio: 0.35, minLength: 4, weight: 600 },
  medium: { boldRatio: 0.45, minLength: 3, weight: 700 },
  strong: { boldRatio: 0.55, minLength: 2, weight: 800 },
};

// ─── Reader helpers ───────────────────────────────────────────────────────────

function isArticlePage() {
  const path = window.location.pathname;
  if (path.includes('/post/') || path.includes('/p/')) return true;
  return !!(
    document.querySelector('.post-content') ||
    document.querySelector('.body.markup') ||
    document.querySelector('.available-content') ||
    document.querySelector('[class*="post-body"]') ||
    document.querySelector('article')
  );
}

function getArticleElement() {
  return (
    document.querySelector('.post-content') ||
    document.querySelector('.body.markup') ||
    document.querySelector('.available-content') ||
    document.querySelector('[class*="post-body"]') ||
    document.querySelector('article') ||
    document.querySelector('main')
  );
}

// ─── Scroll ───────────────────────────────────────────────────────────────────

let scrollContainer = null;
let articleMetrics = null;

const FONT_PRESETS = {
  classic: 'Georgia, "Times New Roman", serif',
  modern: 'Avenir Next, Avenir, "Segoe UI", sans-serif',
  editorial: 'Iowan Old Style, Palatino, "Book Antiqua", serif',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getArticleHeadings(article) {
  return Array.from(article.querySelectorAll('h2, h3, h4'))
    .map((heading) => ({
      element: heading,
      title: heading.textContent.trim(),
    }))
    .filter((heading) => heading.title);
}

function getArticleMetrics(article) {
  const text = article.innerText || article.textContent || '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return {
    totalWords: words,
    headings: getArticleHeadings(article),
  };
}

function formatMinutes(wordsLeft) {
  const minutes = Math.max(1, Math.ceil(wordsLeft / 220));
  return `${minutes} min left`;
}

function estimateWordsLeft(scrollProgress) {
  if (!articleMetrics) return null;
  return Math.max(0, Math.round(articleMetrics.totalWords * (1 - scrollProgress)));
}

function getCurrentHeading() {
  if (!articleMetrics || !articleMetrics.headings.length) return '';

  const viewportAnchor = window.innerHeight * 0.28;
  let currentTitle = articleMetrics.headings[0].title;

  for (const heading of articleMetrics.headings) {
    const rect = heading.element.getBoundingClientRect();
    if (rect.top <= viewportAnchor) {
      currentTitle = heading.title;
    } else {
      break;
    }
  }

  return currentTitle;
}

function getScrollMetrics() {
  const c = scrollContainer;
  if (!c || c === window) {
    return {
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: window.innerHeight,
    };
  }
  return {
    scrollTop: c.scrollTop,
    scrollHeight: c.scrollHeight,
    clientHeight: c.clientHeight,
  };
}

document.addEventListener('scroll', function (e) {
  const t = e.target;
  if (!t || t === document || t === document.documentElement || t === document.body) {
    scrollContainer = window;
  } else if (t.scrollHeight > t.clientHeight + 5) {
    scrollContainer = t;
  }
  updateProgress();
}, { passive: true, capture: true });

window.addEventListener('resize', updateProgress, { passive: true });

// ─── Progress bar ─────────────────────────────────────────────────────────────

function createProgressBar() {
  if (document.getElementById('sr-progress-container')) return;

  const container = document.createElement('div');
  container.id = 'sr-progress-container';
  const bar = document.createElement('div');
  bar.id = 'sr-progress-bar';
  const label = document.createElement('span');
  label.id = 'sr-progress-label';
  label.textContent = '0%';

  const context = document.createElement('div');
  context.id = 'sr-progress-context';
  context.innerHTML = '<span id="sr-progress-remaining">0 min left</span><span id="sr-progress-divider">•</span><span id="sr-progress-section">Start</span>';

  container.appendChild(bar);
  document.body.appendChild(container);
  document.body.appendChild(label);
  document.body.appendChild(context);
}

function removeProgressBar() {
  document.getElementById('sr-progress-container')?.remove();
  document.getElementById('sr-progress-label')?.remove();
  document.getElementById('sr-progress-context')?.remove();
}

function updateProgress() {
  const bar = document.getElementById('sr-progress-bar');
  const label = document.getElementById('sr-progress-label');
  const remaining = document.getElementById('sr-progress-remaining');
  const section = document.getElementById('sr-progress-section');
  if (!bar) return;

  const { scrollTop, scrollHeight, clientHeight } = getScrollMetrics();
  const scrollable = scrollHeight - clientHeight;
  const pct = scrollable > 0 ? Math.min(100, Math.round((scrollTop / scrollable) * 100)) : 0;
  const progress = scrollable > 0 ? clamp(scrollTop / scrollable, 0, 1) : 0;

  bar.style.width = pct + '%';
  if (label) label.textContent = pct + '%';
  if (remaining) {
    const wordsLeft = estimateWordsLeft(progress);
    remaining.textContent = wordsLeft == null ? '' : formatMinutes(wordsLeft);
  }
  if (section) {
    section.textContent = getCurrentHeading() || 'Reading';
  }
}

function ensureReaderStyleTag() {
  let style = document.getElementById('sr-reader-styles');
  if (!style) {
    style = document.createElement('style');
    style.id = 'sr-reader-styles';
    document.head.appendChild(style);
  }
  return style;
}

function applyTypography(article) {
  const style = ensureReaderStyleTag();
  const fontFamily = FONT_PRESETS[settings.fontPreset] || FONT_PRESETS.classic;
  const fontSize = clamp(Number(settings.fontSize) || 18, 15, 24);
  const lineHeight = clamp(Number(settings.lineHeight) || 1.8, 1.4, 2.2);
  const contentWidth = clamp(Number(settings.contentWidth) || 720, 560, 920);

  article.dataset.srTypography = '1';
  style.textContent = `
    :root {
      --sr-font-family: ${fontFamily};
      --sr-font-size: ${fontSize}px;
      --sr-line-height: ${lineHeight};
      --sr-content-width: ${contentWidth}px;
    }

    [data-sr-typography="1"] {
      font-family: var(--sr-font-family) !important;
      font-size: var(--sr-font-size) !important;
      line-height: var(--sr-line-height) !important;
      max-width: min(calc(100vw - 32px), var(--sr-content-width)) !important;
      margin-left: auto !important;
      margin-right: auto !important;
      letter-spacing: 0.01em;
    }

    [data-sr-typography="1"] p,
    [data-sr-typography="1"] li,
    [data-sr-typography="1"] blockquote {
      font-family: inherit !important;
      font-size: 1em !important;
      line-height: inherit !important;
    }

    [data-sr-typography="1"] h1,
    [data-sr-typography="1"] h2,
    [data-sr-typography="1"] h3,
    [data-sr-typography="1"] h4 {
      letter-spacing: -0.02em;
      line-height: 1.15;
      max-width: 28ch;
    }
  `;
}

// ─── Bionic reading ───────────────────────────────────────────────────────────

function bionicWord(word, cfg) {
  if (word.length < cfg.minLength) return word;
  const boldLen = Math.max(1, Math.ceil(word.length * cfg.boldRatio));
  return `<span class="sr-bold" style="font-weight:${cfg.weight}">${word.slice(0, boldLen)}</span>${word.slice(boldLen)}`;
}

function processTextNode(node, cfg) {
  const text = node.textContent;
  if (!text.trim()) return;
  const parent = node.parentNode;
  if (!parent) return;
  const tag = parent.tagName;
  if (['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(tag)) return;
  if (parent.classList && (parent.classList.contains('sr-bold') || parent.classList.contains('sr-bionic'))) return;

  const span = document.createElement('span');
  span.className = 'sr-bionic';
  span.innerHTML = text.replace(/(\S+)/g, (w) => bionicWord(w, cfg));
  parent.replaceChild(span, node);
}

function injectBionicStyles() {
  if (document.getElementById('sr-bionic-styles')) return;
  const style = document.createElement('style');
  style.id = 'sr-bionic-styles';
  style.textContent = `
    @media (prefers-color-scheme: dark) {
      .sr-bionic { color: rgba(255,255,255,0.65); }
      .sr-bold   { color: #ffffff; }
    }
  `;
  document.head.appendChild(style);
}

function applyBionicReading(container) {
  removeBionicReading(container);
  injectBionicStyles();

  const cfg = INTENSITY[settings.bionicIntensity] || INTENSITY.light;
  container.dataset.srBionic = '1';

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (p.classList && (p.classList.contains('sr-bold') || p.classList.contains('sr-bionic')))
        return NodeFilter.FILTER_REJECT;
      return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach((node) => processTextNode(node, cfg));
}

function removeBionicReading(container) {
  container.querySelectorAll('.sr-bionic').forEach((el) => {
    el.replaceWith(document.createTextNode(el.textContent));
  });
  delete container.dataset.srBionic;
}

// ─── Apply settings ───────────────────────────────────────────────────────────

function applySettings() {
  const article = getArticleElement();

  if (article) {
    articleMetrics = getArticleMetrics(article);
  }

  if (settings.progressBar) {
    createProgressBar();
    updateProgress();
  } else {
    removeProgressBar();
  }

  if (article) {
    applyTypography(article);

    if (settings.bionicReading) {
      applyBionicReading(article);
    } else {
      removeBionicReading(article);
    }
  }
}

function loadSettings() {
  chrome.storage.sync.get(
    ['progressBar', 'bionicReading', 'bionicIntensity', 'fontPreset', 'fontSize', 'lineHeight', 'contentWidth'],
    (result) => {
      settings.progressBar = result.progressBar !== false;
      settings.bionicReading = result.bionicReading === true;
      settings.bionicIntensity = result.bionicIntensity || 'light';
      settings.fontPreset = result.fontPreset || 'classic';
      settings.fontSize = result.fontSize || '18';
      settings.lineHeight = result.lineHeight || '1.8';
      settings.contentWidth = result.contentWidth || '720';
      applySettings();
    }
  );
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Archive messages
  switch (msg.action) {
    case 'ping':
      sendResponse({ alive: true });
      return;

    case 'getPageInfo':
      sendResponse(getPageInfo());
      return;

    case 'collectHTML':
      buildHTMLArchive()
        .then(html => sendResponse({ html, title: document.title || 'article' }))
        .catch(err => sendResponse({ error: err.message }));
      return true; // keep channel open for async response
  }

  // Reader messages
  if (msg.type === 'SETTINGS_CHANGED') {
    Object.assign(settings, msg.settings);
    applySettings();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

if (isSubstackPage()) {
  if (isArticlePage()) {
    loadSettings();
  } else {
    const observer = new MutationObserver(() => {
      if (isArticlePage() && !document.getElementById('sr-progress-container')) {
        loadSettings();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}
