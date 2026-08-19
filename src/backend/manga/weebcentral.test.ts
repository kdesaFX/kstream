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

  it("reads series metadata off the info page", () => {
    const details = parseSeriesPage(SERIES_HTML, "01J76XYCPSY3C4BNPBRY8JMCBE");
    expect(details.title).toBe("Solo Leveling");
    expect(details.year).toBe(2018);
    expect(details.status).toBe("completed");
    expect(details.adult).toBe(false);
    expect(details.readingDirection).toBe("ltr");
    expect(details.tags.map((t) => t.name)).toContain("Action");
    expect(details.description).toMatch(/Jinwoo Sung/);
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
    expect(queries[0]).toBe("Don't Toy With Me, Miss Nagatoro!");
    expect(queries).toContain("Ijiranaide, Nagatoro-san");
    expect(queries).toContain("Nagatoro");
  });

  it("does not search generic words like Leveling on their own", () => {
    const queries = buildFallbackSearchQueries("Solo Leveling");
    expect(queries).toEqual(["Solo Leveling"]);
    expect(queries).not.toContain("Leveling");
    expect(queries).not.toContain("Solo");
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
});
