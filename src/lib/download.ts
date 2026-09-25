/**
 * Save text to a file.
 *
 * A blob URL and a synthetic click. On iOS Safari this opens a share sheet
 * rather than dropping a file into Downloads, which is why every export screen
 * also offers copy-to-clipboard: the download path is the one most likely to
 * behave differently on the phone than on the desktop.
 */
export function downloadText(text: string, filename: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
