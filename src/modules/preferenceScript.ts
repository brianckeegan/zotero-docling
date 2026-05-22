// Wires up dynamic behavior in the preferences pane:
//   - "Test Connection" button → hits docling-serve /health and shows result
//   - Pipeline radio change → show/hide VLM section
//   - Preset dropdowns "Custom…" entry → reveal a free-text input
//   - "Reset to defaults" button → confirm + clear every plugin pref

import { getPref, setPref } from "../utils/prefs";
import {
  testServerConnection,
  buildPictureDescriptionApiConfig,
  getWebApis,
} from "./convert";

const LOG = "[zotero-docling]";

/**
 * The full list of plugin prefs. Kept in sync with addon/prefs.js so that
 * Reset-to-defaults knows what to clear. Each Zotero.Prefs.clear() reverts
 * the corresponding pref to whatever prefs.js declared at install time.
 */
const ALL_PREF_KEYS: ReadonlyArray<string> = [
  "serverUrl",
  "autoConvert",
  "skipIfExists",
  "pipeline",
  "doOcr",
  "forceOcr",
  "tableMode",
  "doFormulaEnrichment",
  "doCodeEnrichment",
  "doChartExtraction",
  "doPictureClassification",
  "vlmPreset",
  "doPictureDescription",
  "pictureDescriptionPreset",
  "ocrLang",
  "advancedJson",
  "useAsyncEndpoint",
  "asyncPollIntervalSec",
  "maxConcurrency",
  "addFrontmatter",
  "attachToItem",
  "exportFolderPath",
  "notifyOnComplete",
  "useRemoteApi",
  "remoteApiProvider",
  "remoteApiUrl",
  "remoteApiModel",
  "remoteApiKey",
  "remoteApiPrompt",
];

/**
 * Default URL + model for each provider preset. Switching the preset
 * dropdown overwrites those two fields (and only those two) so a user
 * can mix-and-match — e.g. point an "OpenAI" preset at an internal
 * proxy that mirrors the OpenAI wire format.
 */
const PROVIDER_DEFAULTS: Record<string, { url: string; model: string }> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-4-5",
  },
  ollama: {
    url: "http://localhost:11434/v1/chat/completions",
    model: "llama3.2-vision",
  },
  lmstudio: {
    url: "http://localhost:1234/v1/chat/completions",
    model: "",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "openrouter/auto",
  },
  vllm: {
    url: "http://localhost:8000/v1/chat/completions",
    model: "",
  },
  // "custom" is intentionally absent — switching to Custom leaves the
  // existing fields alone so the user can edit freely.
};

export function registerPrefsScripts(win: Window): void {
  // Keep a handle to the prefs window in addon.data — the template's addon.ts
  // already declares the slot.
  addon.data.prefs = addon.data.prefs ?? { window: win, columns: [], rows: [] };
  addon.data.prefs.window = win;

  bindTestConnection(win);
  bindPipelineToggle(win);
  bindPresetCustomToggle(win, "vlm");
  bindPresetCustomToggle(win, "pic");
  bindRemoteApi(win);
  bindResetButton(win);
}

/**
 * Wire the Remote LLM API section:
 *   - Provider dropdown command listener overwrites url+model when changed
 *     to a non-"custom" preset, so users get sensible defaults to edit.
 *   - "Test Remote API" button validates the configured fields and runs a
 *     cheap probe. We intentionally don't ship the API key off-machine
 *     during the test beyond what a real conversion would do.
 */
function bindRemoteApi(win: Window): void {
  const providerMenu = win.document.getElementById(
    "zotero-docling-remote-api-provider",
  ) as (HTMLElement & { value?: string }) | null;
  const urlInput = win.document.getElementById(
    "zotero-docling-remote-api-url",
  ) as HTMLInputElement | null;
  const modelInput = win.document.getElementById(
    "zotero-docling-remote-api-model",
  ) as HTMLInputElement | null;
  const testBtn = win.document.getElementById(
    "zotero-docling-test-remote-api",
  ) as HTMLElement | null;
  const testLabel = win.document.getElementById(
    "zotero-docling-remote-api-test-result",
  ) as HTMLElement | null;

  if (providerMenu && urlInput && modelInput) {
    providerMenu.addEventListener("command", () => {
      const preset = (providerMenu.value as string) || "openai";
      const defaults = PROVIDER_DEFAULTS[preset];
      if (!defaults) return; // "custom" — leave fields alone
      urlInput.value = defaults.url;
      modelInput.value = defaults.model;
      // The preference="" binding doesn't fire from a programmatic .value
      // change in every Z9 build, so persist explicitly.
      try {
        setPref("remoteApiUrl", defaults.url);
        setPref("remoteApiModel", defaults.model);
      } catch {
        /* ignore */
      }
    });
  }

  if (testBtn && testLabel) {
    testBtn.addEventListener("command", async () => {
      testLabel.textContent = "Testing…";
      testLabel.style.color = "";
      const cfg = buildPictureDescriptionApiConfig();
      if (!cfg || typeof cfg.url !== "string" || !cfg.url) {
        testLabel.textContent = "URL is required";
        testLabel.style.color = "var(--accent-red, #c00)";
        return;
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(cfg.url);
      } catch {
        testLabel.textContent = "URL doesn't parse (missing scheme?)";
        testLabel.style.color = "var(--accent-red, #c00)";
        return;
      }
      // Probe the provider's /models endpoint when the configured URL looks
      // OpenAI-compatible (ends in /chat/completions). For other shapes we
      // just confirm the URL parses and the model field isn't empty — a
      // real conversion is the only way to validate further without
      // burning API credits unexpectedly.
      const headers = (cfg.headers as Record<string, string>) ?? {};
      let api: ReturnType<typeof getWebApis>;
      try {
        api = getWebApis();
      } catch (e) {
        testLabel.textContent = `Cannot probe: ${(e as Error).message}`;
        testLabel.style.color = "var(--accent-red, #c00)";
        return;
      }
      if (parsedUrl.pathname.endsWith("/chat/completions")) {
        const probeUrl = `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/chat\/completions$/, "/models")}`;
        try {
          const r = await api.fetch(probeUrl, {
            method: "GET",
            headers,
          });
          if (r.ok) {
            testLabel.textContent = `Reachable ✓ — ${probeUrl}`;
            testLabel.style.color = "var(--accent-green, #2a8000)";
          } else {
            testLabel.textContent = `Probe failed — HTTP ${r.status} (URL parses, but credentials may be wrong)`;
            testLabel.style.color = "var(--accent-red, #c00)";
          }
        } catch (e) {
          testLabel.textContent = `Unreachable — ${(e as Error).message}`;
          testLabel.style.color = "var(--accent-red, #c00)";
        }
      } else {
        testLabel.textContent =
          "URL parses ✓ (provider has no standard probe; a real conversion is the next step)";
        testLabel.style.color = "var(--accent-green, #2a8000)";
      }
    });
  }
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
 * "Reset to defaults" button → confirm dialog → clear every plugin pref.
 * Uses the Services.prompt cross-platform confirm dialog; user must opt-in.
 */
function bindResetButton(win: Window): void {
  const btn = win.document.getElementById(
    "zotero-docling-reset",
  ) as HTMLElement | null;
  if (!btn) {
    Zotero.debug(`${LOG} prefs: reset button not found`);
    return;
  }
  btn.addEventListener("command", () => {
    const Services = (globalThis as any).Services;
    const title =
      "Reset zotero-docling preferences?"; /* fluent doesn't resolve here */
    const body =
      "This reverts every plugin preference (Server URL, auto-convert, pipeline, VLM preset, output, etc.) to its built-in default. Your Zotero library and existing markdown attachments are not touched.";
    const confirmed = Services?.prompt?.confirm?.(win, title, body) ?? true;
    if (!confirmed) return;

    const PREFIX = addon.data.config.prefsPrefix;
    let cleared = 0;
    for (const key of ALL_PREF_KEYS) {
      try {
        Zotero.Prefs.clear(`${PREFIX}.${key}`, true);
        cleared++;
      } catch (e) {
        Zotero.debug(
          `${LOG} prefs: clear ${key} failed: ${(e as Error).message}`,
        );
      }
    }
    Zotero.debug(`${LOG} prefs: reset ${cleared} keys to defaults`);

    // ProgressWindow toast for confirmation
    try {
      const pw = new Zotero.ProgressWindow({ closeOnClick: true });
      pw.changeHeadline("zotero-docling");
      pw.addDescription("Preferences reset to defaults");
      pw.show();
      setTimeout(() => {
        try {
          pw.close();
        } catch {
          /* ignore */
        }
      }, 3000);
    } catch {
      /* ignore — toast is nice-to-have */
    }
  });
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
