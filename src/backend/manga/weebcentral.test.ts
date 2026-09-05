/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  buildFallbackSearchQueries,
  decodeHtmlEntities,
  isUsableWeebCentralHtml,
  normalizeMangaTitle,
  parseChapterImages,
  parseChapterList,
  parseSearchResults,
  parseSeriesPage,
  pickBestSeriesHit,
  pickMatchingSeries,
  pagesBelongToTitle,
  titleSatisfiesQuery,
} from "@/backend/manga/weebcentral";

const SEARCH_HTML = `
<article class="bg-base-300 flex gap-4 p-4">
  <a href="https://weebcentral.com/series/01J76XYCPSY3C4BNPBRY8JMCBE/Solo-Leveling">
    <img src="https://temp.compsci88.com/cover/fallback/01J76XYCPSY3C4BNPBRY8JMCBE.jpg" alt="Solo Leveling cover">
  </a>
  <a href="https://weebcentral.com/series/01J76XYCPSY3C4BNPBRY8JMCBE/Solo-Leveling" class="line-clamp-1 link link-hover">Solo Leveling</a>
</article>
<article class="bg-base-300 flex gap-4 p-4">
  <a href="https://weebcentral.com/series/01J76XYEJVJ5H6AXPYWS4G0CFV/Solo-Leveling-Volume-Version">
    <img alt="Solo Leveling (Volume) cover">
  </a>
  <a href="https://weebcentral.com/series/01J76XYEJVJ5H6AXPYWS4G0CFV/Solo-Leveling-Volume-Version" class="line-clamp-1 link link-hover">Solo Leveling (Volume)</a>
</article>
`;

const CHAPTERS_HTML = `
<a href="/chapters/01J76XZ666GREP4DQDKEP1YDZG" class="hover:bg-base-300 flex-1 flex items-center p-2">
  <span class="">Chapter 200</span>
  <time datetime="2024-09-07T17:04:15.717Z"></time>
</a>
<a href="/chapters/01J76XYXYZGGRVGEGATYQWFTD8" class="hover:bg-base-300 flex-1 flex items-center p-2">
  <span class="">Chapter 1</span>
  <time datetime="2018-03-04T00:00:00.000Z"></time>
</a>
`;

const IMAGES_HTML = `
<section id="chapter-images">
  <img src="https://hot.planeptune.us/manga/Solo-Leveling/0000-001.png" alt="Page 1">
  <img src="https://hot.planeptune.us/manga/Solo-Leveling/0000-002.png" alt="Page 2">
  <img src="/static/images/broken_image.jpg" alt="">
</section>
`;

const SERIES_HTML = `
<h1 class="hidden md:block text-2xl font-bold">Solo Leveling</h1>
<li><strong>Author(s): </strong><span><a href="https://weebcentral.com/search?author=GEE+So-Lyung">GEE So-Lyung</a></span></li>
<li><strong>Tags(s): </strong><span><a href="https://weebcentral.com/search?included_tag=Action">Action</a></span></li>
<li><strong>Type: </strong><a href="https://weebcentral.com/search?included_type=Manhwa">Manhwa</a></li>
<li><strong>Status: </strong><a href="https://weebcentral.com/search?included_status=Complete">Complete</a></li>
<li><strong>Released: </strong><span>2018</span></li>
<li><strong>Adult Content: </strong><a href="https://weebcentral.com/search?adult=False">No</a></li>
<li><strong>Description</strong><p class="whitespace-pre-wrap">E-class hunter Jinwoo Sung is the weakest of them all.</p></li>
`;

describe("weebcentral parsers", () => {
  it("pulls unique series out of a search page", () => {
    const hits = parseSearchResults(SEARCH_HTML);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      id: "01J76XYCPSY3C4BNPBRY8JMCBE",
      title: "Solo Leveling",
    });
    expect(hits[0]?.poster).toContain("01J76XYCPSY3C4BNPBRY8JMCBE");
  });

  it("lists chapters oldest-first so the reader starts at chapter 1", () => {
    const chapters = parseChapterList(CHAPTERS_HTML);
    expect(chapters.map((c) => c.chapter)).toEqual(["1", "200"]);
    expect(chapters[0]?.source).toBe("weebcentral");
    expect(chapters[0]?.id).toBe("01J76XYXYZGGRVGEGATYQWFTD8");
  });

  it("keeps real page images and drops the broken-image placeholder", () => {
    expect(parseChapterImages(IMAGES_HTML)).toEqual([
      "https://hot.planeptune.us/manga/Solo-Leveling/0000-001.png",
      "https://hot.planeptune.us/manga/Solo-Leveling/0000-002.png",
    ]);
  });

  it("drops minority foreign series images from a chapter payload", () => {
    const mixed = `
<section id="chapter-images">
  <img src="https://hot.planeptune.us/manga/Jujutsu-Kaisen/0013-001.png" alt="">
  <img src="https://hot.planeptune.us/manga/Jujutsu-Kaisen/0013-002.png" alt="">
  <img src="https://hot.planeptune.us/manga/D.Gray-man/0029-001.png" alt="">
</section>
`;
    expect(parseChapterImages(mixed)).toEqual([
      "https://hot.planeptune.us/manga/Jujutsu-Kaisen/0013-001.png",
      "https://hot.planeptune.us/manga/Jujutsu-Kaisen/0013-002.png",
    ]);
  });

  it("rejects Hardcore Leveling Warrior page URLs for Solo Leveling", () => {
    expect(
      pagesBelongToTitle(
        [
          "https://hot.planeptune.us/manga/Solo-Leveling/0000-001.png",
        ],
        "Solo Leveling",
      ),
    ).toBe(true);
    expect(
      pagesBelongToTitle(
        [
          "https://hot.planeptune.us/manga/Hardcore-Leveling-Warrior/0001-001.png",
        ],
        "Solo Leveling",
      ),
    ).toBe(false);
  });

  it("rejects Horimiya pages when reading Jujutsu Kaisen", () => {
    expect(
      pagesBelongToTitle(
        [
          "https://hot.planeptune.us/manga/Horimiya/0017-001.png",
        ],
        "Jujutsu Kaisen",
      ),
    ).toBe(false);
  });

  it("reads series metadata off the info page", () => {
    const details = parseSeriesPage(SERIES_HTML, "01J76XYCPSY3C4BNPBRY8JMCBE");
    expect(details.title).toBe("Solo Leveling");
    expect(details.year).toBe(2018);
    expect(details.status).toBe("completed");
    expect(details.adult).toBe(false);
    expect(details.readingDirection).toBe("ltr");
    expect(details.tags.map((t) => t.name)).toContain("Action");
    expect(details.description).toMatch(/Jinwoo Sung/);
    expect(details.availableLanguages).toEqual(["en"]);
  });

  it("only attaches chapters when the title matches exactly", () => {
    const hits = parseSearchResults(SEARCH_HTML);
    expect(pickMatchingSeries("Solo Leveling", hits)?.id).toBe(
      "01J76XYCPSY3C4BNPBRY8JMCBE",
    );
    expect(pickMatchingSeries("Solo Leveling: Ragnarok", hits)).toBeUndefined();
  });

  it("treats punctuation as noise when comparing titles", () => {
    expect(normalizeMangaTitle("Solo Leveling!")).toBe(
      normalizeMangaTitle("solo leveling"),
    );
    expect(decodeHtmlEntities("Jinwoo &amp; the dungeon")).toBe(
      "Jinwoo & the dungeon",
    );
  });

  it("keeps non-latin titles distinct instead of collapsing to empty", () => {
    expect(normalizeMangaTitle("オクターヴ")).toBe("オクターヴ");
    expect(normalizeMangaTitle("オクターヴ")).not.toBe(
      normalizeMangaTitle("ノラガミ"),
    );
    expect(normalizeMangaTitle("눈의 녹은 자리").length).toBeGreaterThan(0);
  });

  it("rejects challenge pages so a blocked proxy cannot count as a hit", () => {
    expect(isUsableWeebCentralHtml("<article>nope</article>")).toBe(false);
    expect(isUsableWeebCentralHtml('{"error":"blocked"}')).toBe(false);
    expect(
      isUsableWeebCentralHtml(
        '<a href="https://weebcentral.com/series/01J76XYCPSY3C4BNPBRY8JMCBE/Solo-Leveling">Solo Leveling</a>',
      ),
    ).toBe(true);
  });

  it("builds fallback search queries from long licensed titles", () => {
    const queries = buildFallbackSearchQueries(
      "Don't Toy With Me, Miss Nagatoro!",
      ["Ijiranaide, Nagatoro-san"],
    );
    expect(queries.length).toBeLessThanOrEqual(8);
    expect(queries[0]).toBe("Don't Toy With Me, Miss Nagatoro!");
    expect(
      queries.some((q) => normalizeMangaTitle(q).includes("ijiranaide")),
    ).toBe(true);
  });

  it("searches shortened romaji when MangaDex particle spelling misses WeebCentral", () => {
    const queries = buildFallbackSearchQueries("My Dress-Up Darling", [
      "Sono Bisque Doll wa Koi o Suru",
      "その着せ替え人形は恋をする",
      "ماي دريس-أب دارلينغ",
    ]);
    expect(queries).toContain("Sono Bisque");
    expect(queries).toContain("Sono Bisque Doll");
    expect(queries.some((q) => /着せ替え|ماي/.test(q))).toBe(false);
    expect(queries.length).toBeLessThanOrEqual(10);
  });

  it("keeps romaji prefixes when many English alternate titles exist", () => {
    const queries = buildFallbackSearchQueries("My Dress-Up Darling", [
      "Sono Bisque Doll wa Koi o Suru",
      "Sono Bisque Doll ha Koi wo Suru",
      "The Bisque Doll Falls In Love",
      "The Bisque Doll Is Falling In Love",
      "Sexy Cosplay Doll",
      "More than a Doll",
      "Projekt Cosplay",
    ]);
    expect(queries.indexOf("Sono Bisque")).toBeGreaterThan(-1);
    expect(queries.indexOf("Sono Bisque")).toBeLessThan(7);
  });

  it("does not search generic words like Leveling on their own", () => {
    const queries = buildFallbackSearchQueries("Solo Leveling");
    expect(queries).toEqual(["Solo Leveling"]);
    expect(queries).not.toContain("Leveling");
    expect(queries).not.toContain("Solo");
  });

  it("does not treat Fan-Colored / Oneshot as the main series", () => {
    const main = {
      id: "01KOMIMAIN0000000000000001",
      slug: "Komi-Cant-Communicate",
      title: "Komi Can't Communicate",
      poster: "",
    };
    const fan = {
      id: "01KOMIFAN00000000000000001",
      slug: "Komi-Cant-Communicate-Fan-Colored",
      title: "Komi Can't Communicate (Fan-Colored)",
      poster: "",
    };
    const oneshot = {
      id: "01KOMIONE00000000000000001",
      slug: "Komi-Cant-Communicate-Oneshot",
      title: "Komi Can't Communicate. (Oneshot)",
      poster: "",
    };
    expect(pickBestSeriesHit("Komi Can't Communicate", [fan, oneshot, main])?.title).toBe(
      "Komi Can't Communicate",
    );
    expect(pickBestSeriesHit("Komi Can't Communicate", [fan, oneshot])?.title).toBeUndefined();
  });

  it("picks the main series when the English title does not match WC exactly", () => {
    const hits = parseSearchResults(SEARCH_HTML);
    const nagatoroHits = [
      ...hits,
      {
        id: "01NAGATOROMAIN000000000001",
        slug: "Ijiranaide-Nagatoro-san",
        title: "Ijiranaide Nagatoro san",
        poster: "",
      },
      {
        id: "01NAGATOROSPIN000000000002",
        slug: "Nagatoro-Anthology",
        title: "Nagatoro Anthology",
        poster: "",
      },
    ];
    expect(
      pickBestSeriesHit("Don't Toy With Me, Miss Nagatoro!", nagatoroHits)?.title,
    ).toBe("Ijiranaide Nagatoro san");
    expect(
      pickBestSeriesHit("Nagatoro", nagatoroHits)?.title,
    ).toBe("Ijiranaide Nagatoro san");
  });

  it("does not treat Hardcore Leveling Warrior as Solo Leveling", () => {
    const hclw = {
      id: "01HCLW00000000000000000001",
      slug: "Hardcore-Leveling-Warrior",
      title: "Hardcore Leveling Warrior",
      poster: "",
    };
    const solo = {
      id: "01J76XYCPSY3C4BNPBRY8JMCBE",
      slug: "Solo-Leveling",
      title: "Solo Leveling",
      poster: "",
    };
    expect(titleSatisfiesQuery("Solo Leveling", hclw.title)).toBe(false);
    expect(pickBestSeriesHit("Solo Leveling", [hclw])).toBeUndefined();
    expect(pickBestSeriesHit("Solo Leveling", [hclw, solo])?.title).toBe(
      "Solo Leveling",
    );
    expect(pickBestSeriesHit("Leveling", [hclw])).toBeUndefined();
  });

  it("matches romaji prefix queries against WeebCentral slug titles", () => {
    const dressUp = {
      id: "01J76XYCMP8059QS9PDPHBMEQW",
      slug: "Sono-Bisque-Doll-Wa-Koi-Wo-Suru",
      title: "My Dress-Up Darling",
      poster: "",
    };
    expect(pickBestSeriesHit("Sono Bisque", [dressUp])?.title).toBe(
      "My Dress-Up Darling",
    );
    expect(
      pickBestSeriesHit("My Dress-Up Darling", [dressUp])?.title,
    ).toBe("My Dress-Up Darling");
  });
});
