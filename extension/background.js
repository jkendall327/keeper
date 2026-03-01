const DEFAULT_SERVER_URL = "http://localhost:3001";

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Server responded ${response.status}`);
  }
  return response.json();
}

function buildNote(info, tab) {
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
    contexts: ["page"],
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
      .catch(() => sendResponse({ ok: false, error: "unreachable" }));
    return true; // keep channel open for async sendResponse
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
  }
});

