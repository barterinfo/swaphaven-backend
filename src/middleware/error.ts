import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "not_found", message: "Resource not found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }

  const isProd = env.NODE_ENV === "production";
  const message = isProd ? "Internal server error" : String(err instanceof Error ? err.message : err);

  console.error("[error]", err);
  res.status(500).json({ error: "internal_error", message });
}
