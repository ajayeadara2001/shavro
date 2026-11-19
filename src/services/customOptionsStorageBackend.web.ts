export async function readCustomOptionsValue(
  key: string,
): Promise<string | null> {
  if (typeof window === "undefined") {
    throw new Error("Browser storage is unavailable.");
  }

  return window.localStorage.getItem(key);
}

export async function writeCustomOptionsValue(
  key: string,
  value: string,
): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Browser storage is unavailable.");
  }

  window.localStorage.setItem(key, value);
}
