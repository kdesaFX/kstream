/**
 * Some TMDB "clear logos" are not clear at all - they are flattened onto a
 * solid backdrop (every JPEG one, plus a fair number of PNGs). Those render as
 * a bright rectangle floating over our artwork, so we detect them and let
 * callers fall back to the plain title.
 */

const OPAQUE_ALPHA = 250;
const SAMPLES_PER_EDGE = 12;
const OPAQUE_BORDER_RATIO = 0.9;
/**
 * Details modals await this before rendering, so keep it short - timing out
 * just means we show the logo unchecked.
 */
const PROBE_TIMEOUT_MS = 1500;
/** Cap on how many alternates we decode before giving up on a logo. */
export const MAX_LOGO_CANDIDATES = 4;

export interface LogoImage {
  file_path?: string | null;
  iso_639_1?: string | null;
  vote_average?: number | null;
}

export interface LogoAlphaSource {
  width: number;
  height: number;
  alphaAt: (x: number, y: number) => number;
}

function formatRank(filePath: string): number {
  if (/\.svg$/i.test(filePath)) return 0;
  if (/\.png$/i.test(filePath)) return 1;
  return 2;
}

/** JPEG has no alpha channel, so it always carries a baked background. */
export function isAlwaysOpaqueFormat(filePath: string): boolean {
  return /\.jpe?g$/i.test(filePath);
}

/**
 * Orders logo candidates so the preferred language wins, then formats that can
 * actually be transparent, then TMDB's own vote ranking.
 */
export function rankLogos(
  logos: LogoImage[],
  preferredLanguage: string,
): LogoImage[] {
  const languageRank = (logo: LogoImage) => {
    if (logo.iso_639_1 === preferredLanguage) return 0;
    if (logo.iso_639_1 === "en") return 1;
    if (!logo.iso_639_1) return 2;
    return 3;
  };

  return logos
    .filter((logo): logo is LogoImage & { file_path: string } =>
      Boolean(logo.file_path),
    )
    .map((logo, index) => ({ logo, index }))
    .sort((a, b) => {
      const byLanguage = languageRank(a.logo) - languageRank(b.logo);
      if (byLanguage !== 0) return byLanguage;
      const byFormat =
        formatRank(a.logo.file_path!) - formatRank(b.logo.file_path!);
      if (byFormat !== 0) return byFormat;
      const byVote = (b.logo.vote_average ?? 0) - (a.logo.vote_average ?? 0);
      if (byVote !== 0) return byVote;
      return a.index - b.index;
    })
    .map((entry) => entry.logo);
}

/**
 * A transparent logo is cropped tight to its artwork, so its outer edge is
 * almost entirely see-through. An opaque edge means the background got baked in.
 */
export function hasBakedBackground(pixels: LogoAlphaSource): boolean {
  const { width, height } = pixels;
  if (width < 2 || height < 2) return false;

  const lastX = width - 1;
  const lastY = height - 1;
  const divisor = SAMPLES_PER_EDGE - 1;
  let opaque = 0;
  let total = 0;

  for (let i = 0; i < SAMPLES_PER_EDGE; i += 1) {
    const x = Math.round((lastX * i) / divisor);
    const y = Math.round((lastY * i) / divisor);
    const points: Array<[number, number]> = [
      [x, 0],
      [x, lastY],
      [0, y],
      [lastX, y],
    ];
    for (const [px, py] of points) {
      if (pixels.alphaAt(px, py) >= OPAQUE_ALPHA) opaque += 1;
      total += 1;
    }
  }

  return opaque / total >= OPAQUE_BORDER_RATIO;
}

/**
 * Originals run into the megabytes; TMDB's resized renditions keep the alpha
 * channel intact and give the same verdict for a fraction of the bytes.
 */
export function probeUrlFor(url: string): string {
  return url
    .replace("/t/p/original/", "/t/p/w300/")
    .replace("/t/p/w500/", "/t/p/w300/");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Needed to read pixels back out; TMDB's CDN answers with `ACAO: *`.
    img.crossOrigin = "anonymous";
    const timer = window.setTimeout(
      () => reject(new Error("logo probe timed out")),
      PROBE_TIMEOUT_MS,
    );
    const done = (fn: () => void) => {
      window.clearTimeout(timer);
      fn();
    };
    img.onload = () => done(() => resolve(img));
    img.onerror = () => done(() => reject(new Error("logo failed to load")));
    img.src = url;
  });
}

async function probeLogo(url: string): Promise<boolean> {
  if (isAlwaysOpaqueFormat(url)) return true;
  if (typeof document === "undefined") return false;
  if (/\.svg(\?|$)/i.test(url)) return false;

  const img = await loadImage(probeUrlFor(url));
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return false;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);

  const { data } = ctx.getImageData(0, 0, width, height);
  return hasBakedBackground({
    width,
    height,
    alphaAt: (x, y) => data[(y * width + x) * 4 + 3],
  });
}

const probeCache = new Map<string, Promise<boolean>>();

/**
 * Resolves true when the logo has a solid background rectangle. Anything that
 * goes wrong (network, tainted canvas, no canvas support) resolves false so we
 * keep showing the logo rather than hiding artwork over a failed check.
 */
export function logoHasBakedBackground(url: string): Promise<boolean> {
  const cached = probeCache.get(url);
  if (cached) return cached;
  const result = probeLogo(url).catch(() => false);
  probeCache.set(url, result);
  return result;
}
