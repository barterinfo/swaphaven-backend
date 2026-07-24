import { Router } from "express";
import { env } from "../config/env.js";

const router = Router();

/**
 * Apple App Site Association for Universal Links.
 * Served at `/.well-known/apple-app-site-association` with no file extension.
 * Content-Type must be application/json (Apple accepts that; some CDNs strip charset).
 */
router.get("/apple-app-site-association", (_req, res) => {
  const teamId = env.APPLE_TEAM_ID?.trim() ?? "";
  const bundleId = env.IOS_BUNDLE_ID;
  const appID = teamId ? `${teamId}.${bundleId}` : bundleId;

  res.type("application/json").json({
    applinks: {
      apps: [],
      details: [
        {
          appID,
          paths: ["/listings/*"],
        },
      ],
    },
  });
});

/**
 * Android Digital Asset Links for App Links verification.
 * Served at `/.well-known/assetlinks.json`.
 */
router.get("/assetlinks.json", (_req, res) => {
  const fingerprint = env.ANDROID_SHA256_CERT_FINGERPRINT?.trim();
  const fingerprints = fingerprint ? [fingerprint] : [];

  res.type("application/json").json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.ANDROID_PACKAGE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
});

export default router;
