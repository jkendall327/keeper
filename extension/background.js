const DEFAULT_SERVER_URL = "http://localhost:3001";
const MAX_ERRORS = 3;

async function storeError(message) {
  const { recentErrors = [] } = await chrome.storage.local.get("recentErrors");
  recentErrors.unshift({ message, time: Date.now() });
  if (recentErrors.length > MAX_ERRORS) recentErrors.length = MAX_ERRORS;
  await chrome.storage.local.set({ recentErrors });
}

async function getServerUrl() {
  const result = await chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER_URL });
  return result.serverUrl.replace(/\/+$/, "");
}

async function saveNote({ title, body }) {
  const serverUrl = await getServerUrl();
  const payload = { body };
  if (title) payload.title = title;
  const response = await fetch(`${serverUrl}/api/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Keeper-Source": "extension",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Server responded ${response.status}`);
  }
  return response.json();
}

async function saveRightwardTabs({ includeCurrent }) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const activeTab = tabs.find((tab) => tab.active);
  if (!activeTab) {
    throw new Error("No active tab found");
  }

  const startIndex = activeTab.index + (includeCurrent ? 0 : 1);
  const tabsToSave = tabs
    .filter((tab) => tab.index >= startIndex)
    .sort((a, b) => a.index - b.index)
    .filter((tab) => typeof tab.url === "string" && tab.url.length > 0);

  let saved = 0;
  let failed = 0;

  for (const tab of tabsToSave) {
    try {
      await saveNote({ title: tab.title || undefined, body: tab.url });
      saved += 1;
    } catch (err) {
      failed += 1;
      console.error("Keeper: failed to save tab", tab.url, err);
    }
  }

  if (failed > 0) {
    throw new Error(`Saved ${saved} tab${saved === 1 ? "" : "s"}, failed ${failed}`);
  }

  return { saved, failed };
}

function buildNote(info, tab) {
  if (info.menuItemId === "save-page") {
    return { title: tab.title || undefined, body: tab.url || "" };
  }
  if (info.menuItemId === "save-image") {
    return { body: info.srcUrl || "" };
  }
  if (info.menuItemId === "save-link") {
    return { body: info.linkUrl || "" };
  }
  if (info.menuItemId === "save-selection") {
    return { body: info.selectionText || "" };
  }
  if (info.selectionText) {
    return { body: info.selectionText };
  }
  if (info.srcUrl) {
    return { body: info.srcUrl };
  }
  if (info.linkUrl) {
    return { body: info.linkUrl };
  }
  // Page save
  return { title: tab.title || undefined, body: tab.url || "" };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-page",
    title: "Save page to Keeper",
    contexts: ["page", "image"],
  });
  chrome.contextMenus.create({
    id: "save-link",
    title: "Save link to Keeper",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: "save-selection",
    title: "Save selection to Keeper",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "save-image",
    title: "Save image to Keeper",
    contexts: ["image"],
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "test-connection") {
    const url = msg.url.replace(/\/+$/, "");
    fetch(`${url}/api/notes`, { method: "GET" })
      .then((res) => sendResponse({ ok: res.ok }))
      .catch(() => {
        storeError(`Could not reach ${url}`);
        sendResponse({ ok: false, error: "unreachable" });
      });
    return true; // keep channel open for async sendResponse
  }

  if (msg.type === "save-rightward-tabs") {
    saveRightwardTabs({ includeCurrent: msg.includeCurrent === true })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch(async (err) => {
        const message = err.message || String(err);
        await storeError(message);
        sendResponse({ ok: false, error: message });
      });
    return true;
  }

  if (msg.type === "save-quick-note") {
    const body = typeof msg.body === "string" ? msg.body.trim() : "";
    if (!body) {
      sendResponse({ ok: false, error: "Note is empty" });
      return false;
    }

    saveNote({ body })
      .then(() => sendResponse({ ok: true }))
      .catch(async (err) => {
        const message = err.message || String(err);
        await storeError(message);
        sendResponse({ ok: false, error: message });
      });
    return true;
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const note = buildNote(info, tab);
    await saveNote(note);
    chrome.action.setBadgeText({ text: "✓", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#16a34a", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2000);
  } catch (err) {
    console.error("Keeper: failed to save note", err);
    chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626", tabId: tab.id });
    await storeError(err.message || String(err));
  }
});
