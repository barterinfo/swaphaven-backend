import type { Request } from "express";
import { env } from "../config/env.js";
import { openApiSpec } from "./spec.js";

function firstForwardedValue(value: string | undefined): string | undefined {
  return value?.split(",")[0]?.trim();
}

/** Public API base URL for OpenAPI / Swagger (env override or incoming request). */
export function resolveApiServerUrl(req: Pick<Request, "protocol" | "get">): string {
  if (env.PUBLIC_API_URL) {
    return env.PUBLIC_API_URL.replace(/\/+$/, "");
  }
  const protocol = firstForwardedValue(req.get("x-forwarded-proto")) ?? req.protocol;
  const host =
    firstForwardedValue(req.get("x-forwarded-host")) ??
    req.get("host") ??
    `localhost:${env.PORT}`;
  return `${protocol}://${host}`;
}

export function getOpenApiSpec(serverUrl: string) {
  return {
    ...openApiSpec,
    servers: [
      {
        url: serverUrl,
        description: serverUrl.includes("localhost") ? "Local development" : "Current host",
      },
    ],
  };
}
