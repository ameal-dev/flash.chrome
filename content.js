const HINT_CHARS = "asdfghjkl";
const MIN_SEARCH_LENGTH = 2;
const MAX_HINTS = 81;

let state = "INACTIVE";
let shadowHost = null;
let shadowRoot = null;
let searchDisplay = null;
let searchQuery = "";
let currentMatches = [];
let hintLabels = [];
let hintInput = "";
let scrollHandler = null;
let vimiumDecoy = null;
let visualAnchor = null; // {node, offset} where caret was placed
let statusBar = null;
let caretIndicator = null;

function activate() {
  if (state !== "INACTIVE") return;

  shadowHost = document.createElement("div");
  shadowHost.id = "flash-yank-host";
  shadowRoot = shadowHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = getShadowStyles();
  shadowRoot.appendChild(style);

  const searchBar = document.createElement("div");
  searchBar.className = "fy-search-bar";

  searchDisplay = document.createElement("span");
  searchDisplay.className = "fy-search-display";
  searchDisplay.textContent = "";

  const cursor = document.createElement("span");
  cursor.className = "fy-cursor";

  searchBar.appendChild(searchDisplay);
  searchBar.appendChild(cursor);
  shadowRoot.appendChild(searchBar);
  document.body.appendChild(shadowHost);

  searchQuery = "";

  vimiumDecoy = document.createElement("input");
  vimiumDecoy.style.cssText = "position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(vimiumDecoy);
  vimiumDecoy.focus();

  scrollHandler = () => deactivate();
  window.addEventListener("scroll", scrollHandler, { once: true });

  state = "SEARCH";
}

function enterVisualMode(textNode, offset) {
  // Clean up search UI but keep shadowHost for status bar + caret
  clearOverlays();
  const searchBar = shadowRoot.querySelector(".fy-search-bar");
  if (searchBar) searchBar.remove();

  // Place caret
  const selection = window.getSelection();
  selection.collapse(textNode, offset);
  visualAnchor = { node: textNode, offset };

  // Show blinking caret indicator at jump target
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.setEnd(textNode, offset);
  const rect = range.getBoundingClientRect();
  caretIndicator = document.createElement("div");
  caretIndicator.className = "fy-caret-indicator";
  caretIndicator.style.top = `${rect.top}px`;
  caretIndicator.style.left = `${rect.left}px`;
  caretIndicator.style.height = `${rect.height || 18}px`;
  shadowRoot.appendChild(caretIndicator);

  // Show status bar
  statusBar = document.createElement("div");
  statusBar.className = "fy-status-bar";
  statusBar.textContent = "-- VISUAL -- move: w b e h l j k  yank: y  escape: quit";
  shadowRoot.appendChild(statusBar);

  state = "VISUAL";
}

function deactivate() {
  if (scrollHandler) {
    window.removeEventListener("scroll", scrollHandler);
    scrollHandler = null;
  }
  if (vimiumDecoy && vimiumDecoy.parentNode) {
    vimiumDecoy.parentNode.removeChild(vimiumDecoy);
  }
  vimiumDecoy = null;
  if (shadowHost && shadowHost.parentNode) {
    shadowHost.parentNode.removeChild(shadowHost);
  }
  shadowHost = null;
  shadowRoot = null;
  searchDisplay = null;
  searchQuery = "";
  currentMatches = [];
  hintLabels = [];
  hintInput = "";
  visualAnchor = null;
  statusBar = null;
  caretIndicator = null;
  state = "INACTIVE";
}

function handleKey(e) {
  if (e.code === "KeyB" && e.metaKey && e.ctrlKey && e.altKey && e.shiftKey) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (state === "INACTIVE") {
      activate();
    } else {
      deactivate();
    }
    return;
  }

  if (state === "INACTIVE") return;

  e.preventDefault();
  e.stopImmediatePropagation();

  if (e.key === "Escape") {
    if (state === "VISUAL") {
      window.getSelection().removeAllRanges();
    }
    deactivate();
    return;
  }

  if (state === "SEARCH") {
    if (e.key === "Backspace") {
      searchQuery = searchQuery.slice(0, -1);
      updateSearchDisplay();
      onQueryChanged();
      return;
    }

    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      searchQuery += e.key;
      updateSearchDisplay();
      onQueryChanged();
    }
    return;
  }

  if (state === "HINT_SELECTION") {
    if (e.key === "Backspace") {
      if (hintInput.length > 0) {
        hintInput = hintInput.slice(0, -1);
        updateHintHighlights();
      } else {
        exitHintMode();
      }
      return;
    }

    const char = e.key.toLowerCase();
    if (!HINT_CHARS.includes(char)) return;

    hintInput += char;

    const exactMatch = hintLabels.findIndex((label) => label === hintInput);
    if (exactMatch !== -1) {
      selectMatch(currentMatches[exactMatch]);
      return;
    }

    const hasPrefix = hintLabels.some((label) => label.startsWith(hintInput));
    if (!hasPrefix) {
      hintInput = hintInput.slice(0, -1);
      return;
    }

    updateHintHighlights();
    return;
  }

  if (state === "VISUAL") {
    handleVisualKey(e.key);
  }
}

// --- Visual mode ---

function handleVisualKey(key) {
  const selection = window.getSelection();
  if (!selection.rangeCount) {
    deactivate();
    return;
  }

  if (key === "y") {
    yankSelection(selection);
    return;
  }

  // Movement keys extend the selection
  const moveFn = VISUAL_MOVEMENTS[key];
  if (moveFn) {
    moveFn(selection);
  }
}

function yankSelection(selection) {
  const text = selection.toString();
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      showYankFeedback(text.length);
    }).catch(() => {
      // Fallback: execCommand
      document.execCommand("copy");
      showYankFeedback(text.length);
    });
  }
  selection.removeAllRanges();
  deactivate();
}

function showYankFeedback(charCount) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:8px 20px;background:#faf8f5;color:#2c2c2c;font-family:monospace;font-size:14px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15),0 1px 4px rgba(0,0,0,0.1);";
  el.textContent = `Yanked ${charCount} chars`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function moveSelection(selection, direction, granularity) {
  selection.modify("extend", direction, granularity);
}

const VISUAL_MOVEMENTS = {
  l: (sel) => moveSelection(sel, "forward", "character"),
  h: (sel) => moveSelection(sel, "backward", "character"),
  w: (sel) => moveSelection(sel, "forward", "word"),
  b: (sel) => moveSelection(sel, "backward", "word"),
  e: (sel) => {
    // forward to end of word: move forward by word, then back one char
    // selection.modify "forward" "word" goes to start of next word
    // so we do forward word then backward character to land at word end
    moveSelection(sel, "forward", "word");
  },
  j: (sel) => moveSelection(sel, "forward", "line"),
  k: (sel) => moveSelection(sel, "backward", "line"),
  "0": (sel) => moveSelection(sel, "backward", "lineboundary"),
  $: (sel) => moveSelection(sel, "forward", "lineboundary"),
};

// --- Search/hint functions ---

function updateSearchDisplay() {
  if (!searchDisplay) return;
  searchDisplay.textContent = searchQuery || "";
}

function onQueryChanged() {
  if (searchQuery.length < MIN_SEARCH_LENGTH) {
    if (state === "HINT_SELECTION") {
      exitHintMode();
    }
    clearOverlays();
    return;
  }

  const matches = findVisibleMatches(searchQuery);
  if (matches.length === 0) {
    clearOverlays();
    const msg = document.createElement("div");
    msg.className = "fy-no-matches";
    msg.textContent = "No matches";
    shadowRoot.querySelector(".fy-search-bar").appendChild(msg);
    if (state === "HINT_SELECTION") {
      exitHintMode();
    }
    return;
  }

  enterHintMode(matches);
}

function updateHintHighlights() {
  const labels = shadowRoot.querySelectorAll(".fy-hint-label");
  labels.forEach((el, i) => {
    const label = hintLabels[i];
    if (hintInput && !label.startsWith(hintInput)) {
      el.style.opacity = "0.2";
    } else {
      el.style.opacity = "1";
    }
  });
}

function selectMatch(match) {
  enterVisualMode(match.textNode, match.offset);
}

function clearOverlays() {
  if (!shadowRoot) return;
  shadowRoot.querySelectorAll(".fy-hint-label, .fy-highlight, .fy-no-matches, .fy-overflow-msg").forEach((el) => el.remove());
}

function renderHints(matches) {
  const count = Math.min(matches.length, MAX_HINTS);
  hintLabels = generateHintLabels(count);

  for (let i = 0; i < count; i++) {
    const match = matches[i];
    const rect = match.rect;

    const highlight = document.createElement("div");
    highlight.className = "fy-highlight";
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    shadowRoot.appendChild(highlight);

    const label = document.createElement("div");
    label.className = "fy-hint-label";
    label.textContent = hintLabels[i].toUpperCase();
    label.style.top = `${rect.top - 16}px`;
    label.style.left = `${rect.left}px`;
    shadowRoot.appendChild(label);
  }

  if (matches.length > MAX_HINTS) {
    const msg = document.createElement("div");
    msg.className = "fy-overflow-msg";
    msg.textContent = `${matches.length - MAX_HINTS} more — refine your search`;
    shadowRoot.querySelector(".fy-search-bar").appendChild(msg);
  }
}

function enterHintMode(matches) {
  clearOverlays();
  currentMatches = matches;
  hintInput = "";
  renderHints(matches);
  state = "HINT_SELECTION";
}

function exitHintMode() {
  clearOverlays();
  currentMatches = [];
  hintLabels = [];
  hintInput = "";
  state = "SEARCH";
}

// --- Text matching ---

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

function isElementVisible(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isInViewport(rect) {
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

function findVisibleMatches(query) {
  const matches = [];
  const lowerQuery = query.toLowerCase();
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (shadowHost && shadowHost.contains(node)) return NodeFilter.FILTER_REJECT;
        if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let textNode;
  while ((textNode = walker.nextNode())) {
    const text = textNode.textContent.toLowerCase();
    let startIndex = 0;
    while (true) {
      const index = text.indexOf(lowerQuery, startIndex);
      if (index === -1) break;

      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + query.length);
      const rect = range.getBoundingClientRect();

      if (isInViewport(rect)) {
        matches.push({ textNode, offset: index, range, rect });
      }

      startIndex = index + 1;
    }
  }

  matches.sort((a, b) => {
    if (Math.abs(a.rect.top - b.rect.top) < 5) {
      return a.rect.left - b.rect.left;
    }
    return a.rect.top - b.rect.top;
  });

  return matches;
}

function generateHintLabels(count) {
  const labels = [];
  const chars = HINT_CHARS.split("");

  for (const c of chars) {
    labels.push(c);
    if (labels.length >= count) return labels;
  }

  for (const c1 of chars) {
    for (const c2 of chars) {
      labels.push(c1 + c2);
      if (labels.length >= count) return labels;
    }
  }

  return labels;
}

// --- Styles ---

function getShadowStyles() {
  return `
    .fy-search-bar {
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      padding: 10px 16px;
      background: #faf8f5;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1);
      font-family: monospace;
      font-size: 16px;
      color: #2c2c2c;
      min-width: 220px;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 0;
    }
    .fy-search-display {
      color: #2c2c2c;
    }
    .fy-cursor {
      display: inline-block;
      width: 2px;
      height: 20px;
      background: #d4860b;
      vertical-align: text-bottom;
      animation: fy-blink 1s step-end infinite;
      border-radius: 1px;
      margin-left: 1px;
    }
    @keyframes fy-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    .fy-caret-indicator {
      position: fixed;
      z-index: 2147483647;
      width: 2px;
      background: #d4860b;
      border-radius: 1px;
      pointer-events: none;
      animation: fy-blink 1s step-end infinite;
    }
    .fy-no-matches {
      color: #c44;
      font-family: monospace;
      font-size: 12px;
      padding: 4px 0 0 8px;
    }
    .fy-hint-label {
      position: fixed;
      z-index: 2147483647;
      font-family: monospace;
      font-size: 12px;
      font-weight: bold;
      line-height: 1;
      padding: 1px 4px;
      background: #e2b714;
      color: #1a1a2e;
      border-radius: 3px;
      pointer-events: none;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    }
    .fy-highlight {
      position: fixed;
      z-index: 2147483646;
      background: rgba(226, 183, 20, 0.3);
      pointer-events: none;
      border-radius: 2px;
    }
    .fy-overflow-msg {
      color: #999;
      font-family: monospace;
      font-size: 11px;
      padding: 4px 0 0 8px;
    }
    .fy-status-bar {
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      padding: 8px 20px;
      background: #faf8f5;
      color: #2c2c2c;
      font-family: monospace;
      font-size: 13px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1);
      white-space: nowrap;
    }
  `;
}

// Register on window in capture phase — fires before Vimium's document listeners
window.addEventListener("keydown", handleKey, true);
