// Worker entry. The Hono app is composed in src/app.ts so tests and future
// consumers can import createApp() without the worker default-export dance.
import { createApp } from "./app";

export default createApp();
