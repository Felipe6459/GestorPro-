import Link from "next/link";

function buildHref(
  basePath: string,
  params: Record<string, string>,
  page: number,
): string {
  const usp = new URLSearchParams(params);
  usp.set("page", String(page));
  return `${basePath}?${usp.toString()}`;
}

const NAV_BUTTON_CLASS =
  "focus-visible:ring-focus-ring rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export function Pagination({
  basePath,
  params,
  page,
  totalPages,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  totalPages: number;
}) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="text-text-secondary mt-4 flex items-center justify-between text-sm"
    >
      <p>
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Link
            href={buildHref(basePath, params, page - 1)}
            className={`${NAV_BUTTON_CLASS} border-border-strong text-text-secondary hover:bg-[var(--hover)]`}
          >
            Previous
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={`${NAV_BUTTON_CLASS} border-border-default text-text-muted cursor-not-allowed`}
          >
            Previous
          </span>
        )}
        {hasNext ? (
          <Link
            href={buildHref(basePath, params, page + 1)}
            className={`${NAV_BUTTON_CLASS} border-border-strong text-text-secondary hover:bg-[var(--hover)]`}
          >
            Next
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={`${NAV_BUTTON_CLASS} border-border-default text-text-muted cursor-not-allowed`}
          >
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
