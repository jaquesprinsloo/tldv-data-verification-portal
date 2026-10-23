import { expect, test } from "bun:test";
import { beginSignOut } from "./signOutFlow";

test("sign out clears saved credentials before an unfinished network request", async () => {
  let storedSession = "signed-in";
  let finish = (_result) => {};
  const pending = beginSignOut({
    clearLocalSession: () => { storedSession = null; },
    revokeSession: () => {
      expect(storedSession).toBeNull();
      return new Promise(resolve => { finish = resolve; });
    },
  });
  expect(storedSession).toBeNull();
  finish({ error: null });
  await pending;
});