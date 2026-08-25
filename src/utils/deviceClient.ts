const DEVICE_CLIENT_ID_KEY = "kstream::device-client-id";

/** Stable per-browser id so multiple logins are not collapsed by display name. */
export function getDeviceClientId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_CLIENT_ID_KEY);
    if (existing && existing.length > 0) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_CLIENT_ID_KEY, id);
    return id;
  } catch {
    return "anonymous-device";
  }
}

/** Friendly label from the current user agent (Chrome on Windows, etc.). */
export function suggestDeviceName(userAgent = navigator.userAgent): string {
  const ua = userAgent || "";
  let browser = "Browser";
  if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";

  let os = "Device";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS/i.test(ua)) os = "Mac";
  else if (/Linux/i.test(ua)) os = "Linux";

  return `${browser} on ${os}`;
}
