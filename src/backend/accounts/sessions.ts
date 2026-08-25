import {
  fetchDevices,
  removeDevice,
  signOut as supabaseSignOut,
  updateProfile,
} from "@/backend/supabase/data";
import { AccountWithToken, useAuthStore } from "@/stores/auth";

export async function getSessions(_url: string, account: AccountWithToken) {
  const devices = await fetchDevices(account.userId);
  return devices.map((d) => ({
    id: d.client_id,
    userId: account.userId,
    createdAt: d.last_seen,
    accessedAt: d.last_seen,
    device: d.device_name,
    userAgent: d.user_agent ?? "",
  }));
}

export async function removeSession(
  _url: string,
  _token: string,
  sessionId: string,
) {
  const account = useAuthStore.getState().account;
  if (!account) return;
  await removeDevice(account.userId, sessionId);
}

export async function signOut(
  _url: string,
  _token: string,
  scope: "local" | "global" = "local",
) {
  await supabaseSignOut(scope);
}

export async function updateSession(
  _url: string,
  account: AccountWithToken,
  _sessionId: string,
  deviceName: string,
) {
  await updateProfile(account.userId, { deviceName });
}
