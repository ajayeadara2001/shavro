import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  createShavroBackupFilename,
  createShavroBackupJson,
} from "./backupStorage";

/**
 * Export a Shavro backup on Android or iOS.
 *
 * Creates a temporary JSON file and opens
 * the native sharing interface.
 *
 * The user chooses where to save the backup.
 */
export async function exportShavroBackupFile(): Promise<string> {
  // Check platform support before preparing
  // any temporary backup file.
  const canShare = await Sharing.isAvailableAsync();

  if (!canShare) {
    throw new Error("File sharing is not available on this device.");
  }

  // Read and validate the saved Shavro data.
  // This operation does not modify transactions.
  const json = await createShavroBackupJson();

  const filename = createShavroBackupFilename();

  // Use the temporary cache directory.
  // This is not a permanent backup location.
  const file = new File(Paths.cache, filename);

  try {
    // Create the JSON file.
    file.create({
      overwrite: true,
      intermediates: true,
    });

    // Expo SDK 58: write() is asynchronous.
    await file.write(json);

    // Open the native share sheet.
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Save Shavro Backup",
    });

    // Returning means the sharing interface
    // finished, not necessarily that the user
    // saved the file.
    return filename;
  } catch (error) {
    console.error("Failed to export Shavro backup:", error);

    throw new Error("Unable to prepare or share the Shavro backup.");
  }
}
