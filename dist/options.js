// src/config.js
function normaliseEndpoint(raw) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    throw new Error("Enter the address of the endpoint that returns your chat list.");
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That is not a full address. It should look like https://example.com/api/chats");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The address must start with https.");
  }
  return trimmed;
}
function originPermission(endpoint) {
  return `${new URL(endpoint).origin}/*`;
}
function derivePagePattern(endpoint) {
  return originPermission(endpoint);
}

// src/options.js
var endpointField = document.getElementById("endpoint");
var patternField = document.getElementById("pattern");
var saveButton = document.getElementById("save");
var forgetButton = document.getElementById("forget");
var status = document.getElementById("status");
function report(message, tone) {
  status.textContent = message;
  status.dataset.tone = tone;
  status.hidden = false;
}
var patternEdited = false;
patternField.addEventListener("input", () => {
  patternEdited = true;
});
endpointField.addEventListener("input", () => {
  if (patternEdited) return;
  try {
    patternField.value = derivePagePattern(normaliseEndpoint(endpointField.value));
  } catch {
    patternField.value = "";
  }
});
saveButton.addEventListener("click", async () => {
  let endpoint;
  try {
    endpoint = normaliseEndpoint(endpointField.value);
  } catch (error) {
    report(error.message, "bad");
    return;
  }
  const pagePattern = patternField.value.trim() || derivePagePattern(endpoint);
  const origin = originPermission(endpoint);
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    report("Chrome did not grant access, so nothing was saved.", "bad");
    return;
  }
  const result = await chrome.runtime.sendMessage({ type: "register", endpoint, pagePattern });
  if (!result?.ok) {
    report(result?.error ?? "Could not register the panel.", "bad");
    return;
  }
  report(`Saved. Open ${pagePattern.replace(/\*$/, "")} and reload the page to see the panel.`, "good");
});
forgetButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "forget" });
  endpointField.value = "";
  patternField.value = "";
  patternEdited = false;
  report("Settings cleared and access revoked.", "good");
});
var stored = await chrome.storage.local.get(["endpoint", "pagePattern"]);
if (stored.endpoint) {
  endpointField.value = stored.endpoint;
  patternField.value = stored.pagePattern ?? "";
  patternEdited = true;
  report("This extension is set up and running on the site above.", "good");
}
