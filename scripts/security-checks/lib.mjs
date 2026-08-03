import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Greps a directory for a fixed-string or regex pattern. Returns matching
 * lines (possibly empty) — grep's own "no matches" exit code (1) is treated
 * as a normal, successful "found nothing" result, not an error.
 */
export function grep(pattern, dir, extraFlags = "") {
  try {
    return execSync(`grep -rnE ${extraFlags} "${pattern}" ${dir}`, { encoding: "utf8" });
  } catch (err) {
    if (err.status === 1) return "";
    throw err;
  }
}

export function readLines(path) {
  return readFileSync(path, "utf8").split("\n");
}

/** Prints a pass/fail line and returns whether the check passed. */
export function report(name, passed, detail) {
  if (passed) {
    console.log(`OK   ${name}`);
    return true;
  }
  console.error(`FAIL ${name}`);
  if (detail) console.error(detail);
  return false;
}
