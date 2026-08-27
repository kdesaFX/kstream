/**
 * Keep R2's kstream-Setup.exe aligned with the latest GitHub Release asset.
 * Used by the Worker cron and the GitHub Actions sync workflow.
 */

export const WINDOWS_INSTALLER_OBJECT_KEY = "kstream-Setup.exe";
export const WINDOWS_INSTALLER_FILENAME = "kstream-Setup.exe";

/** Fallback if R2 object is missing (e.g. local/dev before sync). */
export const WINDOWS_INSTALLER_GITHUB_URL =
  "https://github.com/kdesaFX/kstream-desktop/releases/latest/download/kstream-Setup.exe";

export interface InstallerEnv {
  DOWNLOADS: R2Bucket;
}

export type InstallerSyncResult =
  | { status: "skipped"; reason: string; size: number }
  | { status: "updated"; size: number }
  | { status: "error"; reason: string };

/**
 * Pull the latest installer from GitHub into R2 when the size differs
 * (or the object is missing). Streams the body — no full buffer in memory.
 */
export async function syncWindowsInstallerFromGitHub(
  env: InstallerEnv,
): Promise<InstallerSyncResult> {
  const head = await fetch(WINDOWS_INSTALLER_GITHUB_URL, { method: "HEAD" });
  if (!head.ok && head.status !== 302 && head.status !== 301) {
    // Some CDNs dislike HEAD — fall through to GET.
  }

  let expectedSize = Number(head.headers.get("content-length") || 0);

  // Follow redirects for HEAD if needed (GitHub → Azure).
  if (!expectedSize || head.status >= 300) {
    const probe = await fetch(WINDOWS_INSTALLER_GITHUB_URL, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
    });
    const contentRange = probe.headers.get("content-range");
    const match = contentRange?.match(/\/(\d+)$/);
    expectedSize = match
      ? Number(match[1])
      : Number(probe.headers.get("content-length") || 0);
    // Drain tiny body.
    await probe.body?.cancel();
    if (!probe.ok && probe.status !== 206) {
      return {
        status: "error",
        reason: `GitHub probe failed: HTTP ${probe.status}`,
      };
    }
  }

  const existing = await env.DOWNLOADS.head(WINDOWS_INSTALLER_OBJECT_KEY);
  if (existing && expectedSize > 0 && existing.size === expectedSize) {
    return {
      status: "skipped",
      reason: "R2 already matches GitHub size",
      size: existing.size,
    };
  }

  const res = await fetch(WINDOWS_INSTALLER_GITHUB_URL, {
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    return {
      status: "error",
      reason: `GitHub download failed: HTTP ${res.status}`,
    };
  }

  const size = Number(res.headers.get("content-length") || expectedSize || 0);
  await env.DOWNLOADS.put(WINDOWS_INSTALLER_OBJECT_KEY, res.body, {
    httpMetadata: {
      contentType: "application/octet-stream",
      contentDisposition: `attachment; filename="${WINDOWS_INSTALLER_FILENAME}"`,
      cacheControl: "public, max-age=3600, stale-while-revalidate=86400",
    },
  });

  return { status: "updated", size };
}

/**
 * Stream kstream-Setup.exe from R2 with Range / conditional support.
 * Falls back to GitHub if the object is not present.
 */
export async function serveWindowsInstaller(
  request: Request,
  env: InstallerEnv,
  ctx?: ExecutionContext,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  if (request.method === "HEAD") {
    const meta = await env.DOWNLOADS.head(WINDOWS_INSTALLER_OBJECT_KEY);
    if (!meta) {
      ctx?.waitUntil(syncWindowsInstallerFromGitHub(env));
      return Response.redirect(WINDOWS_INSTALLER_GITHUB_URL, 302);
    }
    const headers = buildHeaders(meta);
    headers.set("Content-Length", String(meta.size));
    return new Response(null, { status: 200, headers });
  }

  const object = await env.DOWNLOADS.get(WINDOWS_INSTALLER_OBJECT_KEY, {
    range: request.headers,
    onlyIf: request.headers,
  });

  if (object === null) {
    ctx?.waitUntil(syncWindowsInstallerFromGitHub(env));
    return Response.redirect(WINDOWS_INSTALLER_GITHUB_URL, 302);
  }

  const headers = buildHeaders(object);

  // Conditional request matched — no body.
  if (!("body" in object) || object.body === null) {
    return new Response(null, { status: 304, headers });
  }

  const hasRange = Boolean(object.range);
  if (hasRange && object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length =
      "length" in object.range && object.range.length != null
        ? object.range.length
        : object.size - offset;
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    headers.set("Content-Length", String(length));
  } else {
    headers.set("Content-Length", String(object.size));
  }

  return new Response(object.body, {
    status: hasRange ? 206 : 200,
    headers,
  });
}

function buildHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Content-Type", "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${WINDOWS_INSTALLER_FILENAME}"`,
  );
  headers.set(
    "Cache-Control",
    "public, max-age=3600, stale-while-revalidate=86400",
  );
  headers.set("Accept-Ranges", "bytes");
  return headers;
}
