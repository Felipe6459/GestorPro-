export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      // motion-reduce:animate-none — Product UI/UX PR 4: this is the one
      // place `animate-pulse` originates for every skeleton in the app
      // (old and new), so this single addition satisfies reduced-motion
      // everywhere at once, with no other className touched.
      //
      // Design System Phase 2 — bg-border-default (not a surface-* token):
      // a skeleton block needs enough contrast against its own surrounding
      // surface to read as a placeholder shape, not just a faint tint.
      // border-default is exactly gray-200's existing value in Light (a
      // value-preserving swap) and a proportionate light wash in Dark.
      className={`bg-border-default animate-pulse rounded motion-reduce:animate-none ${className}`}
    />
  );
}
