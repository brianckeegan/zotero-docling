// Auto-convert any newly-added PDF attachment.
//
// Zotero.Notifier fires `add` events as items land in the library. We collect
// IDs into a queue and process the queue after a quiet period — this prevents
// hammering docling-serve when the user imports a batch (e.g. drags 20 PDFs at
// once or syncs a folder).
//
// Gated entirely on the `autoConvert` preference; if that pref is false the
// observer returns immediately and nothing happens.

import { getPref } from "../utils/prefs";
import {
  convertAttachment,
  applyStatusTagsToParents,
  preflightServer,
  type ConvertResult,
} from "./convert";
import { toast } from "./ui";

const LOG = "[Docling/notifier]";
const DEBOUNCE_MS = 3000;

// Stored on `Zotero` so it survives module reloads from npm-start hot-reload.
// Without this, every rebuild leaks another observer and the notifier fires N
// times per item-add, causing duplicate auto-conversions.
const GLOBAL_KEY = "__zoteroDoclingNotifierID__";

let notifierID: string | null = null;
const pendingIDs = new Set<number>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// Stays true while processPending is in flight, so back-to-back batches don't
// trigger overlapping convert loops.
let processing = false;

function log(...args: unknown[]): void {
  try {
    ztoolkit.log(LOG, ...args);
  } catch {
    /* ignore */
  }
}

const observer = {
  notify: (
    event: string,
    type: string,
    ids: Array<string | number>,
    _extraData: { [key: string]: any },
  ) => {
    if (event !== "add" || type !== "item") return;
    if (!getPref("autoConvert")) return;

    let queued = 0;
    for (const rawId of ids) {
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      if (!Number.isFinite(id)) continue;
      const item = Zotero.Items.get(id);
      if (!item) continue;
      if ((item.itemType as string) !== "attachment") continue;
      if (item.attachmentContentType !== "application/pdf") continue;
      pendingIDs.add(id);
      queued++;
    }
    if (queued === 0) return;
    log(`queued ${queued} PDF(s); total pending=${pendingIDs.size}`);

    // Reset the debounce so a steady stream of adds extends the wait.
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void processPending();
    }, DEBOUNCE_MS);
  },
};

async function processPending(): Promise<void> {
  if (processing) {
    log("processPending: already running, will pick up next debounce tick");
    return;
  }
  processing = true;
  try {
    const ids = Array.from(pendingIDs);
    pendingIDs.clear();
    debounceTimer = null;
    log(`processing ${ids.length} pending PDF(s)`);

    // Pre-flight: if docling-serve is down, skip the whole batch with one
    // concise toast instead of N "Server not reachable" lines.
    if (!(await preflightServer())) {
      log("preflight failed — auto-convert paused until server is up");
      toast(
        "Docling auto-convert",
        `Skipped ${ids.length} PDF${ids.length === 1 ? "" : "s"} — docling-serve isn't running`,
        false,
      );
      return;
    }

    let ok = 0;
    let skipped = 0;
    let failed = 0;
    const skipReasons = new Set<string>();
    const failMessages: string[] = [];
    const batchResults: Array<{ item: Zotero.Item; result: ConvertResult }> = [];
    for (const id of ids) {
      const item = Zotero.Items.get(id);
      if (!item) continue;
      let result: ConvertResult;
      try {
        result = await convertAttachment(item);
      } catch (e) {
        result = { status: "error", message: (e as Error).message };
        log(`auto-convert threw for item ${id}: ${(e as Error).message}`);
      }
      batchResults.push({ item, result });
      if (result.status === "ok") ok++;
      else if (result.status === "skipped") {
        skipped++;
        skipReasons.add(result.reason);
      } else {
        failed++;
        failMessages.push(result.message);
        log(`auto-convert error for item ${id}: ${result.message}`);
      }
    }
    await applyStatusTagsToParents(batchResults);
    if (ok + failed + skipped === 0) return;

    // Always toast — silent skips left users wondering why nothing happened
    // for standalone PDFs (no parent → skipped).
    const summary = `OK ${ok} · skipped ${skipped} · failed ${failed}`;
    const detail =
      failMessages.length > 0
        ? failMessages.slice(0, 2).join("\n")
        : skipReasons.size > 0
          ? Array.from(skipReasons).slice(0, 2).join("\n")
          : undefined;
    toast(
      "Docling auto-convert",
      detail ? `${summary}\n${detail}` : summary,
      failed === 0,
    );
  } finally {
    processing = false;
    // If more items arrived during processing, kick another debounce tick.
    if (pendingIDs.size > 0 && !debounceTimer) {
      debounceTimer = setTimeout(() => {
        void processPending();
      }, DEBOUNCE_MS);
    }
  }
}

export function registerNotifier(): void {
  // Hot-reload defense: kill any observer left behind by a previous module load.
  const prev = (Zotero as any)[GLOBAL_KEY] as string | undefined;
  if (prev) {
    try {
      Zotero.Notifier.unregisterObserver(prev);
      log("cleaned up previous notifier id=" + prev);
    } catch {
      /* already gone — fine */
    }
    (Zotero as any)[GLOBAL_KEY] = null;
  }
  if (notifierID) return; // shouldn't happen, but be safe

  notifierID = Zotero.Notifier.registerObserver(observer, ["item"]);
  (Zotero as any)[GLOBAL_KEY] = notifierID;
  log("registered notifier id=" + notifierID);
}

export function unregisterNotifier(): void {
  if (notifierID) {
    try {
      Zotero.Notifier.unregisterObserver(notifierID);
    } catch (e) {
      log("unregister threw:", (e as Error).message);
    }
    notifierID = null;
  }
  (Zotero as any)[GLOBAL_KEY] = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingIDs.clear();
}
