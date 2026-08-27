import nacl from "npm:tweetnacl@1.0.3";

const DISCORD_API = "https://discord.com/api/v10";

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function verifyDiscordRequest(
  request: Request,
  publicKeyHex: string,
): Promise<{ valid: boolean; body: string }> {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const body = await request.text();

  if (!signature || !timestamp) {
    return { valid: false, body };
  }

  const message = new TextEncoder().encode(timestamp + body);
  const sig = hexToBytes(signature);
  const key = hexToBytes(publicKeyHex);

  const valid = nacl.sign.detached.verify(message, sig, key);
  return { valid, body };
}

export async function discordRequest(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bot ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${DISCORD_API}${path}`, { ...init, headers });
}

export async function discordJson<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await discordRequest(token, path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export type Interaction = {
  id: string;
  type: number;
  token: string;
  data?: {
    name?: string;
    options?: Array<{
      name: string;
      type: number;
      value?: string;
      options?: Interaction["data"]["options"];
    }>;
    custom_id?: string;
  };
  member?: {
    user: { id: string; username: string; global_name?: string };
    roles: string[];
    permissions: string;
  };
  user?: { id: string; username: string; global_name?: string };
  guild_id?: string;
  channel_id?: string;
  message?: { id: string };
};

export function interactionUser(interaction: Interaction) {
  return interaction.member?.user ?? interaction.user;
}

export function hasAdmin(interaction: Interaction): boolean {
  const perms = BigInt(interaction.member?.permissions ?? "0");
  return (perms & 8n) === 8n;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function ephemeral(content: string) {
  return {
    type: 4,
    data: { content, flags: 64 },
  };
}

export function channelMessage(content: string, embeds?: unknown[]) {
  return {
    type: 4,
    data: { content, embeds },
  };
}

export function deferredEphemeral() {
  return { type: 5, data: { flags: 64 } };
}

export async function followUp(
  token: string,
  applicationId: string,
  interactionToken: string,
  data: Record<string, unknown>,
) {
  await discordRequest(
    token,
    `/webhooks/${applicationId}/${interactionToken}`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function editOriginal(
  token: string,
  applicationId: string,
  interactionToken: string,
  data: Record<string, unknown>,
) {
  await discordRequest(
    token,
    `/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}
