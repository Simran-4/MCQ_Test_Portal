const test = require("node:test");
const assert = require("node:assert/strict");

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test("an old user refresh cannot replace a newer login", async () => {
  global.sessionStorage = storage();
  global.localStorage = storage();
  const auth = await import("../../client/src/utils/auth.js");
  const originalFetch = global.fetch;
  let resolveOldRequest;
  try {
    auth.setAuthSession("old-token", { _id: "old-user" });
    global.fetch = () => new Promise(resolve => { resolveOldRequest = resolve; });
    const refresh = auth.refreshCurrentUser();
    auth.setAuthSession("new-token", { _id: "new-user" });
    resolveOldRequest({ ok: true, json: async () => ({ _id: "old-user" }) });

    await assert.rejects(refresh, error => error.stale === true);
    assert.equal(auth.getAuthToken(), "Bearer new-token");
    assert.equal(auth.getCurrentUser()._id, "new-user");
  } finally {
    global.fetch = originalFetch;
    delete global.sessionStorage;
    delete global.localStorage;
  }
});
