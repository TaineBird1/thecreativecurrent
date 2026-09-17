/**
 * Dividing a Lead-gen run between the worker's backlog and directory listings.
 *
 * The numbers in the first test are the real ones from the run where Snupit
 * came back to life after the URL fix: eleven businesses waiting from the
 * worker, twenty-two listings harvested from directories, twelve slots. The
 * old rule gave the worker eleven and the directories one, and the twenty-one
 * unread listings were discarded rather than carried over — so the run
 * produced seven leads and not one of them had an email address.
 *
 * Run: pnpm test
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadTs } from "./_load.mjs";

const { splitRunBudget } = await loadTs("packages/shared/tools/runBudget.ts");

const RUN = { total: 12, floor: 6 };

test("the run that started this: neither side takes everything", () => {
  const split = splitRunBudget({ ...RUN, workerWaiting: 11, directoryWaiting: 22 });
  assert.deepEqual(split, { worker: 6, directory: 6 });
});

test("a side with nothing waiting leaves the whole run to the other", () => {
  assert.deepEqual(splitRunBudget({ ...RUN, workerWaiting: 0, directoryWaiting: 30 }), {
    worker: 0,
    directory: 12,
  });
  assert.deepEqual(splitRunBudget({ ...RUN, workerWaiting: 30, directoryWaiting: 0 }), {
    worker: 12,
    directory: 0,
  });
});

test("a side with less than its share does not hold slots it cannot use", () => {
  // Two listings waiting must not reserve six and idle four.
  assert.deepEqual(splitRunBudget({ ...RUN, workerWaiting: 30, directoryWaiting: 2 }), {
    worker: 10,
    directory: 2,
  });
  assert.deepEqual(splitRunBudget({ ...RUN, workerWaiting: 3, directoryWaiting: 30 }), {
    worker: 3,
    directory: 9,
  });
});

test("a quiet run asks for nothing", () => {
  assert.deepEqual(splitRunBudget({ ...RUN, workerWaiting: 0, directoryWaiting: 0 }), {
    worker: 0,
    directory: 0,
  });
});

test("the run is never oversubscribed, whatever is waiting", () => {
  for (const workerWaiting of [0, 1, 5, 6, 7, 11, 12, 40]) {
    for (const directoryWaiting of [0, 1, 5, 6, 7, 11, 12, 40]) {
      const split = splitRunBudget({ ...RUN, workerWaiting, directoryWaiting });
      const label = `worker ${workerWaiting}, directory ${directoryWaiting}`;

      assert.ok(split.worker + split.directory <= RUN.total, `${label} overspent the run`);
      assert.ok(split.worker >= 0 && split.directory >= 0, `${label} went negative`);
      assert.ok(split.worker <= workerWaiting, `${label} promised worker slots with no work`);
      assert.ok(split.directory <= directoryWaiting, `${label} promised directory slots with no work`);

      // And it never leaves a slot idle while either side still has work.
      const idle = RUN.total - split.worker - split.directory;
      const unused = workerWaiting - split.worker + (directoryWaiting - split.directory);
      if (idle > 0) assert.equal(unused, 0, `${label} left ${idle} slot(s) idle with work waiting`);
    }
  }
});

test("the floor cannot exceed the run", () => {
  // A misconfigured floor must not hand out more slots than exist.
  const split = splitRunBudget({ total: 4, floor: 99, workerWaiting: 10, directoryWaiting: 10 });
  assert.equal(split.worker + split.directory, 4);
});

test("defaulting the floor gives the directories half", () => {
  assert.deepEqual(splitRunBudget({ total: 12, workerWaiting: 11, directoryWaiting: 22 }), {
    worker: 6,
    directory: 6,
  });
});
