// Controller barrel: every route router the app composes. app.ts mounts these
// in registration order (Hono composes in registration order — middleware
// first).
export { auth } from "./auth";
export { homeRoutes } from "./home";
export { dashboard } from "./dashboard";
export { shares } from "./shares";
export { publicView } from "./public";
export { ogImage } from "./og";
export { exampleCard } from "./exampleCard";
export { supportRoutes } from "./support";
