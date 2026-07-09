export type ContainerToken<T> = string & { __brand: T };

export class ContainerError extends Error {
  constructor(
    message: string,
    public readonly token: string
  ) {
    super(message);
    this.name = 'ContainerError';
    Object.setPrototypeOf(this, ContainerError.prototype);
  }
}

export class Container {
  public readonly singletons = new Map<string, unknown>();
  public readonly factories = new Map<string, () => unknown>();
  public readonly scopedFactories = new Map<string, () => unknown>();

  constructor(private readonly parent?: Container) {}

  registerFactory<T>(token: ContainerToken<T>, factory: () => T): void;
  registerFactory<T>(token: string, factory: () => T): void;
  registerFactory<T>(token: string | ContainerToken<T>, factory: () => T): void {
    this.factories.set(token as string, factory);
  }

  registerSingleton<T>(token: ContainerToken<T>, instance: T): void;
  registerSingleton<T>(token: string, instance: T): void;
  registerSingleton<T>(token: string | ContainerToken<T>, instance: T): void {
    this.singletons.set(token as string, instance);
  }

  registerScoped<T>(token: ContainerToken<T>, factory: () => T): void;
  registerScoped<T>(token: string, factory: () => T): void;
  registerScoped<T>(token: string | ContainerToken<T>, factory: () => T): void {
    this.scopedFactories.set(token as string, factory);
  }

  // Alias for compatibility with the existing codebase
  register<T>(token: string, value: T): void {
    this.registerSingleton(token, value);
  }

  resolve<T>(token: ContainerToken<T>): T;
  resolve<T = unknown>(token: string): T;
  resolve<T>(token: string | ContainerToken<T>): T {
    const key = token as string;

    if (this.singletons.has(key)) {
      return this.singletons.get(key) as T;
    }

    if (this.factories.has(key)) {
      const factory = this.factories.get(key)!;
      const instance = factory() as T;
      this.singletons.set(key, instance);
      return instance;
    }

    if (this.scopedFactories.has(key)) {
      const factory = this.scopedFactories.get(key)!;
      return factory() as T;
    }

    if (this.parent) {
      return this.parent.resolve<T>(token as ContainerToken<T>);
    }

    throw new ContainerError(`Dependency '${key}' not registered in container`, key);
  }

  resolveAll<T>(pattern: string): T[] {
    const tokens = this.getMatchingTokens(pattern);
    const results: T[] = [];
    for (const token of tokens) {
      results.push(this.resolve<T>(token));
    }
    return results;
  }

  createScope(): Container {
    return new Container(this);
  }

  reset(): void {
    this.singletons.clear();
    this.factories.clear();
    this.scopedFactories.clear();
  }

  private getMatchingTokens(pattern: string): Set<string> {
    const matches = new Set<string>();
    const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
    const regex = new RegExp(regexStr);

    for (const key of this.singletons.keys()) {
      if (regex.test(key)) {
        matches.add(key);
      }
    }
    for (const key of this.factories.keys()) {
      if (regex.test(key)) {
        matches.add(key);
      }
    }
    for (const key of this.scopedFactories.keys()) {
      if (regex.test(key)) {
        matches.add(key);
      }
    }

    if (this.parent) {
      const parentMatches = this.parent.getMatchingTokens(pattern);
      for (const key of parentMatches) {
        matches.add(key);
      }
    }

    return matches;
  }
}

export const container = new Container();
export default container;
