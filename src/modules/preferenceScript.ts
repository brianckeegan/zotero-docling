// Wires up dynamic behavior in the preferences pane:
//   - "Test Connection" button → hits docling-serve /health and shows result
//   - Pipeline radio change → show/hide VLM section
//   - Preset dropdowns "Custom…" entry → reveal a free-text input
//   - "Reset to defaults" button → confirm + clear every plugin pref

import { getPref, setPref } from "../utils/prefs";
import { testServerConnection } from "./convert";

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
  "prefsLayerConversionExpanded",
  "prefsLayerAdvancedExpanded",
];

/**
 * Hover-summary text for VLM presets, used both as menuitem tooltiptext
 * (set in the XHTML) and as the live description below the dropdown.
 * Keep these in sync with the XHTML if either changes — duplication is
 * cheaper than wiring a shared source for fifteen short strings.
 */
const VLM_PRESET_DETAIL: Record<string, string> = {
  default:
    "docling-serve's built-in default — Granite-Docling (~500 MB). Recommended starting point.",
  smoldocling:
    "HuggingFaceTB/SmolDocling — smallest, fastest. ~256 MB. Good on low-RAM machines.",
  deepseek_ocr: "DeepSeek-OCR — strong on dense academic text. ~3 GB.",
  granite_vision:
    "IBM Granite Vision — general-purpose, ~500 MB. Same family as the default.",
  pixtral: "Mistral Pixtral — large, multi-GB. Strong figure understanding.",
  got_ocr: "GOT-OCR2 — general OCR, good on scanned material.",
  phi4: "Microsoft Phi-4 multimodal — mid-size, strong reasoning.",
  qwen: "Qwen2-VL — Alibaba, broad-domain VLM. Multi-GB.",
  nanonets_ocr2: "Nanonets-OCR-s — purpose-built for document OCR.",
  gemma_12b: "Google Gemma 3 12B — very capable, ~24 GB RAM/GPU recommended.",
  gemma_27b: "Google Gemma 3 27B — top quality, 40+ GB RAM/GPU needed.",
  dolphin: "Dolphin — VLM tuned for academic/STEM figures.",
  glm_ocr: "GLM-4V OCR — Zhipu AI, multi-GB.",
  lightonocr: "LightOnOCR — efficient OCR-focused VLM.",
  falcon_ocr: "Falcon OCR — TII multilingual OCR.",
  __custom__: "Type any preset name your docling-serve build supports.",
};

const PIC_PRESET_DETAIL: Record<string, string> = {
  default:
    "docling-serve's built-in default. Small, fast, sensible starting point.",
  smolvlm: "SmolVLM — smallest local picture-description model. ~500 MB.",
  granite_vision: "IBM Granite Vision — better descriptions, ~500 MB.",
  __custom__: "Type any preset name your docling-serve build supports.",
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
  bindPresetDetail(win, "vlm", VLM_PRESET_DETAIL, "vlmPreset");
  bindPresetDetail(win, "pic", PIC_PRESET_DETAIL, "pictureDescriptionPreset");
  bindDisclosure(
    win,
    "zotero-docling-disclosure-conversion",
    "zotero-docling-conversion-section",
    "prefsLayerConversionExpanded",
    "Conversion options",
  );
  bindDisclosure(
    win,
    "zotero-docling-disclosure-advanced",
    "zotero-docling-advanced-section",
    "prefsLayerAdvancedExpanded",
    "Advanced",
  );
  bindResetButton(win);
}

/**
 * Disclosure button → toggle visibility of the wrapped section and persist
 * the open state in a preference. Persistence is per-session-and-restart
 * because Zotero.Prefs survives across both; the issue called for
 * per-session and per-restart is a free bonus.
 */
function bindDisclosure(
  win: Window,
  buttonId: string,
  sectionId: string,
  prefKey: "prefsLayerConversionExpanded" | "prefsLayerAdvancedExpanded",
  baseLabel: string,
): void {
  const btn = win.document.getElementById(buttonId) as HTMLElement | null;
  const section = win.document.getElementById(sectionId) as HTMLElement | null;
  if (!btn || !section) return;

  const refresh = (expanded: boolean) => {
    section.hidden = !expanded;
    btn.textContent = `${expanded ? "▼" : "▶"} ${baseLabel}`;
  };

  const initial = (getPref(prefKey) ?? false) as boolean;
  refresh(initial);

  btn.addEventListener("click", () => {
    // Currently hidden → expand. `as boolean` because section.hidden's
    // inferred type drags in null through the HTMLElement.hidden setter
    // overload that accepts string | boolean | null.
    const next = section.hidden as boolean;
    refresh(next);
    try {
      if (prefKey === "prefsLayerConversionExpanded") {
        setPref("prefsLayerConversionExpanded", next);
      } else {
        setPref("prefsLayerAdvancedExpanded", next);
      }
    } catch {
      /* persistence is nice-to-have */
    }
  });
}

/**
 * Inline preset description below a dropdown — updates as the user
 * cycles through options. Reads the current pref value on first paint
 * so the row matches what's already saved.
 */
function bindPresetDetail(
  win: Window,
  kind: "vlm" | "pic",
  detailMap: Record<string, string>,
  prefKey: "vlmPreset" | "pictureDescriptionPreset",
): void {
  const menu = win.document.getElementById(
    `zotero-docling-${kind}-preset-menu`,
  ) as (HTMLElement & { value?: string }) | null;
  const detail = win.document.getElementById(
    `zotero-docling-${kind}-preset-detail`,
  ) as HTMLElement | null;
  if (!menu || !detail) return;

  const refresh = () => {
    const value = (menu.value as string) || (getPref(prefKey) as string) || "";
    detail.textContent =
      detailMap[value] ??
      (value
        ? `Custom preset "${value}" — described by your docling-serve build.`
        : "");
  };
  menu.addEventListener("command", refresh);
  refresh();
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
