// Wires up dynamic behavior in the preferences pane:
//   - "Test Connection" button → hits docling-serve /health and shows result
//   - Pipeline radio change → show/hide VLM section
//   - Preset dropdowns "Custom…" entry → reveal a free-text input

import { getPref } from "../utils/prefs";
import { testServerConnection } from "./convert";

const LOG = "[zotero-docling]";

export function registerPrefsScripts(win: Window): void {
  // Keep a handle to the prefs window in addon.data — the template's addon.ts
  // already declares the slot.
  addon.data.prefs = addon.data.prefs ?? { window: win, columns: [], rows: [] };
  addon.data.prefs.window = win;

  bindTestConnection(win);
  bindPipelineToggle(win);
  bindPresetCustomToggle(win, "vlm");
  bindPresetCustomToggle(win, "pic");
}

/** "Test Connection" button → calls /health, paints status label. */
function bindTestConnection(win: Window): void {
  const btn = win.document.getElementById(
    "zotero-docling-test-connection",
  ) as HTMLElement | null;
  const label = win.document.getElementById(
    "zotero-docling-test-result",
  ) as HTMLElement | null;
  if (!btn || !label) {
    Zotero.debug(`${LOG} prefs: test-connection elements not found`);
    return;
  }
  btn.addEventListener("command", async () => {
    const serverUrl =
      ((getPref("serverUrl") as string) ?? "").trim() ||
      "http://localhost:5001";
    label.textContent = "Testing…";
    label.style.color = "";
    const result = await testServerConnection(serverUrl);
    if (result.ok) {
      label.textContent = `Connected ✓  (${result.serverUrl})`;
      label.style.color = "var(--accent-green, #2a8000)";
    } else {
      label.textContent = `Cannot connect — ${result.message}`;
      label.style.color = "var(--accent-red, #c00)";
    }
  });
}

/** Pipeline radiogroup → show/hide the VLM section. */
function bindPipelineToggle(win: Window): void {
  const group = win.document.getElementById(
    "zotero-docling-pipeline-group",
  ) as HTMLElement | null;
  const vlmSection = win.document.getElementById(
    "zotero-docling-vlm-section",
  ) as HTMLElement | null;
  if (!vlmSection) return;

  const refresh = () => {
    const pipeline = (getPref("pipeline") as string) ?? "standard";
    vlmSection.hidden = pipeline !== "vlm";
  };
  if (group) group.addEventListener("command", refresh);
  refresh();
}

/**
 * Each preset menulist has a hidden text input next to it.
 * Reveal it when "__custom__" is selected so the user can type any preset name.
 */
function bindPresetCustomToggle(win: Window, kind: "vlm" | "pic"): void {
  const menu = win.document.getElementById(
    `zotero-docling-${kind}-preset-menu`,
  ) as (HTMLElement & { value?: string }) | null;
  const custom = win.document.getElementById(
    `zotero-docling-${kind}-preset-custom`,
  ) as HTMLElement | null;
  if (!menu || !custom) return;

  const refresh = () => {
    custom.hidden = menu.value !== "__custom__";
  };
  menu.addEventListener("command", refresh);
  refresh();
}
