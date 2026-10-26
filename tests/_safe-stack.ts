// Vitest installs Vite's stack-trace interceptor (Error.prepareStackTrace),
// which iterates every loaded module looking for inline sourcemaps. Native ESM
// modules (e.g. @node-rs/argon2) expose their transformed code as a Buffer,
// and Vite's extractInlineSourceMap calls `code.charCodeAt()` on it — crashing
// every stack trace formatting and aborting the whole test run.
//
// Wrap the interceptor so any failure degrades to a plain message instead of
// throwing. Stack contents are not asserted anywhere in these tests.
const original = Error.prepareStackTrace;
if (typeof original === "function") {
  Error.prepareStackTrace = (_error: Error, _stack: NodeJS.CallSite[]) => {
    try {
      return original(_error, _stack);
    } catch {
      return `${_error.name}: ${_error.message}`;
    }
  };
}
export {};
