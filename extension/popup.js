const DEFAULT_SERVER_URL = "http://localhost:3001";

const serverUrlInput = document.getElementById("serverUrl");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function showStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = ok ? "ok" : "err";
}

async function testConnection(url) {
  const cleanUrl = url.replace(/\/+$/, "");
  const response = await fetch(`${cleanUrl}/api/notes`, { method: "GET" });
  return response.ok;
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

  try {
    const ok = await testConnection(url);
    if (ok) {
      chrome.storage.sync.set({ serverUrl: url });
      showStatus("Connected and saved", true);
    } else {
      showStatus("Server responded with an error", false);
    }
  } catch {
    showStatus("Could not reach server", false);
  }
});
