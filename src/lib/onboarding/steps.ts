import type { OnboardingStepKey } from "@/generated/prisma/enums";

/**
 * Onboarding Stage 2 (docs/onboarding-architecture.md §5/§6/§9/§14). The
 * one, fixed, typed catalog every backend/UI piece reads step metadata
 * from — the Prisma `OnboardingStepKey` enum (schema.prisma) is the DB
 * column's own type; this catalog is the separate, code-side "what does
 * this step mean" contract, mirroring how `src/lib/billing/plans.ts`'s
 * `PLAN_CATALOG` sits next to (never inside) a Prisma enum. Nothing here
 * is a schema change — adding/reordering a step's *metadata* is a code
 * review, never a migration (the step *keys* themselves are the one part
 * of this that IS schema-fixed, per the design doc's own explicit
 * `enum OnboardingStepKey` decision).
 */

/** The exact order docs/onboarding-architecture.md §5 already argued for and adopted unchanged from the example it was asked to evaluate. */
export const ONBOARDING_STEP_ORDER: readonly OnboardingStepKey[] = [
  "WELCOME",
  "CREATE_CLIENT",
  "CREATE_PROJECT",
  "CREATE_TASK",
  "INVITE_TEAMMATE",
  "INVITE_PORTAL_USER",
  "REVIEW_BILLING",
  "FINISH",
];

export type OnboardingStepDefinition = {
  key: OnboardingStepKey;
  /** Position in the checklist — §5's decided order, 0-indexed. */
  order: number;
  /** A short, factual label — the same step names §4/§5 of the design doc already use, not marketing copy. Stage 3's UI owns tone/styling; this is the one piece of display-safe text this stage's own backend contract is authorized to return (§5's own "title key / display-safe metadata, if the architecture doc allows it"). */
  label: string;
  /**
   * Whether this step's "done" state is computed live from real business
   * data (§4/§9 Option A) rather than ever persisted as a row in
   * `OrganizationOnboardingStep`. WELCOME/FINISH are never computed —
   * acknowledging either is the *only* thing that can ever mark them done,
   * so they always go through the persisted (row-existence) path.
   * REVIEW_BILLING is `computed: false` here too, but for a different
   * reason — see `isOnboardingStepAvailable` below; it isn't computed OR
   * acknowledgeable on this branch at all today.
   */
  computed: boolean;
  /** Whether a member may explicitly mark this step skipped (§6) — never means "blocking" either way (§6's own "no explicit Skip button does not mean blocking" rule). */
  skippable: boolean;
  /** Whether this step is load-bearing for a "productive first session" (§1) — feeds `requiredCompleted` in the progress summary; never used to block navigation (§0.5/§1's "never block, gate, or interrupt" goal). */
  required: boolean;
  /** The step this one is naturally blocked behind until real dependency data exists (§10/§14) — `null` if none. Only ever consulted for a step that is not yet Done/Skipped (§14: a step already Done from real data is never re-evaluated as blocked, regardless of its dependency's own current state). */
  dependsOn: OnboardingStepKey | null;
  /**
   * Where this step's own primary action lives — a real, existing route
   * only (§14's "No invented routes" rule), or `null` when there is no
   * single fixed destination (WELCOME/FINISH are actions, not
   * navigations; INVITE_PORTAL_USER has no single generic route since the
   * real flow is nested under a specific Client's own edit page, so this
   * points at the Clients list — see this file's own comment on that
   * field below; REVIEW_BILLING has no real route on this branch at all
   * yet, see §16).
   */
  targetHref: string | null;
};

export const ONBOARDING_STEPS: Readonly<Record<OnboardingStepKey, OnboardingStepDefinition>> = {
  WELCOME: {
    key: "WELCOME",
    order: 0,
    label: "Welcome",
    computed: false,
    skippable: false,
    required: false,
    dependsOn: null,
    targetHref: null,
  },
  CREATE_CLIENT: {
    key: "CREATE_CLIENT",
    order: 1,
    label: "Create your first client",
    computed: true,
    skippable: false,
    required: true,
    dependsOn: null,
    targetHref: "/clients/new",
  },
  CREATE_PROJECT: {
    key: "CREATE_PROJECT",
    order: 2,
    label: "Create your first project",
    computed: true,
    skippable: false,
    required: true,
    dependsOn: "CREATE_CLIENT",
    targetHref: "/projects/new",
  },
  CREATE_TASK: {
    key: "CREATE_TASK",
    order: 3,
    label: "Create your first task",
    computed: true,
    skippable: true,
    required: false,
    dependsOn: "CREATE_PROJECT",
    targetHref: "/tasks/new",
  },
  INVITE_TEAMMATE: {
    key: "INVITE_TEAMMATE",
    order: 4,
    label: "Invite a teammate",
    computed: true,
    skippable: true,
    required: false,
    dependsOn: null,
    targetHref: "/team",
  },
  INVITE_PORTAL_USER: {
    key: "INVITE_PORTAL_USER",
    order: 5,
    label: "Invite a Client Portal user",
    computed: true,
    skippable: true,
    required: false,
    dependsOn: "CREATE_CLIENT",
    // No single generic "invite a portal user" route exists — that flow
    // lives under a specific Client's own /clients/[id]/edit Portal
    // Access section (docs/onboarding-architecture.md §0.3). Pointing at
    // the Clients list (a real, existing route) rather than inventing one
    // is the honest target: pick a client, then invite from there.
    targetHref: "/clients",
  },
  REVIEW_BILLING: {
    key: "REVIEW_BILLING",
    order: 6,
    label: "Review billing",
    computed: false,
    skippable: true,
    required: false,
    dependsOn: null,
    // No real /settings/billing route exists on this branch (§16 —
    // feature/billing-subscriptions is not merged into main). Left null
    // rather than a guessed future path, per §14's "no invented routes"
    // rule; a future Stage 6 sets a real href only once that route
    // actually exists.
    targetHref: null,
  },
  FINISH: {
    key: "FINISH",
    order: 7,
    label: "Finish setup",
    computed: false,
    skippable: false,
    required: false,
    dependsOn: null,
    targetHref: null,
  },
};

export const ALL_ONBOARDING_STEP_KEYS: readonly OnboardingStepKey[] = ONBOARDING_STEP_ORDER;

export function getOnboardingStep(key: OnboardingStepKey): OnboardingStepDefinition {
  return ONBOARDING_STEPS[key];
}

/**
 * True for every step except REVIEW_BILLING (§16). This is the one seam
 * this stage builds for a billing integration that isn't merged yet — a
 * single, explicit, hardcoded `false` here (never a feature flag read
 * from an env var, never an import of anything under `src/lib/billing`,
 * per this stage's own explicit "don't pull the Billing branch in"
 * constraint) is what keeps `REVIEW_BILLING` completely inert on this
 * branch: excluded from `totalCount`/`percent`/`requiredCompleted`
 * (src/lib/onboarding/progress.ts), never actionable, never skippable in
 * practice even though its own `skippable: true` metadata above says it
 * would be once available. Flipping this to a real, billing-aware check
 * is Stage 6's entire job (docs/onboarding-architecture.md §16/§20) —
 * this function is the one line that changes.
 */
export function isOnboardingStepAvailable(key: OnboardingStepKey): boolean {
  return key !== "REVIEW_BILLING";
}

/** A fixed allowlist of every href this catalog can ever point at — real, existing routes only, checked by this module's own unit tests and by the security check. */
export const ONBOARDING_STEP_HREF_ALLOWLIST: readonly string[] = [
  "/clients/new",
  "/projects/new",
  "/tasks/new",
  "/team",
  "/clients",
];
