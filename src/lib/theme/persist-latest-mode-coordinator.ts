/**
 * Aqenra Theme Persistence Phase C2 — a small, serialized "latest
 * selection wins" write coordinator for future authenticated
 * theme-persistence UI (Settings → Appearance, Phase D — not wired to
 * any UI yet in C2; see this PR's own report). Framework-simple and
 * deterministic, with no new DB field, server sequence column, or
 * `updatedAt`-comparison scheme:
 *
 *   - Never more than one persist() call in flight at a time.
 *   - If the caller's desired mode changes again while a write is still
 *     in flight, only the LATEST desired value is queued — intermediate
 *     values from a rapid sequence (e.g. Light -> Dark -> System within
 *     500ms) are never separately persisted.
 *   - When the in-flight write settles successfully, the queued value
 *     (if any, and if it differs from what was just persisted) is
 *     persisted next — this repeats until the queue drains, guaranteeing
 *     the final persisted value always converges to the last value the
 *     caller actually requested.
 *   - Bounded on failure: a failed attempt does not retry itself and
 *     discards whatever was queued. The documented, accepted trade-off
 *     (Phase C architecture review §17/§24) is that the CALLER's next
 *     genuine `request()` — a real subsequent user selection, or Phase
 *     D re-driving the same mode — is what tries again; this coordinator
 *     never invents its own retry loop, offline queue, or write-ahead
 *     log for a cosmetic preference.
 *
 * Generic over `Mode` so it has zero knowledge of ThemeMode, identity
 * type, or Server Actions — a future Settings UI plugs in the real
 * `persist` function (`updateThemeModeAction`/`updatePortalThemeModeAction`)
 * without this module ever importing either.
 */

export type PersistOutcome<Mode> =
  | { ok: true; mode: Mode }
  | { ok: false; mode: Mode; error: unknown };

export type LatestModePersistenceCoordinator<Mode> = {
  /** Records the caller's latest desired mode and ensures it will eventually be persisted (bounded — see module doc comment). */
  request: (mode: Mode) => void;
  /** The outcome of the most recently SETTLED persist attempt (success or failure) — null before any request() has settled. */
  getLastOutcome: () => PersistOutcome<Mode> | null;
  /** Whether a persist() call is currently in flight. */
  isPersisting: () => boolean;
};

export function createLatestModePersistenceCoordinator<Mode>(
  persist: (mode: Mode) => Promise<void>,
): LatestModePersistenceCoordinator<Mode> {
  let inFlight = false;
  let queuedMode: Mode | null = null;
  let lastOutcome: PersistOutcome<Mode> | null = null;

  function settleAndContinue(justPersisted: Mode): void {
    if (queuedMode === null || queuedMode === justPersisted) {
      queuedMode = null;
      inFlight = false;
      return;
    }
    const next = queuedMode;
    queuedMode = null;
    start(next);
  }

  function start(mode: Mode): void {
    inFlight = true;
    persist(mode).then(
      () => {
        lastOutcome = { ok: true, mode };
        settleAndContinue(mode);
      },
      (error: unknown) => {
        lastOutcome = { ok: false, mode, error };
        // Bounded: this run stops here. Anything queued while this
        // attempt was in flight is discarded, not carried into an
        // automatic retry — see the module doc comment.
        queuedMode = null;
        inFlight = false;
      },
    );
  }

  return {
    request(mode: Mode): void {
      if (inFlight) {
        queuedMode = mode;
        return;
      }
      start(mode);
    },
    getLastOutcome(): PersistOutcome<Mode> | null {
      return lastOutcome;
    },
    isPersisting(): boolean {
      return inFlight;
    },
  };
}
