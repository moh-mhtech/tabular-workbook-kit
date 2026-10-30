export type PerfSpanRecord = { name: string; ms: number; at: number };

const MAX_SPANS = 64;

export class PerfSpanBuffer {
  private spans: PerfSpanRecord[] = [];

  record(name: string, ms: number) {
    this.spans.push({ name, ms, at: Date.now() });
    if (this.spans.length > MAX_SPANS) this.spans.shift();
  }

  drain(): PerfSpanRecord[] {
    const copy = [...this.spans];
    this.spans.length = 0;
    return copy;
  }

  peek(): readonly PerfSpanRecord[] {
    return this.spans;
  }
}

export function measureSync<T>(name: string, buffer: PerfSpanBuffer, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    buffer.record(name, performance.now() - start);
  }
}

export async function measureAsync<T>(name: string, buffer: PerfSpanBuffer, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    buffer.record(name, performance.now() - start);
  }
}
