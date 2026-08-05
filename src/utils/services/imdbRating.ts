import { conf } from "@/setup/config";
import { scrapeIMDb } from "@/utils/services/imdbScraper";

export interface ImdbRatingResult {
  rating: number;
  votes: number;
  source: "imdb" | "omdb" | "dataset";
}

/**
 * Resolve an IMDb score in the browser.
 * Order: OMDb (optional key) → Agregarr IMDb dataset → page scrape (extension/proxy).
 */
export async function fetchImdbRating(
  imdbId: string,
  type?: "movie" | "show",
): Promise<ImdbRatingResult | null> {
  const omdb = await fetchViaOmdb(imdbId);
  if (omdb) return omdb;

  const dataset = await fetchViaImdbDataset(imdbId);
  if (dataset) return dataset;

  try {
    const scraped = await scrapeIMDb(
      imdbId,
      undefined,
      undefined,
      undefined,
      type,
    );
    if (
      typeof scraped.imdb_rating === "number" &&
      typeof scraped.votes === "number"
    ) {
      return {
        rating: scraped.imdb_rating,
        votes: scraped.votes,
        source: "imdb",
      };
    }
  } catch {
    // No proxy/extension — score unavailable
  }

  return null;
}

async function fetchViaOmdb(imdbId: string): Promise<ImdbRatingResult | null> {
  const apiKey = conf().OMDB_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      Response?: string;
      imdbRating?: string;
      imdbVotes?: string;
    };
    if (data.Response === "False") return null;
    const rating = Number.parseFloat(data.imdbRating ?? "");
    const votes = Number.parseInt(
      (data.imdbVotes ?? "").replace(/,/g, ""),
      10,
    );
    if (!Number.isFinite(rating) || rating <= 0) return null;
    return {
      rating,
      votes: Number.isFinite(votes) ? votes : 0,
      source: "omdb",
    };
  } catch {
    return null;
  }
}

/**
 * Official IMDb non-commercial ratings dump, proxied by Agregarr (no API key).
 * https://github.com/agregarr/imdb-ratings-api
 */
async function fetchViaImdbDataset(
  imdbId: string,
): Promise<ImdbRatingResult | null> {
  try {
    const url = `https://api.agregarr.org/api/ratings?id=${encodeURIComponent(imdbId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      imdbId?: string;
      rating?: number | null;
      votes?: number | null;
    }>;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row || typeof row.rating !== "number" || row.rating <= 0) return null;
    return {
      rating: row.rating,
      votes: typeof row.votes === "number" ? row.votes : 0,
      source: "dataset",
    };
  } catch {
    return null;
  }
}
