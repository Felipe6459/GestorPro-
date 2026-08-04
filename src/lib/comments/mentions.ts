/**
 * Comments & Mentions Stage 3 (docs/comments-architecture.md §3): parses
 * only the structured `@[Display Name](user:<uuid>)` token — never
 * free-text `@name`. Identity comes exclusively from the embedded uuid;
 * displayName is rendering convenience only, never trusted as identity.
 *
 * The regex is deliberately built from single, bounded, non-nested
 * quantifiers (`{1,100}` on a negated character class, fixed-length hex
 * segments for the UUID) — there is no ambiguous alternation or nested
 * repetition anywhere in it, so it cannot exhibit catastrophic
 * backtracking regardless of input length or content. A token that
 * doesn't match this exact shape (malformed brackets, a non-UUID
 * identifier, free-text "@name") simply never matches — it is not
 * "cleaned up" or rejected, it just remains ordinary text, exactly as
 * the design doc's "no link is safer than a broken one" philosophy
 * requires (§3, "Invalid mentions").
 */
const MENTION_TOKEN_PATTERN =
  /@\[([^\]\n]{1,100})\]\(user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

/**
 * Per-comment cap on *distinct* mentioned users (design doc §8, "Mention
 * abuse": "a fixed per-comment cap (e.g. 20 distinct mentions)"). Applied
 * uniformly to both `mentions` and `uniqueUserIds` — a token naming a
 * 21st-or-later distinct person is treated exactly like a malformed one
 * (not included anywhere in the result), so nothing renders a mention tag
 * for a person who was also silently excluded from notification —
 * "rendered but doesn't notify" would be a confusing, inconsistent state
 * this parser never produces.
 */
export const MAX_MENTIONS_PER_COMMENT = 20;

export type ParsedMention = {
  /** Lowercased for a stable dedupe/lookup key — UUIDs are case-insensitive. */
  userId: string;
  /** Display convenience only — never used to resolve identity. */
  displayName: string;
  /** The exact matched substring, e.g. "@[Jane Doe](user:...)" . */
  raw: string;
  /** Character offset into the input body where this token starts. */
  start: number;
  /** Character offset into the input body where this token ends (exclusive). */
  end: number;
};

export type ParseMentionTokensResult = {
  /** Every valid token occurrence, in text order, including repeats of an already-seen userId. */
  mentions: ParsedMention[];
  /** Deduped, in order of first appearance, capped at MAX_MENTIONS_PER_COMMENT. */
  uniqueUserIds: string[];
};

const EMPTY_RESULT: ParseMentionTokensResult = { mentions: [], uniqueUserIds: [] };

/**
 * Pure, synchronous, never throws — a comment body is untrusted user
 * input by definition, and this runs on every create/edit before any
 * database work, so it must degrade to "no mentions found" rather than
 * ever crash the caller. Reset `lastIndex` isn't needed since a fresh
 * `matchAll` iterator is created per call and the module-level regex
 * literal's `g` flag state is never read across calls (matchAll doesn't
 * mutate the source regex's lastIndex the way `.exec` in a loop would).
 */
export function parseMentionTokens(body: unknown): ParseMentionTokensResult {
  if (typeof body !== "string" || body.length === 0) {
    return EMPTY_RESULT;
  }

  try {
    const mentions: ParsedMention[] = [];
    const uniqueUserIds: string[] = [];
    const seen = new Set<string>();

    for (const match of body.matchAll(MENTION_TOKEN_PATTERN)) {
      const displayName = match[1];
      const userId = match[2].toLowerCase();
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;

      const alreadySeen = seen.has(userId);
      if (!alreadySeen && uniqueUserIds.length >= MAX_MENTIONS_PER_COMMENT) {
        // Cap reached: a new distinct user beyond the 20th is treated as
        // if this token never matched at all — not added to mentions,
        // not added to uniqueUserIds.
        continue;
      }

      mentions.push({ userId, displayName, raw, start, end });
      if (!alreadySeen) {
        seen.add(userId);
        uniqueUserIds.push(userId);
      }
    }

    return { mentions, uniqueUserIds };
  } catch {
    return EMPTY_RESULT;
  }
}
