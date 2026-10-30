export function medianMs(run: () => void | Promise<void>, iterations: number): number {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = run();
    if (result instanceof Promise) throw new Error("Use medianMsAsync for async probes");
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

export async function medianMsAsync(run: () => Promise<void>, iterations: number): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

export function waitForDataNotification(
  session: { subscribe: (listener: (change?: { viewOnly?: boolean; formulaEditOnly?: boolean }) => void) => () => void },
): Promise<void> {
  return new Promise((resolve) => {
    const unsub = session.subscribe((change) => {
      if (!change?.viewOnly && !change?.formulaEditOnly) {
        unsub();
        resolve();
      }
    });
  });
}
