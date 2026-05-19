// Single right-click "Convert with Docling" menu item that handles every case:
//   - one or more PDF attachment items selected directly
//   - one or more parent items selected (we expand to their PDF children)
//   - any mixed combination of the above
//
// Visibility: shown whenever the selection resolves to ≥1 PDF.

import { getString } from "../utils/locale";
import {
  convertAttachment,
  applyStatusTagsToParents,
  preflightServer,
  type ConvertResult,
} from "./convert";
import { showProgress, finishProgress, toast } from "./ui";
import { getPDFAttachments } from "../utils/zotero";

const LOG = "[Docling/menu]";
const MENU_ID = "zotero-docling-convert";

function log(...args: unknown[]): void {
  try {
    ztoolkit.log(LOG, ...args);
  } catch {
    // ztoolkit may not be available during shutdown
  }
}

/** Z9-safe selection accessor. */
function getSelectedItems(): Zotero.Item[] {
  try {
    const pane = (Zotero as any).getActiveZoteroPane?.();
    return (pane?.getSelectedItems?.() ?? []) as Zotero.Item[];
  } catch (e) {
    log("getActiveZoteroPane threw:", (e as Error).message);
    return [];
  }
}

/**
 * Take whatever's selected and resolve it to a deduped list of PDF attachment
 * items to convert:
 *   - PDF attachments → kept as-is
 *   - Parent items    → expanded to their PDF children
 *   - Anything else   → ignored
 */
function resolvePdfsToConvert(selection: Zotero.Item[]): Zotero.Item[] {
  const seen = new Set<number>();
  const out: Zotero.Item[] = [];
  const push = (item: Zotero.Item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  };
  for (const it of selection) {
    if ((it.itemType as string) === "attachment") {
      if (it.attachmentContentType === "application/pdf") push(it);
    } else {
      for (const child of getPDFAttachments(it)) push(child);
    }
  }
  return out;
}

/** Visibility predicate — show the menu iff resolution yields ≥1 PDF. */
function shouldShowConvert(): boolean {
  return resolvePdfsToConvert(getSelectedItems()).length > 0;
}

/** Click handler. */
async function onMenuClick(): Promise<void> {
  log("onMenuClick: entered");
  const selection = getSelectedItems();
  const pdfs = resolvePdfsToConvert(selection);
  log(`onMenuClick: selection=${selection.length} → pdfs=${pdfs.length}`);

  if (pdfs.length === 0) {
    toast("Docling", "No PDF attachments in selection", false);
    return;
  }

  // Pre-flight: avoid N×wall-of-error toasts when docling-serve isn't running.
  if (!(await preflightServer())) {
    toast("Docling", "docling-serve isn't running — start it and retry", false);
    return;
  }

  const pw = showProgress(
    "Docling: converting…",
    `${pdfs.length} PDF attachment${pdfs.length === 1 ? "" : "s"}`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const failureMessages: string[] = [];
  const skipReasons = new Set<string>();
  const batchResults: Array<{ item: Zotero.Item; result: ConvertResult }> = [];

  for (const item of pdfs) {
    let result: ConvertResult;
    try {
      result = await convertAttachment(item);
    } catch (e) {
      result = { status: "error", message: (e as Error).message };
    }
    batchResults.push({ item, result });
    if (result.status === "ok") ok++;
    else if (result.status === "skipped") {
      skipped++;
      skipReasons.add(result.reason);
    } else {
      failed++;
      failureMessages.push(result.message);
    }
  }

  await applyStatusTagsToParents(batchResults);

  const allOk = failed === 0;
  const summary = `OK ${ok} · skipped ${skipped} · failed ${failed}`;
  const body =
    failureMessages.length > 0
      ? failureMessages.slice(0, 2).join("\n")
      : skipReasons.size > 0
        ? Array.from(skipReasons).slice(0, 2).join("\n")
        : undefined;
  finishProgress(
    pw,
    allOk,
    allOk ? "Docling: done" : "Docling: finished with errors",
    body ? `${summary}\n${body}` : summary,
  );
}

export function registerMenu(): void {
  // Hot-reload safety: kill any previous registration first.
  try {
    ztoolkit.Menu.unregister(MENU_ID);
  } catch {
    /* not present — fine */
  }

  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: MENU_ID,
    label: getString("menuitem-convert"),
    commandListener: (ev: Event) => {
      log("commandListener fired:", ev?.type);
      void onMenuClick();
    },
    getVisibility: () => shouldShowConvert(),
  });

  log("registerMenu: registered id=" + MENU_ID);
}

export function unregisterMenu(): void {
  try {
    ztoolkit.Menu.unregister(MENU_ID);
  } catch {
    /* ignore */
  }
}
