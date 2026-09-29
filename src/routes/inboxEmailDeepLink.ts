import { Router, type Request, type Response } from "express";
import { LANDING_REDIRECT } from "../lib/activity-email/links.js";

const router = Router();

/** Browser fallback when the app is not installed — Universal Links use the same paths. */
function redirectToLanding(_req: Request, res: Response): void {
  res.redirect(302, LANDING_REDIRECT);
}

router.get("/offers/:offerId", redirectToLanding);
router.get("/chats/:conversationId", redirectToLanding);
router.get("/listings/:listingId", redirectToLanding);

export default router;
