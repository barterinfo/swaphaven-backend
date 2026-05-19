/** Safely extract a single string from an Express route param (which TypeScript types as string | string[]). */
export function p(val: string | string[]): string {
  return Array.isArray(val) ? val[0]! : val;
}

/** Convert an optional number to the string representation required by drizzle decimal columns. */
export function toDecimalStr(n: number | undefined | null): string | undefined {
  return n != null ? String(n) : undefined;
}
