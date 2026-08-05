import { conf } from "@/setup/config";
import { scrapeIMDb } from "@/utils/services/imdbScraper";

export interface ImdbRatingResult {
  rating: number;
  votes: number;
  source: "imdb" | "omdb";
}

/**
 * Resolve an IMDb score without requiring the page to stay blank.
 * Order: OMDb (CORS-friendly API key) → page scrape (extension/proxy).
 */
export async function fetchImdbRating(
  imdbId: string,
  type?: "movie" | "show",
): Promise<ImdbRatingResult | null> {
  const omdb = await fetchViaOmdb(imdbId);
  if (omdb) return omdb;

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
    // No proxy/extension — caller may fall back to TMDB display
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
