"use client";

import { useRef, useState } from "react";
import { CARD_SURFACE_CLASSES } from "@/components/ui/surface";
import type { MentionCandidate } from "@/lib/comments/mention-candidates";

/**
 * Comments & Mentions Stage 4 (docs/comments-architecture.md §5/§6). The
 * MVP form the design doc explicitly allows in place of a full inline
 * "@"-triggered autocomplete: a plain "Mention teammate" button opening a
 * searchable list, native <details>/<summary> disclosure — the exact same
 * dependency-free popover pattern already used by NotificationBell and the
 * OrganizationSwitcher, not a second overlay paradigm just for this
 * feature. `candidates` is server-resolved once (src/lib/comments/mention-
 * candidates.ts) and passed down as a prop — this component never fetches
 * anything itself, and is a pure UX convenience: selecting someone here
 * only inserts a token into the composer's textarea, it does not create a
 * mention by itself — the backend (Stage 3) re-validates independently.
 */
export function MentionCombobox({
  candidates,
  onSelect,
}: {
  candidates: MentionCandidate[];
  onSelect: (candidate: MentionCandidate) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");

  function close() {
    setTimeout(() => {
      detailsRef.current?.removeAttribute("open");
      setQuery("");
    }, 0);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? candidates.filter(
        (c) => c.name.toLowerCase().includes(normalizedQuery) || c.email.toLowerCase().includes(normalizedQuery),
      )
    : candidates;

  return (
    <details
      ref={detailsRef}
      className="group relative inline-block"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <summary
        className="border-border-strong bg-surface text-text-primary focus-visible:ring-focus-ring cursor-pointer list-none rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
        aria-label="Mention a teammate"
      >
        @ Mention teammate
      </summary>
      <div className={`absolute left-0 z-20 mt-1 w-64 py-1 shadow-lg ${CARD_SURFACE_CLASSES}`}>
        <div className="px-2 pt-1 pb-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or email"
            aria-label="Search teammates to mention"
            autoFocus
            className="border-border-strong bg-surface text-text-primary placeholder:text-text-muted block w-full rounded-md border px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <ul role="listbox" aria-label="Teammates" className="max-h-56 overflow-y-auto">
          {filtered.length === 0 && <li className="text-text-muted px-3 py-2 text-sm">No matches</li>}
          {filtered.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onSelect(candidate);
                  close();
                }}
                className="text-text-primary block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-[var(--hover)] focus:outline-none focus-visible:bg-[var(--hover)]"
              >
                {candidate.name}
                <span className="text-text-muted ml-1.5">{candidate.email}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
