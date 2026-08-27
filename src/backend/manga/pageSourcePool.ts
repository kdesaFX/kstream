/** Max concurrent chapter page source attempts (API + client mirrors). */
export const PAGE_SOURCE_POOL_SIZE = 4;

export type PageSourceTask = () => Promise<string[] | null>;

/**
 * Run up to `concurrency` page-source tasks at once. When one finishes empty,
 * pull the next queued source so the pool stays full until the queue runs out.
 * Returns the first non-empty result.
 */
export async function racePageSourcesPool(
  tasks: PageSourceTask[],
  concurrency = PAGE_SOURCE_POOL_SIZE,
): Promise<string[] | null> {
  if (tasks.length === 0) return null;

  return new Promise((resolve) => {
    let nextIndex = 0;
    let active = 0;
    let settled = false;

    const tryResolveEmpty = () => {
      if (settled) return;
      if (active === 0 && nextIndex >= tasks.length) {
        settled = true;
        resolve(null);
      }
    };

    const onTaskDone = (pages: string[] | null) => {
      active -= 1;
      if (settled) return;
      if (pages?.length) {
        settled = true;
        resolve(pages);
        return;
      }
      pump();
      tryResolveEmpty();
    };

    const onTaskError = () => {
      active -= 1;
      if (settled) return;
      pump();
      tryResolveEmpty();
    };

    const startTask = (run: PageSourceTask) => {
      active += 1;
      void run().then(onTaskDone).catch(onTaskError);
    };

    const pump = () => {
      if (settled) return;
      while (active < concurrency && nextIndex < tasks.length) {
        startTask(tasks[nextIndex]);
        nextIndex += 1;
      }
      tryResolveEmpty();
    };

    pump();
  });
}
