/**
 * Saving a generated file. In the full app a normal browser download is used; inside a
 * claude.ai artifact (where page-initiated downloads are blocked) the `downloads`
 * capability asks the viewer to confirm the save.
 */
type DownloadsNs = { save: (r: { filename: string; data: string | Blob }) => Promise<{ status: string }> };

let ns: Promise<DownloadsNs | null> | null = null;
function downloadsCapability(): Promise<DownloadsNs | null> {
  if (!ns) {
    const c = (globalThis as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    ns = c?.use ? (c.use("downloads") as Promise<DownloadsNs | null>).catch(() => null) : Promise.resolve(null);
  }
  return ns;
}

export async function canSaveFiles(): Promise<boolean> {
  if (!__RESTRICTED_HOST__) return true;
  return (await downloadsCapability()) !== null;
}

/** Resolves true when the file was handed to the browser / viewer, false when the viewer declined. */
export async function saveFile(filename: string, data: string, mime: string): Promise<boolean> {
  if (__RESTRICTED_HOST__) {
    const d = await downloadsCapability();
    if (!d) throw new Error("Saving files is not available in this view.");
    try {
      await d.save({ filename, data });
      return true;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "declined") return false;
      throw new Error((e as { message?: string })?.message || "The file could not be saved.");
    }
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Mobile Safari reads the blob after click() returns; revoking too early cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
