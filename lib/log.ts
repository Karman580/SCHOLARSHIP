type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20;

/**
 * Structured JSON to stdout. Never log request bodies, extracted text, artifact bodies
 * or image data — log lengths, not contents (safety-and-honesty.md §5).
 */
export function log(level: Level, fields: Record<string, unknown>): void {
  if (ORDER[level] < MIN) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}
