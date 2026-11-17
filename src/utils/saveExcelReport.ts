import { Platform } from "react-native";

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { ExcelReportResult } from "./excelReport";

const EXCEL_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Decode Base64 into actual XLSX binary bytes.
// This works without relying on Node.js Buffer.
function decodeBase64(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s/g, "");

  if (
    cleaned.length === 0 ||
    cleaned.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)
  ) {
    throw new Error("Invalid Excel file data.");
  }

  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;

  const outputLength = (cleaned.length / 4) * 3 - padding;

  const bytes = new Uint8Array(outputLength);

  let outputIndex = 0;

  for (let i = 0; i < cleaned.length; i += 4) {
    const a = BASE64_ALPHABET.indexOf(cleaned[i]);

    const b = BASE64_ALPHABET.indexOf(cleaned[i + 1]);

    const c =
      cleaned[i + 2] === "=" ? 0 : BASE64_ALPHABET.indexOf(cleaned[i + 2]);

    const d =
      cleaned[i + 3] === "=" ? 0 : BASE64_ALPHABET.indexOf(cleaned[i + 3]);

    if (a < 0 || b < 0 || c < 0 || d < 0) {
      throw new Error("Invalid Excel file data.");
    }

    const value = (a << 18) | (b << 12) | (c << 6) | d;

    if (outputIndex < outputLength) {
      bytes[outputIndex++] = (value >>> 16) & 255;
    }

    if (outputIndex < outputLength) {
      bytes[outputIndex++] = (value >>> 8) & 255;
    }

    if (outputIndex < outputLength) {
      bytes[outputIndex++] = value & 255;
    }
  }

  return bytes;
}

// Only allow an ordinary XLSX filename.
// The date-range generator already uses a safe
// naming format, but validate it here as well.
function validateFileName(fileName: string): void {
  if (!fileName.endsWith(".xlsx") || !/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
    throw new Error("Invalid Excel report filename.");
  }
}

// Save the Excel file in a web browser.
function downloadOnWeb(fileName: string, bytes: Uint8Array): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: EXCEL_MIME_TYPE });

  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    // Temporarily attach the link for broad
    // browser compatibility.
    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
  } finally {
    // Allow the browser time to begin the
    // download before releasing the URL.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
}

// Save the file to Expo's temporary cache,
// then open the native share sheet.
//
// The user chooses where to save or share it.
async function shareOnMobile(
  fileName: string,
  bytes: Uint8Array,
): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();

  if (!canShare) {
    throw new Error("File sharing is not available on this device.");
  }

  const file = new File(Paths.cache, fileName);

  // Reports may be exported more than once.
  file.create({
    overwrite: true,
    intermediates: true,
  });

  // Expo SDK 58: File.write is asynchronous.
  await file.write(bytes);

  if (!file.exists || file.size === 0) {
    throw new Error("Could not create the Excel file.");
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: EXCEL_MIME_TYPE,
    dialogTitle: "Save or Share Shavro Report",
    UTI: "org.openxmlformats.spreadsheetml.sheet",
  });
}

// Public helper called from ExportReportScreen.
//
// Web: starts an XLSX download.
// Android/iOS: opens the native share sheet.
//
// Note: Opening a native share sheet does not
// guarantee the user completed a save.
export async function saveExcelReport(
  report: ExcelReportResult,
): Promise<void> {
  validateFileName(report.fileName);

  if (!report.base64) {
    throw new Error("The Excel report is empty.");
  }

  const bytes = decodeBase64(report.base64);

  if (bytes.length === 0) {
    throw new Error("The Excel report contains no data.");
  }

  if (Platform.OS === "web") {
    downloadOnWeb(report.fileName, bytes);

    return;
  }

  if (Platform.OS === "android" || Platform.OS === "ios") {
    await shareOnMobile(report.fileName, bytes);

    return;
  }

  throw new Error("Excel export is not supported on this platform.");
}
