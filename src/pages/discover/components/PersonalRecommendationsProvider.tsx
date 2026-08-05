import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import {
  usePersonalRecommendations,
  type UsePersonalRecommendationsReturn,
} from "../hooks/usePersonalRecommendations";

interface PersonalRecommendationsContextValue {
  movies: UsePersonalRecommendationsReturn;
  shows: UsePersonalRecommendationsReturn;
}

const PersonalRecommendationsContext =
  createContext<PersonalRecommendationsContextValue | null>(null);

/**
 * One movie + one show recommendation fetch for the whole For You tab.
 * Prevents each carousel from owning its own copy of the feed (and
 * independently resetting when unrelated UI state changes).
 */
export function PersonalRecommendationsProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const movies = usePersonalRecommendations({ isTVShow: false, enabled });
  const shows = usePersonalRecommendations({ isTVShow: true, enabled });

  const value = useMemo(
    () => ({ movies, shows }),
    [movies, shows],
  );

  return (
    <PersonalRecommendationsContext.Provider value={value}>
      {children}
    </PersonalRecommendationsContext.Provider>
  );
}

/**
 * Prefer the shared provider feed when present. Outside a provider
 * (e.g. Movies/TV tab "For You" row), fetch locally instead.
 */
export function useSharedPersonalRecommendations(
  isTVShow: boolean,
  enabled = true,
): UsePersonalRecommendationsReturn {
  const ctx = useContext(PersonalRecommendationsContext);
  const local = usePersonalRecommendations({
    isTVShow,
    // Skip local fetch when the shared provider already owns the data.
    enabled: enabled && !ctx,
  });

  if (ctx) return isTVShow ? ctx.shows : ctx.movies;
  return local;
}
