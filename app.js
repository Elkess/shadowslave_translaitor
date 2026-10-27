const HOME_URL = "https://shadowslave.space/";
const SETTINGS_KEY = "ss_translator_settings_v1";
const READER_STATE_KEY = "ss_translator_reader_state_v1";
const CACHE_PREFIX = "ss_translator_cache_";

const el = {
  chapterUrl: document.getElementById("chapter-url"),
  loadChapter: document.getElementById("load-chapter"),
  loadRecent: document.getElementById("load-recent"),
  recentChapters: document.getElementById("recent-chapters"),
  useSelected: document.getElementById("use-selected"),
  apiKey: document.getElementById("api-key"),
  baseUrl: document.getElementById("base-url"),
  model: document.getElementById("model"),
  saveSettings: document.getElementById("save-settings"),
  translate: document.getElementById("translate"),
  status: document.getElementById("status"),
  chapterTitle: document.getElementById("chapter-title"),
  sourceText: document.getElementById("source-text"),
  translatedText: document.getElementById("translated-text"),
};

let currentUrl = "";
let currentTitle = "";
let currentSource = "";
let currentTranslated = "";

init();

function init() {
  restoreSettings();
  restoreReaderState();

  el.loadChapter.addEventListener("click", () => {
    loadChapterFromInput();
  });

  el.chapterUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      loadChapterFromInput();
    }
  });

  el.saveSettings.addEventListener("click", saveSettings);

  el.loadRecent.addEventListener("click", async () => {
    try {
      setStatus("Loading recent chapters...");
      const chapters = await fetchRecentChapters();
      populateRecentChapters(chapters);
      setStatus(`Loaded ${chapters.length} chapter links.`);
    } catch (error) {
      setStatus(`Failed to load recent chapters: ${error.message}`);
    }
  });

  el.useSelected.addEventListener("click", () => {
    const url = el.recentChapters.value;
    if (!url) return;
    el.chapterUrl.value = url;
    loadChapter(url);
  });

  el.translate.addEventListener("click", async () => {
    if (!currentSource) {
      setStatus("Load a chapter first.");
      return;
    }

    const settings = getSettings();
    if (!settings.apiKey) {
      setStatus("Add an API key in AI translator settings.");
      return;
    }

    try {
      setStatus("Starting translation...");
      el.translate.disabled = true;

      currentTranslated = await translateTextInChunks(currentSource, settings, (progress) => {
        setStatus(progress);
      });

      el.translatedText.textContent = currentTranslated;
      saveChapterCache(currentUrl, {
        title: currentTitle,
        source: currentSource,
        translated: currentTranslated,
      });
      persistReaderState();
      setStatus("Translation complete.");
    } catch (error) {
      setStatus(`Translation failed: ${error.message}`);
    } finally {
      el.translate.disabled = false;
    }
  });

  let saveTimer;
  window.addEventListener("scroll", () => {
    if (!currentUrl) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistReaderState, 150);
  });
}

function setStatus(message) {
  el.status.textContent = message;
}

function getSettings() {
  return {
    apiKey: el.apiKey.value.trim(),
    baseUrl: (el.baseUrl.value.trim() || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: el.model.value.trim() || "gpt-4o-mini",
  };
}

function saveSettings() {
  const settings = getSettings();
  const payload = {
    baseUrl: settings.baseUrl,
    model: settings.model,
  };

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  el.apiKey.value = "";
  setStatus("Settings saved.");
}

function restoreSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    el.baseUrl.value = "https://api.openai.com/v1";
    el.model.value = "gpt-4o-mini";
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    el.baseUrl.value = parsed.baseUrl || "https://api.openai.com/v1";
    el.model.value = parsed.model || "gpt-4o-mini";
  } catch {
    el.baseUrl.value = "https://api.openai.com/v1";
    el.model.value = "gpt-4o-mini";
  }
}

function persistReaderState() {
  const state = {
    currentUrl,
    scrollY: window.scrollY,
    updatedAt: Date.now(),
  };
  localStorage.setItem(READER_STATE_KEY, JSON.stringify(state));
}

function restoreReaderState() {
  const raw = localStorage.getItem(READER_STATE_KEY);
  if (!raw) return;

  try {
    const state = JSON.parse(raw);
    if (!state.currentUrl) return;

    el.chapterUrl.value = state.currentUrl;
    const cache = getChapterCache(state.currentUrl);
    if (cache) {
      currentUrl = state.currentUrl;
      currentTitle = cache.title || "Original chapter";
      currentSource = cache.source || "";
      currentTranslated = cache.translated || "";
      el.chapterTitle.textContent = currentTitle;
      el.sourceText.textContent = currentSource;
      el.translatedText.textContent = currentTranslated;
      setStatus("Restored last reading session.");
      requestAnimationFrame(() => window.scrollTo({ top: state.scrollY || 0 }));
      return;
    }

    loadChapter(state.currentUrl, state.scrollY || 0);
  } catch {
    // Ignore malformed state
  }
}

function loadChapterFromInput() {
  const url = el.chapterUrl.value.trim();
  if (!url) {
    setStatus("Please enter a chapter URL.");
    return;
  }
  loadChapter(url);
}

async function loadChapter(url, restoreScrollY = 0) {
  try {
    setStatus("Loading chapter content...");
    const cache = getChapterCache(url);
    if (cache && cache.source) {
      currentUrl = url;
      currentTitle = cache.title || "Original chapter";
      currentSource = cache.source || "";
      currentTranslated = cache.translated || "";
      el.chapterTitle.textContent = currentTitle;
      el.sourceText.textContent = currentSource;
      el.translatedText.textContent = currentTranslated;
      persistReaderState();
      setStatus("Loaded chapter from local cache.");
      if (restoreScrollY) {
        requestAnimationFrame(() => window.scrollTo({ top: restoreScrollY }));
      }
      return;
    }

    const html = await fetchWithFallbacks(url);
    const parsed = parseChapter(html);
    if (!parsed.text || parsed.text.length < 200) {
      throw new Error("Could not extract enough chapter text.");
    }

    currentUrl = url;
    currentTitle = parsed.title || "Original chapter";
    currentSource = parsed.text;
    currentTranslated = "";

    el.chapterTitle.textContent = currentTitle;
    el.sourceText.textContent = currentSource;
    el.translatedText.textContent = "";

    saveChapterCache(url, {
      title: currentTitle,
      source: currentSource,
      translated: "",
    });

    persistReaderState();
    setStatus("Chapter loaded. Ready for translation.");

    if (restoreScrollY) {
      requestAnimationFrame(() => window.scrollTo({ top: restoreScrollY }));
    }
  } catch (error) {
    setStatus(`Failed to load chapter: ${error.message}`);
  }
}

async function fetchRecentChapters() {
  const html = await fetchWithFallbacks(HOME_URL);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  const seen = new Set();
  const chapters = [];

  for (const a of anchors) {
    const href = a.getAttribute("href") || "";
    const url = toAbsoluteUrl(HOME_URL, href);
    if (!url) continue;

    if (!/chapter|ch\d+/i.test(url)) continue;
    if (!url.includes("shadowslave.space")) continue;
    if (seen.has(url)) continue;

    seen.add(url);
    chapters.push({
      url,
      label: (a.textContent || "").trim() || url,
    });

    if (chapters.length >= 80) break;
  }

  return chapters;
}

function populateRecentChapters(chapters) {
  el.recentChapters.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a chapter...";
  el.recentChapters.appendChild(placeholder);

  for (const chapter of chapters) {
    const option = document.createElement("option");
    option.value = chapter.url;
    option.textContent = chapter.label;
    el.recentChapters.appendChild(option);
  }
}

async function fetchWithFallbacks(url) {
  const target = url.trim();
  const stripped = target.replace(/^https?:\/\//i, "");

  const endpoints = [
    target,
    `https://r.jina.ai/http://${stripped}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  ];

  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      if (text && text.length > 100) {
        return text;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to fetch content.");
}

function parseChapter(rawText) {
  if (!/<\w+[^>]*>/i.test(rawText)) {
    return {
      title: "Original chapter",
      text: normalizeText(rawText),
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawText, "text/html");

  doc.querySelectorAll("script, style, nav, footer, header, aside, form, button").forEach((el) => el.remove());

  const title =
    (doc.querySelector("h1")?.textContent || "").trim() ||
    (doc.querySelector("title")?.textContent || "").trim() ||
    "Original chapter";

  const candidates = [
    doc.querySelector("article"),
    doc.querySelector(".entry-content"),
    doc.querySelector(".post-content"),
    doc.querySelector(".chapter-content"),
    doc.querySelector("main"),
    doc.body,
  ].filter(Boolean);

  let best = "";
  for (const node of candidates) {
    const text = normalizeText(node.textContent || "");
    if (text.length > best.length) {
      best = text;
    }
  }

  return { title, text: best };
}

function normalizeText(text) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
}

function splitIntoChunks(text, maxChars = 2500) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;

    if ((current + "\n\n" + paragraph).length > maxChars) {
      if (current) {
        chunks.push(current);
      }

      if (paragraph.length > maxChars) {
        for (let i = 0; i < paragraph.length; i += maxChars) {
          chunks.push(paragraph.slice(i, i + maxChars));
        }
        current = "";
      } else {
        current = paragraph;
      }
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

async function translateTextInChunks(text, settings, onProgress) {
  const chunks = splitIntoChunks(text);
  if (!chunks.length) return "";

  const translated = [];
  for (let i = 0; i < chunks.length; i += 1) {
    onProgress(`Translating ${i + 1}/${chunks.length}...`);
    const result = await translateChunk(chunks[i], settings);
    translated.push(result.trim());
  }

  return translated.join("\n\n");
}

async function translateChunk(chunk, settings) {
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + settings.apiKey,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a highly skilled literary translator. Translate English web-novel text into fluent Modern Standard Arabic while preserving tone, names, and chapter structure.",
        },
        {
          role: "user",
          content: chunk,
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`API ${response.status}: ${details.slice(0, 180)}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No translated text returned by API.");
  }

  return content;
}

function toAbsoluteUrl(base, url) {
  try {
    return new URL(url, base).toString();
  } catch {
    return "";
  }
}

function cacheKey(url) {
  return `${CACHE_PREFIX}${encodeURIComponent(url)}`;
}

function saveChapterCache(url, value) {
  if (!url) return;
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify(value));
  } catch {
    // Ignore storage limits
  }
}

function getChapterCache(url) {
  if (!url) return null;
  try {
    const raw = localStorage.getItem(cacheKey(url));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
