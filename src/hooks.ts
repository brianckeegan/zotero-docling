import { initLocale, getString } from "./utils/locale";
import { registerMenu, unregisterMenu } from "./modules/menu";
import { registerNotifier, unregisterNotifier } from "./modules/notifier";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { onZoteroBlur, onZoteroFocus, toast } from "./modules/ui";
import { createZToolkit } from "./utils/ztoolkit";
import { getPref, setPref } from "./utils/prefs";

async function onStartup(): Promise<void> {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  registerPrefsPane();
  registerMenu();
  registerNotifier();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
  maybeShowFirstRunNudge();
}

/**
 * Surface a one-time toast pointing the user at the preferences pane.
 * Fires only on the first startup after install (gated on the
 * `firstRunCompleted` pref). The flag is also flipped by a successful
 * Test Connection in the prefs pane, so a user who finds prefs without
 * the toast still won't see it next time.
 *
 * Deferred via setTimeout so the toast doesn't compete with Zotero's
 * own startup UI noise.
 */
function maybeShowFirstRunNudge(): void {
  try {
    if ((getPref("firstRunCompleted") ?? false) as boolean) return;
  } catch {
    return;
  }
  setTimeout(() => {
    try {
      toast(
        "zotero-docling installed",
        "Open Tools → Settings → zotero-docling to verify your server connection.",
        true,
      );
      setPref("firstRunCompleted", true);
    } catch (e) {
      Zotero.debug(
        `[zotero-docling] first-run nudge failed (non-fatal): ${(e as Error).message}`,
      );
    }
  }, 2500);
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Fresh ztoolkit per window — the toolkit owns DOM lifetime.
  addon.data.ztoolkit = createZToolkit();
  // (Template had insertFTLIfNeeded("...-mainWindow.ftl") here; we don't ship
  // a mainWindow.ftl, so omitting it avoids "Missing resource" log spam.)

  // Blur/focus listeners drive the managed-progress hide-on-blur behaviour
  // (the "stop showing the toast when user switches apps" UX). Re-show on
  // focus brings the latest state back.
  try {
    win.addEventListener("blur", () => onZoteroBlur());
    win.addEventListener("focus", () => onZoteroFocus());
  } catch (e) {
    Zotero.debug(
      `[zotero-docling] focus listeners failed (non-fatal): ${(e as Error).message}`,
    );
  }
}

/**
 * Tell Zotero where our preferences XHTML lives so it shows up as a pane in
 * Edit → Settings. Without this call the pane file is just an orphan asset.
 */
function registerPrefsPane(): void {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("pref-pane-label"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  try {
    unregisterNotifier();
  } catch {
    /* ignore */
  }
  try {
    unregisterMenu();
  } catch {
    /* ignore */
  }
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onPrefsEvent(
  type: string,
  data: { [key: string]: any },
): Promise<void> {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
