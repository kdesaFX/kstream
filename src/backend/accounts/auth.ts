import { getAuthProviderInfo } from "@/backend/supabase/data";

export interface AuthStatusResponse {
  isLegacyPassphrase: boolean;
  hasPassword: boolean;
  username: string | null;
  email: string | null;
  hasPasskey: boolean;
  isGoogle: boolean;
  isDiscord: boolean;
}

export interface SessionResponse {
  id: string;
  userId: string;
  createdAt: string;
  accessedAt: string;
  device: string;
  userAgent: string;
}
export interface LoginResponse {
  session: SessionResponse;
  token: string;
}

export function getAuthHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}

export async function getAuthStatus(
  _url: string,
  _token: string,
): Promise<AuthStatusResponse> {
  const info = await getAuthProviderInfo();
  return {
    isLegacyPassphrase: false,
    hasPassword: info.hasPassword,
    username: info.email,
    email: info.email,
    hasPasskey: false,
    isGoogle: info.isGoogle,
    isDiscord: info.isDiscord,
  };
}
