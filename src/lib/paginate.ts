export function encodeCursor(createdAt: Date): string {
  return Buffer.from(createdAt.toISOString()).toString("base64url");
}

export function decodeCursor(cursor: string): Date {
  return new Date(Buffer.from(cursor, "base64url").toString());
}

export function parsePaginationQuery(query: Record<string, unknown>): {
  limit: number;
  cursor: Date | undefined;
} {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const cursor = typeof query.cursor === "string" ? decodeCursor(query.cursor) : undefined;
  return { limit, cursor };
}
