import { useEffect, useState } from "react";
import { generatePath, useNavigate, useParams } from "react-router-dom";

function decode(query: string | null | undefined) {
  if (!query) return "";
  try {
    return decodeURIComponent(query);
  } catch {
    return "";
  }
}

// Draft search is shared across Navigation + HomePage so typing in the nav
// bar updates results without waiting for a URL commit.
type DraftListener = (value: string) => void;
const draftListeners = new Set<DraftListener>();
let searchDraft = "";

function setSharedDraft(value: string) {
  searchDraft = value;
  draftListeners.forEach((listener) => listener(value));
}

export function useSearchQuery(): [
  string,
  (inp: string, force?: boolean) => void,
  (newSearch?: string) => void,
] {
  const navigate = useNavigate();
  const params = useParams<{ query: string }>();
  const [search, setSearch] = useState(() => {
    const fromUrl = decode(params.query);
    if (fromUrl) searchDraft = fromUrl;
    return fromUrl || searchDraft;
  });

  useEffect(() => {
    const fromUrl = decode(params.query);
    setSearch(fromUrl);
    searchDraft = fromUrl;
  }, [params.query]);

  useEffect(() => {
    const listener: DraftListener = (value) => setSearch(value);
    draftListeners.add(listener);
    return () => {
      draftListeners.delete(listener);
    };
  }, []);

  const updateParams = (inp: string, commitToUrl = false) => {
    setSearch(inp);
    setSharedDraft(inp);
    if (!commitToUrl) return;
    const current = decode(params.query);
    if (inp === current) return;
    if (inp.length === 0) {
      navigate("/", { replace: true });
      return;
    }
    navigate(
      generatePath("/browse/:query", {
        query: encodeURIComponent(inp),
      }),
      { replace: true },
    );
  };

  const onUnFocus = (newSearch?: string) => {
    updateParams(newSearch ?? search, true);
  };

  return [search, updateParams, onUnFocus];
}
