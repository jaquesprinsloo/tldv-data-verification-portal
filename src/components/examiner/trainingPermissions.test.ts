import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/migrations/0000_examiner_training_library.sql", "utf8");
describe("examiner education access rules", () => {
  test("only masters can manage education resources", () => {
    expect(sql).toContain('FOR ALL TO authenticated USING (public.is_master_admin(auth.uid())) WITH CHECK (public.is_master_admin(auth.uid()))');
  });
  test("examiners can only read materials explicitly shared with them", () => {
    expect(sql).toContain('FOR SELECT TO authenticated USING (is_shared AND public.has_role(auth.uid(), \'examiner\'))');
  });
  test("anonymous visitors cannot call the examiner profile listing", () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.list_active_examiner_profiles() FROM PUBLIC, anon');
    expect(sql).not.toContain('GRANT SELECT ON public.examiner_training_resources TO anon');
  });
  test("profile listing includes only existing examiner accounts not currently banned", () => {
    expect(sql).toContain("ur.user_id = p.id AND ur.role = 'examiner'");
    expect(sql).toContain('JOIN auth.users u ON u.id = p.id');
    expect(sql).toContain('(u.banned_until IS NULL OR u.banned_until < now())');
  });
});