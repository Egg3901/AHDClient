/**
 * Generator-only input boundary.
 *
 * The `@/` modules belong to the separate mainline checkout whose tsconfig
 * resolves that alias when these generators run. Each generator narrows the
 * imported data to local input types before transforming it.
 */
declare module "@/*";
