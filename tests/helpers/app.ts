import { createApp } from "../../src/app.js";

/** Shared Express app for all tests. Created once per worker process. */
export const app = createApp();
