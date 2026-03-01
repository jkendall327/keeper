const DEFAULT_SERVER_URL = "http://localhost:3001";

const serverUrlInput = document.getElementById("serverUrl");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function showStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = ok ? "ok" : "err";
}

function testConnection(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "test-connection", url }, (response) => {
      resolve(response?.ok ?? false);
    });
  });
}

// Load saved URL
chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER_URL }, (result) => {
  serverUrlInput.value = result.serverUrl;
});

saveBtn.addEventListener("click", async () => {
  const url = serverUrlInput.value.trim();
  if (!url) {
    showStatus("URL is required", false);
    return;
  }

  showStatus("Testing connection...", true);

  const ok = await testConnection(url);
  if (ok) {
    chrome.storage.sync.set({ serverUrl: url });
    showStatus("Connected and saved", true);
  } else {
    showStatus("Could not reach server", false);
  }
});
