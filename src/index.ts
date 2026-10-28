// Утилиты для замеров производительности.

export type Measurement = {
  name: string;
  durationMs: number;
};

export async function measure<T>(
  name: string,
  fn: () => Promise<T> | T,
): Promise<{ result: T; measurement: Measurement }> {
  const start = performance.now();
  const result = await fn();
  return { result, measurement: { name, durationMs: performance.now() - start } };
}
