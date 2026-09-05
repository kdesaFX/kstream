/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { isWeebCentralId } from "@/backend/manga/ids";
import { isComickChapterId } from "@/backend/manga/sources/comick";

/** Mirrors catalog.ts page-task ordering helpers. */
function orderPageSourceIds(chapterId: string, altIds: string[]) {
  const isMirrorChapterId = (id: string) =>
    isWeebCentralId(id) || isComickChapterId(id);
  const mirrorIds: string[] = [];
  const mangadexIds: string[] = [];
  const pushId = (id: string) => {
    if (isMirrorChapterId(id)) {
      if (!mirrorIds.includes(id)) mirrorIds.push(id);
    } else if (!mangadexIds.includes(id)) {
      mangadexIds.push(id);
    }
  };
  pushId(chapterId);
  for (const alt of altIds) pushId(alt);
  return [...mirrorIds, ...mangadexIds];
}

describe("page source task order", () => {
  it("puts WeebCentral / Comick ids before MangaDex", () => {
    const md = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const wc = "01J76XYCPSY3C4BNPBRY8JMCBE";
    const ck = "comick-abc";
    expect(orderPageSourceIds(md, [wc, ck])).toEqual([wc, ck, md]);
    expect(orderPageSourceIds(wc, [md])).toEqual([wc, md]);
  });
});

describe("proxiedChapterPageUrls", () => {
  it("wraps URLs through the local proxy in browser", async () => {
    const { proxiedChapterPageUrls } = await import("@/backend/manga/mangadex");
    const url = "https://cmdxd98sb0x3yprd.mangadex.network/data/x/y.png";
    const proxied = proxiedChapterPageUrls([url]);
    expect(proxied[0]).toContain("/api/proxy");
    expect(proxied[0]).toContain(encodeURIComponent(url));
  });
});
