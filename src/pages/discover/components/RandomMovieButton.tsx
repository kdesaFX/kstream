import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { getAllTimeBestMovies } from "@/backend/metadata/tmdb";

export function RandomMovieButton() {
  const { t } = useTranslation();
  const [randomMovie, setRandomMovie] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownTimeout, setCountdownTimeout] =
    useState<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const countingDown = countdown !== null && countdown > 0;

  useEffect(() => {
    let countdownInterval: NodeJS.Timeout;
    if (countdown !== null && countdown > 0) {
      countdownInterval = setInterval(() => {
        setCountdown((prev) => (prev !== null ? prev - 1 : prev));
      }, 1000);
    }
    return () => clearInterval(countdownInterval);
  }, [countdown]);

  const handleRandomMovieClick = async () => {
    if (countdown !== null && countdown > 0) {
      setCountdown(null);
      if (countdownTimeout) {
        clearTimeout(countdownTimeout);
        setCountdownTimeout(null);
        setRandomMovie(null);
      }
      return;
    }

    if (loading) return;
    setLoading(true);
    try {
      // A fresh random page from the well-known-movie pool every click, so
      // this doesn't just cycle the same ~20 movies for the whole session.
      const movies = await getAllTimeBestMovies(20);
      if (movies.length === 0) return;
      const selectedMovie =
        movies[Math.floor(Math.random() * movies.length)];

      setRandomMovie(selectedMovie);
      setCountdown(5);
      const timeoutId = setTimeout(() => {
        navigate(`/media/tmdb-movie-${selectedMovie.id}-random`);
      }, 5000);
      setCountdownTimeout(timeoutId);
    } catch (error) {
      console.error("Error fetching a random movie:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center">
      <button
        type="button"
        disabled={loading}
        aria-label={
          countingDown
            ? t("discover.randomMovie.cancel")
            : t("discover.randomMovie.button")
        }
        title={
          countingDown
            ? t("discover.randomMovie.cancel")
            : t("discover.randomMovie.button")
        }
        className={`
          tabbable cursor-pointer relative inline-flex items-center gap-2
          overflow-hidden rounded-full text-white h-12 pl-4 pr-3
          bg-pill-background bg-opacity-50 hover:bg-pill-backgroundHover
          backdrop-blur-lg
          transition-all duration-300 ease-in-out
          hover:scale-105 active:scale-95
          ${loading ? "opacity-60" : ""}
        `}
        onClick={handleRandomMovieClick}
      >
        <span className="whitespace-nowrap font-medium text-sm sm:text-base max-w-[14rem] truncate">
          {countingDown
            ? randomMovie?.title
            : t("discover.randomMovie.button")}
        </span>
        <span className="flex shrink-0 items-center justify-center w-8 h-8">
          {countingDown ? (
            <span className="animate-[pulse_1s_ease-in-out_infinite] text-lg font-bold tabular-nums">
              {countdown}
            </span>
          ) : (
            <img
              src="/lightbar-images/dice.svg"
              alt=""
              aria-hidden
              className="w-5 h-5"
            />
          )}
        </span>
      </button>
    </div>
  );
}
