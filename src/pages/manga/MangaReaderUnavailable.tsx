import { Link } from "react-router-dom";

export function MangaReaderUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background-main px-6 text-center">
      <section className="max-w-md">
        <h1 className="text-3xl font-bold text-white">
          Manga reading is temporarily unavailable
        </h1>
        <p className="mt-4 text-type-secondary">
          We&apos;re improving this feature and will bring it back when
          it&apos;s ready.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex rounded-lg bg-buttons-purple px-5 py-3 font-semibold text-white transition-colors hover:bg-buttons-purpleHover"
        >
          Back to home
        </Link>
      </section>
    </main>
  );
}
