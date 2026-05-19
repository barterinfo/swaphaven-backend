import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AuthPayload {
  sub: string;   // userId
  email: string;
  typ: "access" | "refresh";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "Missing bearer token" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
    if (payload.typ !== "access") {
      res.status(401).json({ error: "unauthorized", message: "Invalid token type" });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
    if (payload.typ === "access") req.user = payload;
  } catch {
    // silently ignore — treated as unauthenticated
  }
  next();
}

export function signTokens(sub: string, email: string): { accessToken: string; refreshToken: string } {
  const accessToken = jwt.sign(
    { sub, email, typ: "access" } satisfies AuthPayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
  const refreshToken = jwt.sign(
    { sub, email, typ: "refresh" } satisfies AuthPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
  return { accessToken, refreshToken };
}

export function verifyRefreshToken(token: string): AuthPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthPayload;
  if (payload.typ !== "refresh") throw new Error("Not a refresh token");
  return payload;
}
