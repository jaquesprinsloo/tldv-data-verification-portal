import { expect, test } from "bun:test";
import { beginSignOut } from "./signOutFlow";

test("sign out clears saved credentials before an unfinished network request", async () => {
  let storedSession: string | null = "signed-in";
  let finish: (result: { error: unknown }) => void = () => {};
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