import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { openApiSpec } from "./openapi/spec.js";
import { notFoundHandler, errorHandler } from "./middleware/error.js";
import { listCategories } from "./routes/listings.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import listingsRouter from "./routes/listings.js";
import swipeRouter from "./routes/swipe.js";
import offersRouter from "./routes/offers.js";
import tradesRouter from "./routes/trades.js";
import conversationsRouter from "./routes/conversations.js";
import notificationsRouter from "./routes/notifications.js";

export function createApp(): express.Express {
  const app = express();

  // Railway / load balancers send X-Forwarded-For — required before rate limiting.
  if (env.TRUST_PROXY) {
    app.set("trust proxy", 1);
  }

  // ─── Security headers ────────────────────────────────────────────────────────
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
  }));

  // ─── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = env.CORS_ORIGINS.split(",").map((o) => o.trim());
  app.use(cors({
    origin: (origin, callback) => {
      // No origin = server-to-server or same-origin request (curl, Postman, etc.) — always allow
      if (!origin) return callback(null, true);
      // Wildcard or explicit match
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return callback(null, true);
      // Unknown origin: silently deny CORS headers (don't throw — non-browser clients still work)
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  }));

  // ─── Logging ─────────────────────────────────────────────────────────────────
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  // ─── Request ID ──────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const id = req.headers["x-request-id"] as string
      ?? Math.random().toString(36).slice(2);
    res.setHeader("X-Request-ID", id);
    next();
  });

  // ─── Body parsing ─────────────────────────────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // ─── Health checks (before rate limits — Railway / probes must not throw) ─────
  app.get("/", (_req, res) =>
    res.json({
      service: "swaphaven-api",
      health: "/api/healthz",
      ready: "/api/readyz",
      docs: env.ENABLE_API_DOCS ? "/api-docs" : undefined,
    }),
  );

  app.get("/health", (_req, res) => res.redirect(307, "/api/healthz"));

  app.get("/api/healthz", (_req, res) =>
    res.json({ status: "ok", service: "swaphaven-api", timestamp: new Date().toISOString() }),
  );

  app.get("/api/readyz", async (_req, res) => {
    try {
      const { pool } = await import("./db/client.js");
      await pool.query("SELECT 1");
      res.json({
        status: "ready",
        service: "swaphaven-api",
        database: "up",
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: "not_ready",
        service: "swaphaven-api",
        database: "down",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ─── Rate limiting ────────────────────────────────────────────────────────────
  const apiLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.API_RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "too_many_requests", message: "Too many requests. Please try again later." },
  });

  const authLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "too_many_requests", message: "Too many authentication attempts. Please try again later." },
  });

  app.use("/api/auth", authLimiter);
  app.use("/api", apiLimiter);

  // ─── OpenAPI docs (disabled in production unless ENABLE_API_DOCS=true) ─────────
  if (env.ENABLE_API_DOCS) {
    app.get("/api/openapi.json", (_req, res) => res.json(openApiSpec));
    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, {
        customSiteTitle: "SwapHaven API Docs",
        customCss: ".swagger-ui .topbar { background-color: #6366f1; }",
      }),
    );
  }

  // ─── Routes ───────────────────────────────────────────────────────────────────
  app.get("/api/categories", listCategories as express.RequestHandler);

  app.use("/api/auth",          authRouter);
  app.use("/api/users",         usersRouter);
  app.use("/api/listings",      listingsRouter);
  app.use("/api/swipe",         swipeRouter);
  app.use("/api/offers",        offersRouter);
  app.use("/api/trades",        tradesRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/notifications", notificationsRouter);

  // ─── Error handling ───────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
