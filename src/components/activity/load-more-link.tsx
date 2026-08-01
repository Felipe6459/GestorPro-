import Link from "next/link";

/**
 * A plain GET link carrying the currently-active filters forward plus the
 * next-page cursor — no client-side state, consistent with the rest of
 * this project's pagination (see components/list/pagination.tsx).
 */
export function LoadMoreLink({
  basePath,
  params,
  cursor,
}: {
  basePath: string;
  params: Record<string, string>;
  cursor: string;
}) {
  const usp = new URLSearchParams(params);
  usp.set("cursor", cursor);

  return (
    <Link
      href={`${basePath}?${usp.toString()}`}
      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
    >
      Load more
    </Link>
  );
}
