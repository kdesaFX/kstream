import { useEffect, useState } from "react";

/** Shared “. .. ...” pulse for player stage status lines. */
export function useAnimatedEllipsis(intervalMs = 450) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDotCount((count) => (count % 3) + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return ` ${". ".repeat(dotCount).trimEnd()}`;
}
