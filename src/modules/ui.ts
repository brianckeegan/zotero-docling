// Thin wrappers around Zotero's native ProgressWindow.
// All UI text passes through here so we can swap to localised strings later.

export type ProgressHandle = ReturnType<typeof showProgress>;

const CLOSE_MS_SUCCESS = 3000;
const CLOSE_MS_ERROR = 8000; // errors linger so the user can read them

export function showProgress(headline: string, body?: string) {
  // closeOnClick:true so the user can dismiss manually if our auto-close lags.
  const pw = new Zotero.ProgressWindow({ closeOnClick: true });
  pw.changeHeadline(headline);
  if (body) pw.addDescription(body);
  pw.show();
  return pw;
}

export function finishProgress(
  pw: ProgressHandle,
  success: boolean,
  headline: string,
  body?: string,
) {
  pw.changeHeadline(headline);
  if (body) pw.addDescription(body);
  scheduleClose(pw, success);
}

/**
 * Standalone toast for fire-and-forget messages.
 * Description is added only once (via finishProgress), avoiding the prior
 * double-render where both showProgress and finishProgress appended it.
 */
export function toast(headline: string, body?: string, success = true) {
  const pw = showProgress(headline); // no body here — finishProgress adds it
  finishProgress(pw, success, headline, body);
  return pw;
}

/**
 * Use an explicit setTimeout + pw.close() instead of pw.startCloseTimer().
 * The built-in timer has been observed to linger on Z9; explicit close is
 * reliable. Wrapped in try/catch since close can race with manual click-close.
 */
function scheduleClose(pw: ProgressHandle, success: boolean): void {
  const ms = success ? CLOSE_MS_SUCCESS : CLOSE_MS_ERROR;
  setTimeout(() => {
    try {
      pw.close();
    } catch {
      /* already closed or window destroyed — fine */
    }
  }, ms);
}
