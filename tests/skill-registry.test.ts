import { SkillRegistry } from "../src/skill-registry";
import { expect, test } from "vitest";

test("register and list", async () => {
  const reg = new SkillRegistry();
  const manifest = { skillId: "test.echo", name: "Echo", description: "Echo input", category: "utility", tags: [], version: "1.0.0", inputs: {}, outputs: {} };
  const adapter = async (input: any) => ({ ok: true, value: input, executionMs: 0, sideEffectsLogged: [] });
  reg.register(manifest, adapter);
  const list = await reg.list();
  expect(list).toContainEqual(manifest);
});
