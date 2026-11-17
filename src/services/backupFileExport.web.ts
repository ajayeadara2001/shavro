import {
  createShavroBackupFilename,
  createShavroBackupJson,
} from "./backupStorage";

/**
 * Download a Shavro backup as a JSON file
 * in the user's web browser.
 *
 * No existing app data is modified.
 */
export async function exportShavroBackupFile(): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Backup download is only available in a web browser.");
  }

  // Generate and validate the backup before
  // initiating any file download.
  const json = await createShavroBackupJson();

  const filename = createShavroBackupFilename();

  const blob = new Blob([json], {
    type: "application/json;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);

    try {
      link.click();
    } finally {
      document.body.removeChild(link);
    }

    return filename;
  } catch (error) {
    console.error("Failed to initiate backup download:", error);

    throw new Error("Unable to download the Shavro backup.");
  } finally {
    // Allow the browser to begin handling the download
    // before releasing the temporary object URL.
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }
}
