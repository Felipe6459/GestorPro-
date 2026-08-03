import { grep, report } from "./lib.mjs";

// $queryRaw/$executeRaw (parameterized) are fine; the *Unsafe variants take
// a raw SQL string and are the actual injection risk this check guards
// against. Only application source is in scope — ad-hoc audit scripts are
// expected to use these occasionally and never ship in src/.
const matches = grep("\\$(queryRawUnsafe|executeRawUnsafe)", "src/");
const passed = report("no $queryRawUnsafe/$executeRawUnsafe in src/", matches === "", matches);
process.exit(passed ? 0 : 1);
