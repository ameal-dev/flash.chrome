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
  scrollHandler = () => deactivate();
  window.addEventListener("scroll", scrollHandler, { once: true });

  state = "SEARCH";
}

function deactivate() {
  if (scrollHandler) {
    window.removeEventListener("scroll", scrollHandler);
    scrollHandler = null;
  }
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
  state = "INACTIVE";
}

function handleKey(e) {
  // Activation toggle — always listen
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

  // From here, we're active — block everything from reaching Vimium
  e.preventDefault();
  e.stopImmediatePropagation();

  if (e.key === "Escape") {
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

    // Only accept single printable characters
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
  }
}

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
  const textNode = match.textNode;
  const offset = match.offset;
  deactivate();
  const selection = window.getSelection();
  selection.collapse(textNode, offset);
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

function getShadowStyles() {
  return `
    .fy-search-bar {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      padding: 8px 12px;
      background: #1a1a2e;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      font-family: monospace;
      font-size: 16px;
      color: #e0e0e0;
      min-width: 200px;
      text-align: left;
    }
    .fy-search-display {
      color: #e0e0e0;
    }
    .fy-cursor {
      display: inline-block;
      width: 8px;
      height: 18px;
      background: #e2b714;
      vertical-align: text-bottom;
      animation: fy-blink 1s step-end infinite;
    }
    @keyframes fy-blink {
      50% { opacity: 0; }
    }
    .fy-no-matches {
      color: #ff6b6b;
      font-family: monospace;
      font-size: 12px;
      padding: 4px 0 0;
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
      color: #888;
      font-family: monospace;
      font-size: 11px;
      padding: 4px 0 0;
    }
  `;
}

// Single capturing listener — registered before Vimium can interfere
document.addEventListener("keydown", handleKey, true);
