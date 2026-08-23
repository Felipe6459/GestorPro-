export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      // motion-reduce:animate-none — Product UI/UX PR 4: this is the one
      // place `animate-pulse` originates for every skeleton in the app
      // (old and new), so this single addition satisfies reduced-motion
      // everywhere at once, with no other className touched.
      className={`animate-pulse rounded bg-gray-200 motion-reduce:animate-none ${className}`}
    />
  );
}
