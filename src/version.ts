/* The build version, baked in by Vite (see vite.config.ts).
 * Each GitHub deploy gets a new one, e.g. "0.1.0-b12". Locally it's "0.1.0-dev". */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
