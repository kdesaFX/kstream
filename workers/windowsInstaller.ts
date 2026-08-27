/** Serve the Windows installer from R2 (same-origin CDN). */

export const WINDOWS_INSTALLER_OBJECT_KEY = "kstream-Setup.exe";
export const WINDOWS_INSTALLER_FILENAME = "kstream-Setup.exe";

/** Fallback if R2 object is missing (e.g. local/dev before sync). */
export const WINDOWS_INSTALLER_GITHUB_URL =
  "https://github.com/kdesaFX/kstream-desktop/releases/latest/download/kstream-Setup.exe";

export interface InstallerEnv {
  DOWNLOADS: R2Bucket;
}

/**
 * Stream kstream-Setup.exe from R2 with Range / conditional support.
 * Falls back to GitHub if the object is not present.
 */
export async function serveWindowsInstaller(
  request: Request,
  env: InstallerEnv,
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
