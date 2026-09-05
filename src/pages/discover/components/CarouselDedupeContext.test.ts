/** @vitest-environment jsdom */
/* eslint-disable import/no-extraneous-dependencies */
import {
  act,
  createElement,
  useState,
  type ReactElement,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  CarouselDedupeProvider,
  assignCarouselClaims,
  collapseTitleYearDuplicates,
  mediaTitleKey,
  useDedupedMedia,
  type ClaimableMedia,
} from "@/pages/discover/components/CarouselDedupeContext";

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

async function flushDedupeNotify() {
  await act(async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  });
}

describe("mediaTitleKey", () => {
  it("uses year when release dates are absent (manga cards)", () => {
    expect(
      mediaTitleKey({ id: "a", title: "Berserk", year: 1989 }),
    ).toBe("berserk|1989");
  });

  it("matches the same manga across carousels by title and year", () => {
    const a = mediaTitleKey({ id: "1", title: "Berserk", year: 1989 });
    const b = mediaTitleKey({ id: "2", title: "Berserk", year: 1989 });
    expect(a).toBe(b);
  });

  it("stays stable when year is missing instead of flipping later", () => {
    expect(mediaTitleKey({ id: 42, title: "Ride Your Wave" })).toBe(
      "ride your wave|#42",
    );
  });
});

describe("assignCarouselClaims", () => {
  it("lets lower priority keep a shared title+year", () => {
    const rows = [
      {
        priority: 1,
        items: [{ id: 2, title: "The Odyssey", release_date: "2024-01-01" }],
      },
      {
        priority: 0,
        items: [{ id: 1, title: "The Odyssey", release_date: "2024-01-01" }],
      },
    ];
    const map = assignCarouselClaims(rows);
    expect(map.get(0)).toEqual(["1"]);
    expect(map.get(1)).toEqual([]);
  });

  it("collapses same-title stubs by vote_count before assigning", () => {
    const collapsed = collapseTitleYearDuplicates([
      { id: 1, title: "Dune", release_date: "2021-01-01", vote_count: 10 },
      { id: 2, title: "Dune", release_date: "2021-01-01", vote_count: 900 },
    ]);
    expect(collapsed.map((m) => m.id)).toEqual([2]);

    const map = assignCarouselClaims([
      { priority: 0, items: collapsed },
      {
        priority: 1,
        items: [{ id: 1, title: "Dune", release_date: "2021-01-01" }],
      },
    ]);
    expect(map.get(0)).toEqual(["2"]);
    expect(map.get(1)).toEqual([]);
  });

  it("releases ownership when a row becomes empty", () => {
    const withItems = assignCarouselClaims([
      {
        priority: 0,
        items: [{ id: 1, title: "Solo", release_date: "2018-01-01" }],
      },
      {
        priority: 1,
        items: [{ id: 1, title: "Solo", release_date: "2018-01-01" }],
      },
    ]);
    expect(withItems.get(0)).toEqual(["1"]);
    expect(withItems.get(1)).toEqual([]);

    const released = assignCarouselClaims([
      { priority: 0, items: [] },
      {
        priority: 1,
        items: [{ id: 1, title: "Solo", release_date: "2018-01-01" }],
      },
    ]);
    expect(released.get(0)).toEqual([]);
    expect(released.get(1)).toEqual(["1"]);
  });

  it("lets P0 steal an id that P1 held once P0 includes it", () => {
    const before = assignCarouselClaims([
      { priority: 0, items: [{ id: 9, title: "Other" }] },
      { priority: 1, items: [{ id: 5, title: "Hit" }] },
    ]);
    expect(before.get(1)).toEqual(["5"]);

    const after = assignCarouselClaims([
      { priority: 0, items: [{ id: 5, title: "Hit" }] },
      { priority: 1, items: [{ id: 5, title: "Hit" }] },
    ]);
    expect(after.get(0)).toEqual(["5"]);
    expect(after.get(1)).toEqual([]);
  });

  it("stays O(updates) across many distinct ownership walks", () => {
    let previous: string | null = null;
    for (let n = 0; n < 12; n += 1) {
      const rows = Array.from({ length: n + 1 }, (_, priority) => ({
        priority,
        items: [
          {
            id: 1000 + priority,
            title: `Title ${priority}`,
            release_date: "2020-01-01",
          },
          ...(priority > 0
            ? [
                {
                  id: 1000,
                  title: "Title 0",
                  release_date: "2020-01-01",
                } satisfies ClaimableMedia,
              ]
            : []),
        ],
      }));
      const map = assignCarouselClaims(rows);
      const fp = [...map.entries()]
        .map(([p, ids]) => `${p}:${ids.join(",")}`)
        .sort()
        .join("|");
      expect(fp).not.toBe(previous);
      previous = fp;
      expect(map.get(0)).toEqual(["1000"]);
    }
  });
});

function StubRow({
  priority,
  items,
  onIds,
}: {
  priority: number;
  items: ClaimableMedia[];
  onIds: (priority: number, ids: string[]) => void;
}): null {
  const media = useDedupedMedia(priority, items);
  onIds(
    priority,
    media.map((m) => String(m.id)),
  );
  return null;
}

describe("CarouselDedupeProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("dedupes overlapping rows without exceeding update depth", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const renderRoot = root;

    const seen: Record<number, string[]> = {};
    let renders = 0;

    function Harness({
      row1,
      row2,
      row3,
    }: {
      row1: ClaimableMedia[];
      row2: ClaimableMedia[];
      row3: ClaimableMedia[];
    }): ReactElement {
      renders += 1;
      return createElement(
        CarouselDedupeProvider,
        null,
        createElement(StubRow, {
          priority: 0,
          items: row1,
          onIds: (p, ids) => {
            seen[p] = ids;
          },
        }),
        createElement(StubRow, {
          priority: 1,
          items: row2,
          onIds: (p, ids) => {
            seen[p] = ids;
          },
        }),
        createElement(StubRow, {
          priority: 2,
          items: row3,
          onIds: (p, ids) => {
            seen[p] = ids;
          },
        }),
      );
    }

    await act(async () => {
      renderRoot.render(
        createElement(Harness, {
          row1: [{ id: 1, title: "Shared", release_date: "2021-01-01" }],
          row2: [{ id: 1, title: "Shared", release_date: "2021-01-01" }],
          row3: [{ id: 2, title: "Unique", release_date: "2022-01-01" }],
        }),
      );
    });
    await flushDedupeNotify();

    expect(seen[0]).toEqual(["1"]);
    expect(seen[1]).toEqual([]);
    expect(seen[2]).toEqual(["2"]);

    for (let i = 0; i < 9; i += 1) {
      const extra = i;
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        renderRoot.render(
          createElement(Harness, {
            row1: [
              { id: 1, title: "Shared", release_date: "2021-01-01" },
              {
                id: 10 + extra,
                title: `P0 Extra ${extra}`,
                release_date: "2023-01-01",
              },
            ],
            row2: [
              { id: 1, title: "Shared", release_date: "2021-01-01" },
              {
                id: 20 + extra,
                title: `P1 Extra ${extra}`,
                release_date: "2023-01-01",
              },
            ],
            row3: [
              { id: 2, title: "Unique", release_date: "2022-01-01" },
              {
                id: 30 + extra,
                title: `P2 Extra ${extra}`,
                release_date: "2023-01-01",
              },
            ],
          }),
        );
      });
      // eslint-disable-next-line no-await-in-loop
      await flushDedupeNotify();
    }

    expect(renders).toBeLessThan(80);
    expect(seen[0]).toContain("1");
    expect(seen[1]).not.toContain("1");
  });

  it("survives mounting rows over time without max update depth", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const renderRoot = root;
    const mountEl = container;

    function Growing(): ReactElement {
      const [count, setCount] = useState(1);
      return createElement(
        CarouselDedupeProvider,
        null,
        ...Array.from({ length: count }, (_, priority) =>
          createElement(StubRow, {
            key: priority,
            priority,
            items: [
              {
                id: priority === 0 ? 1 : priority + 10,
                title: priority === 0 ? "Shared" : `Row ${priority}`,
                release_date: "2020-01-01",
              },
              ...(priority > 0
                ? [
                    {
                      id: 1,
                      title: "Shared",
                      release_date: "2020-01-01",
                    } satisfies ClaimableMedia,
                  ]
                : []),
            ],
            onIds: () => undefined,
          }),
        ),
        createElement(
          "button",
          {
            type: "button",
            onClick: () => setCount((c) => c + 1),
          },
          "add",
        ),
      );
    }

    await act(async () => {
      renderRoot.render(createElement(Growing));
    });
    await flushDedupeNotify();

    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        const button = mountEl.querySelector("button");
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // eslint-disable-next-line no-await-in-loop
      await flushDedupeNotify();
    }

    expect(mountEl.querySelectorAll("button")).toHaveLength(1);
  });

  it("does not throw max update depth when many rows update rapidly", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const renderRoot = root;
    let boom: Error | null = null;

    function Storm(): ReactElement {
      const [tick, setTick] = useState(0);
      return createElement(
        CarouselDedupeProvider,
        null,
        ...Array.from({ length: 8 }, (_, priority) =>
          createElement(StubRow, {
            key: priority,
            priority,
            items: [
              {
                id: tick * 100 + priority,
                title: `T${tick}-${priority}`,
                release_date: "2021-01-01",
              },
              {
                id: 1,
                title: "Shared",
                release_date: "2021-01-01",
              },
            ],
            onIds: () => undefined,
          }),
        ),
        createElement(
          "button",
          {
            type: "button",
            onClick: () => setTick((t) => t + 1),
          },
          "tick",
        ),
      );
    }

    await act(async () => {
      renderRoot.render(createElement(Storm));
    });
    await flushDedupeNotify();

    try {
      for (let i = 0; i < 15; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
          container
            .querySelector("button")
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        // eslint-disable-next-line no-await-in-loop
        await flushDedupeNotify();
      }
    } catch (err) {
      boom = err as Error;
    }

    expect(boom).toBeNull();
  });
});
