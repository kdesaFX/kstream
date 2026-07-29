import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getAllTimeBestMovies } from "@/backend/metadata/tmdb";

export function RandomMovieButton() {
  const [randomMovie, setRandomMovie] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownTimeout, setCountdownTimeout] =
    useState<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
        className={`
          tabbable cursor-pointer relative flex items-center overflow-hidden
          rounded-full text-white h-12
          bg-pill-background bg-opacity-50 hover:bg-pill-backgroundHover
          backdrop-blur-lg
          transition-all duration-300 ease-in-out
          hover:scale-105 active:scale-95
          ${loading ? "opacity-60" : ""}
          ${countdown !== null && countdown > 0 ? "min-w-[10px] pl-3" : "w-12"}
        `}
        onClick={handleRandomMovieClick}
      >
        {/* Title container that slides in */}
        <div
          className={`
            relative whitespace-nowrap
            transition-all duration-300 ease-in-out
            ${countdown !== null && countdown > 0 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}
          `}
        >
          {countdown !== null && countdown > 0 && (
            <span className="font-bold">{randomMovie?.title}</span>
          )}
        </div>

        {/* Icon container that stays fixed on the right */}
        <div className="ml-auto flex items-center justify-center w-12 h-12">
          {countdown !== null && countdown > 0 ? (
            <div className="animate-[pulse_1s_ease-in-out_infinite] text-lg font-bold">
              {countdown}
            </div>
          ) : (
            <img
              src="/lightbar-images/dice.svg"
              alt="Dice"
              className="w-6 h-6"
            />
          )}
        </div>
      </button>
    </div>
  );
}
