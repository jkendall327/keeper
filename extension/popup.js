const DEFAULT_SERVER_URL = "http://localhost:3001";

const serverUrlInput = document.getElementById("serverUrl");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");
const errorsEl = document.getElementById("errors");

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

function formatTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "unknown";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function renderErrors(errors) {
  errorsEl.replaceChildren();
  if (!errors || errors.length === 0) return;

  const heading = document.createElement("h3");
  heading.textContent = "Recent errors";
  errorsEl.appendChild(heading);

  for (const e of errors) {
    const item = document.createElement("div");
    item.className = "error-item";
    const msg = document.createElement("span");
    msg.className = "msg";
    msg.textContent = e.message;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = " " + formatTime(e.time);
    item.append(msg, time);
    errorsEl.appendChild(item);
  }

  const clearBtn = document.createElement("button");
  clearBtn.id = "clear-errors";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("click", () => {
    chrome.storage.local.remove("recentErrors", () => renderErrors([]));
  });
  errorsEl.appendChild(clearBtn);
}

// Load saved URL and recent errors
chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER_URL }, (result) => {
  serverUrlInput.value = result.serverUrl;
});
chrome.storage.local.get("recentErrors", (result) => {
  renderErrors(result.recentErrors);
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
