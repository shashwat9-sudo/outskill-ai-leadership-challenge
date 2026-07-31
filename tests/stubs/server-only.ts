/**
 * Stub for the `server-only` package under Vitest.
 *
 * The real package throws when it is pulled into a client bundle, which is exactly what we want in
 * the application. Node-based unit tests are neither client nor server in that sense, so they alias
 * the import to this empty module. The protection it provides still applies to every real build.
 */
export {};
