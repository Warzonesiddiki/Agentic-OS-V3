import type { SkillManifest, SkillResult, InvocationContext } from "./lib/types";

export class SkillRegistry {
  private manifests: Map<string, SkillManifest> = new Map();
  private adapters: Map<string, (input: unknown, ctx: InvocationContext) => Promise<SkillResult<unknown>>> = new Map();

  async list(category?: string): Promise<SkillManifest[]> {
    return Array.from(this.manifests.values()).filter(m => !category || m.category === category);
  }

  async inspect(skillId: string) {
    const m = this.manifests.get(skillId);
    if (!m) throw new Error(`Skill ${skillId} not found`);
    return m;
  }

  async invoke<TIn, TOut>(skillId: string, input: TIn, ctx: InvocationContext): Promise<SkillResult<TOut>> {
    const fn = this.adapters.get(skillId);
    if (!fn) throw new Error(`Adapter for ${skillId} missing`);
    return (await fn(input, ctx)) as SkillResult<TOut>;
  }

  register(manifest: SkillManifest, adapter: (input: unknown, ctx: InvocationContext) => Promise<SkillResult<unknown>>) {
    this.manifests.set(manifest.skillId, manifest);
    this.adapters.set(manifest.skillId, adapter);
  }

  deregister(skillId: string) {
    this.manifests.delete(skillId);
    this.adapters.delete(skillId);
  }
}
