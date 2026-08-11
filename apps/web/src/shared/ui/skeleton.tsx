export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-pulse rounded-md bg-zinc-100 ${className}`}
    />
  );
}
