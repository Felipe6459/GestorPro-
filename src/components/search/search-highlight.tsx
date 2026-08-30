import { buildHighlightSegments } from "@/lib/search-ui/highlight";

/**
 * Global Search Stage 3 (docs/search-architecture.md §3/§7). Renders
 * `buildHighlightSegments`'s output as plain JSX text nodes and `<mark>`
 * elements — never React's raw-HTML-injection escape hatch, matching this
 * app's absolute rule (the same discipline Comments' own mention-segment
 * rendering already follows). `<mark>` alone already conveys "this is highlighted"
 * to assistive tech independent of its background color (its own
 * semantic, not a `<span style="color">`), and `font-semibold` adds a
 * second, non-color visual cue on top of it.
 *
 * Design System Batch 6 — bg-yellow-200 replaced with the existing
 * --warning-subtle wash (the closest existing token family to a
 * highlight's own warm-yellow hue), rather than a new literal or a new
 * shared token invented for this one call site. text-inherit is kept
 * exactly as-is: the surrounding title/preview text's own now-migrated
 * text-text-primary/text-text-secondary color still applies through the
 * mark unchanged.
 */
export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const segments = buildHighlightSegments(text, query);

  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="bg-warning-subtle rounded-sm font-semibold text-inherit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
