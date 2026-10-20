import test from "node:test";
import assert from "node:assert/strict";
import { createStateSync } from "../plugins/morning-tab/src/app/state-sync.mjs";
function harness(options = {}) {
  const timers = new Map();
  let id = 0;
  const sync = createStateSync({
    setTimer(fn) {
      timers.set(++id, fn);
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    ...options,
  });
  return {
    sync,
    timers,
    async tick() {
      assert.equal(timers.size, 1);
      const [id, fn] = timers.entries().next().value;
      timers.delete(id);
      await fn();
    },
  };
}
test("keeps a single view synchronized across ordinary conversation edits without reopening", async () => {
  let revision = 0;
  const states = [];
  const { sync, tick, timers } = harness({
    readState: async () => ({ revision: revision++ }),
    onState: (s) => states.push(s.revision),
  });
  sync.start();
  await tick();
  await tick();
  await tick();
  assert.deepEqual(states, [0, 1, 2]);
  assert.equal(timers.size, 1);
  sync.stop();
  assert.equal(timers.size, 0);
});
test("hidden view stops polling and reads the newest edit when shown again", async () => {
  let visible = true,
    revision = 1;
  const states = [];
  const { sync, tick, timers } = harness({
    readState: async () => ({ revision }),
    isVisible: () => visible,
    onState: (s) => states.push(s.revision),
  });
  sync.start();
  await tick();
  visible = false;
  await tick();
  assert.equal(timers.size, 0);
  revision = 3;
  visible = true;
  sync.request();
  await tick();
  assert.deepEqual(states, [1, 3]);
  sync.stop();
});
test("a temporary read failure preserves the view and the next read recovers", async () => {
  let fail = true;
  const states = [],
    errors = [];
  const { sync, tick } = harness({
    readState: async () => {
      if (fail) throw Error("offline");
      return { revision: 2 };
    },
    onState: (s) => states.push(s),
    onError: (e) => errors.push(e.message),
  });
  sync.start();
  await tick();
  assert.deepEqual(states, []);
  assert.deepEqual(errors, ["offline"]);
  fail = false;
  await tick();
  assert.equal(states[0].revision, 2);
  sync.stop();
});
test("teardown discards an in-flight read and cancels further polls", async () => {
  let resolve;
  const states = [];
  const { sync, tick, timers } = harness({
    readState: () => new Promise((r) => (resolve = r)),
    onState: (s) => states.push(s),
  });
  sync.start();
  const pending = tick();
  sync.stop();
  resolve({ revision: 4 });
  await pending;
  assert.deepEqual(states, []);
  assert.equal(timers.size, 0);
});
