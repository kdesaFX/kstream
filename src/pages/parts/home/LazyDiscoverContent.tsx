import { lazy, Suspense, useEffect, useRef, useState } from "react";

const DiscoverContent = lazy(() => import("@/pages/discover/discoverContent"));

/** Reserve discover tab + first carousel row so lazy mount does not shift layout. */
function DiscoverContentPlaceholder() {
  return <div className="min-h-[20rem]" aria-hidden />;
}

/**
 * Defer discover bundle + TMDB carousel work until the section nears the viewport.
 * Discover sits below continue rows on home — not on the LCP path.
 */
export function LazyDiscoverContent() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || shouldLoad) return undefined;

    if (typeof IntersectionObserver !== "function") {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={hostRef}>
      {shouldLoad ? (
        <Suspense fallback={<DiscoverContentPlaceholder />}>
          <DiscoverContent />
        </Suspense>
      ) : (
        <DiscoverContentPlaceholder />
      )}
    </div>
  );
}
