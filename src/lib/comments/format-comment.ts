import { parseMentionTokens } from "./mentions";

const DELETED_AUTHOR_LABEL = "Deleted user";
const DELETED_BODY_PLACEHOLDER = "This comment was deleted.";

export type CommentTextSegment =
  | { type: "text"; value: string }
  | { type: "mention"; userId: string; displayName: string };

/**
 * Comments & Mentions Stage 3 (docs/comments-architecture.md §12) — a pure
 * data transform only. It returns plain text/mention segments, never HTML
 * or a pre-rendered string; a future UI component maps over these and
 * renders each with ordinary JSX text nodes (and a fixed `<MentionTag>`-
 * style component for `mention` segments) — nothing here ever produces
 * markup, so this feature never needs React's raw-HTML-injection escape
 * hatch, matching this app's project-wide invariant against using it.
 *
 * A token only becomes a `mention` segment if its userId is in
 * `validMentionUserIds` — the *actually persisted* CommentMention rows for
 * this exact comment, passed in by the caller (never re-derived by
 * trusting the parsed text alone). A well-formed-looking token whose
 * userId was never a valid org member at write time (or was removed by a
 * later edit) renders as plain literal text, identical treatment to a
 * malformed token — "current valid Mention rows only" (§12), not "anything
 * that parses."
 */
export function splitBodyIntoSegments(
  body: string,
  validMentionUserIds: ReadonlySet<string>,
): CommentTextSegment[] {
  const { mentions } = parseMentionTokens(body);
  if (mentions.length === 0) {
    return body.length > 0 ? [{ type: "text", value: body }] : [];
  }

  const segments: CommentTextSegment[] = [];
  let cursor = 0;

  for (const mention of mentions) {
    if (!validMentionUserIds.has(mention.userId)) {
      // Not a real, persisted mention for this comment — leave the raw
      // token text exactly as written, merged into the surrounding text
      // rather than split out, by simply not advancing past it here.
      continue;
    }

    if (mention.start > cursor) {
      segments.push({ type: "text", value: body.slice(cursor, mention.start) });
    }
    segments.push({ type: "mention", userId: mention.userId, displayName: mention.displayName });
    cursor = mention.end;
  }

  if (cursor < body.length) {
    segments.push({ type: "text", value: body.slice(cursor) });
  }

  return segments;
}

export type CommentViewModel = {
  id: string;
  authorId: string | null;
  authorName: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  editedAt: Date | null;
  /** Empty for a deleted comment — its body is never rendered, only the placeholder above. */
  segments: CommentTextSegment[];
  placeholder: string | null;
};

export type CommentViewModelInput = {
  id: string;
  authorId: string | null;
  author: { name: string } | null;
  body: string;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  mentions: { userId: string }[];
};

/**
 * Converts a raw Comment row (+ its CommentMention rows) into a safe
 * display model. Never throws — a deleted row's body is never even
 * touched by the segment splitter (isDeleted short-circuits first), and a
 * comment whose author row is gone (authorId null, per Comment.authorId's
 * onDelete: SetNull) falls back to a neutral label rather than a blank or
 * crash.
 */
export function formatCommentViewModel(comment: CommentViewModelInput): CommentViewModel {
  const isDeleted = comment.deletedAt !== null;
  const authorName = comment.author?.name ?? DELETED_AUTHOR_LABEL;
  const validMentionUserIds = new Set(comment.mentions.map((m) => m.userId));

  return {
    id: comment.id,
    authorId: comment.authorId,
    authorName,
    isEdited: comment.editedAt !== null,
    isDeleted,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    segments: isDeleted ? [] : splitBodyIntoSegments(comment.body, validMentionUserIds),
    placeholder: isDeleted ? DELETED_BODY_PLACEHOLDER : null,
  };
}
