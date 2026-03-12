const HINT_CHARS = "asdfghjkl";
const MIN_SEARCH_LENGTH = 2;

const MAX_HINTS = 81;

let state = "INACTIVE";
let shadowHost = null;
let shadowRoot = null;
let searchInput = null;
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

  searchInput = document.createElement("input");
  searchInput.className = "fy-search-input";
  searchInput.type = "text";
  searchInput.placeholder = "Flash Yank...";
  searchInput.setAttribute("autocomplete", "off");
  searchInput.setAttribute("spellcheck", "false");

  searchBar.appendChild(searchInput);
  shadowRoot.appendChild(searchBar);
  document.body.appendChild(shadowHost);

  searchInput.addEventListener("keydown", handleSearchKeydown);
  searchInput.addEventListener("input", handleSearchInput);
  searchInput.focus();

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
  searchInput = null;
  state = "INACTIVE";
}

function handleSearchKeydown(e) {
  e.stopPropagation();

  if (e.key === "Escape") {
    e.preventDefault();
    deactivate();
    return;
  }

  if (state === "HINT_SELECTION") {
    e.preventDefault();

    if (e.key === "Backspace") {
      if (hintInput.length > 0) {
        hintInput = hintInput.slice(0, -1);
        updateHintHighlights();
      } else {
        // Return to search mode (keep current query intact)
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

    // Check if input is a prefix of any remaining label
    const hasPrefix = hintLabels.some((label) => label.startsWith(hintInput));
    if (!hasPrefix) {
      hintInput = hintInput.slice(0, -1);
      return;
    }

    updateHintHighlights();
  }
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
  deactivate();
  const selection = window.getSelection();
  selection.collapse(match.textNode, match.offset);
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

    // Highlight overlay
    const highlight = document.createElement("div");
    highlight.className = "fy-highlight";
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    shadowRoot.appendChild(highlight);

    // Hint label
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
  searchInput.readOnly = true;
  state = "HINT_SELECTION";
}

function exitHintMode() {
  clearOverlays();
  currentMatches = [];
  hintLabels = [];
  hintInput = "";
  searchInput.readOnly = false;
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

  // Sort top-to-bottom, left-to-right
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

  // Single-char labels first
  for (const c of chars) {
    labels.push(c);
    if (labels.length >= count) return labels;
  }

  // Two-char labels
  for (const c1 of chars) {
    for (const c2 of chars) {
      labels.push(c1 + c2);
      if (labels.length >= count) return labels;
    }
  }

  return labels;
}

function handleSearchInput(e) {
  const query = searchInput.value;
  if (query.length < MIN_SEARCH_LENGTH) {
    if (state === "HINT_SELECTION") {
      exitHintMode();
    }
    return;
  }

  const matches = findVisibleMatches(query);
  if (matches.length === 0) {
    clearOverlays();
    const msg = document.createElement("div");
    msg.className = "fy-no-matches";
    msg.textContent = "No matches";
    shadowRoot.querySelector(".fy-search-bar").appendChild(msg);
    return;
  }

  enterHintMode(matches);
}

function getShadowStyles() {
  return `
    .fy-search-bar {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      padding: 8px;
      background: #1a1a2e;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
    }
    .fy-search-input {
      font-family: monospace;
      font-size: 16px;
      padding: 6px 12px;
      width: 220px;
      border: 2px solid #e2b714;
      border-radius: 4px;
      background: #0f0f1a;
      color: #e0e0e0;
      outline: none;
    }
    .fy-search-input:focus {
      border-color: #f5d742;
    }
    .fy-search-input::placeholder {
      color: #555;
    }
    .fy-no-matches {
      color: #ff6b6b;
      font-family: monospace;
      font-size: 12px;
      padding: 4px 12px 0;
      text-align: center;
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
      padding: 4px 12px 0;
      text-align: center;
    }
  `;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "b" && e.metaKey && e.ctrlKey && e.altKey && e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    if (state === "INACTIVE") {
      activate();
    } else {
      deactivate();
    }
  }
});
