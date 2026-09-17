/**
 * How one Lead-gen run divides its slots between the two kinds of work.
 *
 * The two are not equally forgiving, which is the whole reason this is a
 * decision rather than a loop:
 *
 *   Google Maps results come back through the worker as whole businesses, and
 *   each job remembers how much of it has been consumed. Anything not taken
 *   this run is waiting at the start of the next one.
 *
 *   Directory listings are harvested fresh from the search page every run, and
 *   anything not taken is thrown away — fetched, parsed, and dropped.
 *
 * So "worker first, directories with the leftovers" does not merely reorder the
 * work. It discards half of one side. In the run where Snupit came back to
 * life it took eleven of twelve slots and twenty-one of Snupit's twenty-two
 * listings went unread; the seven leads that run produced were all from Maps,
 * and every one of them arrived without an email address. Directory listings
 * are the ones that carry a contactable address, so that is the side being
 * thrown away.
 *
 * Hence a floor. Each side gets at least its share when it has work waiting,
 * and whichever has less leaves the remainder to the other.
 */
export interface RunBudget {
  /** Slots for businesses the worker has already scraped. */
  worker: number;
  /** Slots for listing URLs harvested from a directory this run. */
  directory: number;
}

export function splitRunBudget(input: {
  /** Businesses waiting from the worker, already filtered to unseen ones. */
  workerWaiting: number;
  /** Directory listings waiting, already filtered to unseen ones. */
  directoryWaiting: number;
  total: number;
  /** Least the directory side gets when it has work. Default: half. */
  floor?: number;
}): RunBudget {
  const total = Math.max(0, input.total);
  const floor = Math.min(input.floor ?? Math.floor(total / 2), total);

  const directory = Math.min(
    Math.max(0, input.directoryWaiting),
    Math.max(floor, total - Math.max(0, input.workerWaiting)),
  );
  return { directory, worker: Math.min(Math.max(0, input.workerWaiting), total - directory) };
}
