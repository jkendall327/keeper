const DEFAULT_SERVER_URL = "http://localhost:3001";

const quickNoteInput = document.getElementById("quickNote");
const sendQuickNoteBtn = document.getElementById("sendQuickNote");
const serverUrlInput = document.getElementById("serverUrl");
const saveBtn = document.getElementById("save");
const saveRightInclusiveBtn = document.getElementById("saveRightInclusive");
const saveRightExclusiveBtn = document.getElementById("saveRightExclusive");
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

function saveRightwardTabs(includeCurrent) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "save-rightward-tabs", includeCurrent }, (response) => {
      resolve(response ?? { ok: false, error: chrome.runtime.lastError?.message || "No response" });
    });
  });
}

function saveQuickNote(body) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "save-quick-note", body }, (response) => {
      resolve(response ?? { ok: false, error: chrome.runtime.lastError?.message || "No response" });
    });
  });
}

function setTabActionBusy(busy) {
  saveRightInclusiveBtn.disabled = busy;
  saveRightExclusiveBtn.disabled = busy;
}

function setQuickNoteBusy(busy) {
  quickNoteInput.disabled = busy;
  sendQuickNoteBtn.disabled = busy;
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
quickNoteInput.focus();

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

async function handleSaveRightwardTabs(includeCurrent) {
  setTabActionBusy(true);
  showStatus("Sending tabs to Keeper...", true);

  try {
    const result = await saveRightwardTabs(includeCurrent);
    if (result.ok) {
      const count = result.saved ?? 0;
      showStatus(`Sent ${count} tab${count === 1 ? "" : "s"} to Keeper`, true);
    } else {
      showStatus(result.error || "Could not send tabs", false);
      chrome.storage.local.get("recentErrors", (stored) => {
        renderErrors(stored.recentErrors);
      });
    }
  } finally {
    setTabActionBusy(false);
  }
}

async function handleSaveQuickNote() {
  const body = quickNoteInput.value.trim();
  if (!body) {
    showStatus("Note is empty", false);
    quickNoteInput.focus();
    return;
  }

  setQuickNoteBusy(true);
  showStatus("Sending note to Keeper...", true);

  let shouldRefocus = false;
  try {
    const result = await saveQuickNote(body);
    if (result.ok) {
      quickNoteInput.value = "";
      showStatus("Sent note to Keeper", true);
      shouldRefocus = true;
    } else {
      showStatus(result.error || "Could not send note", false);
      chrome.storage.local.get("recentErrors", (stored) => {
        renderErrors(stored.recentErrors);
      });
      shouldRefocus = true;
    }
  } finally {
    setQuickNoteBusy(false);
    if (shouldRefocus) quickNoteInput.focus();
  }
}

sendQuickNoteBtn.addEventListener("click", () => {
  handleSaveQuickNote();
});

quickNoteInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  handleSaveQuickNote();
});

saveRightInclusiveBtn.addEventListener("click", () => {
  handleSaveRightwardTabs(true);
});

saveRightExclusiveBtn.addEventListener("click", () => {
  handleSaveRightwardTabs(false);
});
