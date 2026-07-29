import { ofetch } from "ofetch";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import { getAuthHeaders, SessionResponse } from "@/backend/accounts/auth";
import { UserResponse } from "@/backend/accounts/user";
import { AccountWithToken } from "@/stores/auth";

export interface PasskeyAuthResponse {
  user: UserResponse;
  session: SessionResponse;
  token: string;
}

interface RegistrationOptionsResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  stateToken: string;
}

interface AuthenticationOptionsResponse {
  options: PublicKeyCredentialRequestOptionsJSON;
  stateToken: string;
}

export async function registerWithPasskey(
  url: string,
  device: string,
  profile: { colorA: string; colorB: string; icon: string },
): Promise<PasskeyAuthResponse> {
  const { options, stateToken } = await ofetch<RegistrationOptionsResponse>(
    "/auth/passkey/register/options",
    {
      method: "POST",
      body: { device, namespace: "movie-web" },
      baseURL: url,
    },
  );

  const attestationResponse = await startRegistration({ optionsJSON: options });

  return ofetch<PasskeyAuthResponse>("/auth/passkey/register/verify", {
    method: "POST",
    body: { stateToken, attestationResponse, profile },
    baseURL: url,
  });
}

export async function loginWithPasskey(
  url: string,
  device: string,
): Promise<PasskeyAuthResponse> {
  const { options, stateToken } = await ofetch<AuthenticationOptionsResponse>(
    "/auth/passkey/login/options",
    {
      method: "POST",
      baseURL: url,
    },
  );

  const assertionResponse = await startAuthentication({ optionsJSON: options });

  return ofetch<PasskeyAuthResponse>("/auth/passkey/login/verify", {
    method: "POST",
    body: { stateToken, assertionResponse, device },
    baseURL: url,
  });
}

export async function addPasskey(
  url: string,
  account: AccountWithToken,
  device: string,
): Promise<void> {
  const { options, stateToken } = await ofetch<RegistrationOptionsResponse>(
    "/auth/passkey/add/options",
    {
      method: "POST",
      body: { device },
      baseURL: url,
      headers: getAuthHeaders(account.token),
    },
  );

  const attestationResponse = await startRegistration({ optionsJSON: options });

  await ofetch("/auth/passkey/add/verify", {
    method: "POST",
    body: { stateToken, attestationResponse },
    baseURL: url,
    headers: getAuthHeaders(account.token),
  });
}
