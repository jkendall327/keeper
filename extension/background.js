const DEFAULT_SERVER_URL = "http://localhost:3001";

async function getServerUrl() {
  const result = await chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER_URL });
  return result.serverUrl.replace(/\/+$/, "");
}

async function saveNote(body) {
  const serverUrl = await getServerUrl();
  const response = await fetch(`${serverUrl}/api/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(`Server responded ${response.status}`);
  }
  return response.json();
}

function buildNoteBody(info, tab) {
  if (info.selectionText) {
    return `${info.selectionText}\n\nSource: ${tab.url}`;
  }
  if (info.srcUrl) {
    return `${info.srcUrl}\n\nFound on: ${tab.url}`;
  }
  if (info.linkUrl) {
    const body = info.linkUrl;
    if (tab.url && tab.url !== info.linkUrl) {
      return `${body}\n\nFound on: ${tab.url}`;
    }
    return body;
  }
  // Page save
  const parts = [];
  if (tab.title) parts.push(tab.title);
  if (tab.url) parts.push(tab.url);
  return parts.join("\n");
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const body = buildNoteBody(info, tab);
    await saveNote(body);
    chrome.action.setBadgeText({ text: "✓", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#16a34a", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2000);
  } catch (err) {
    console.error("Keeper: failed to save note", err);
    chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626", tabId: tab.id });
  }
});

