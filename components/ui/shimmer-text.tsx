export function ShimmerText({ children }: { children: string }) {
  return (
    <span aria-label={children} className="agent-progress-loading-text">
      {children}
    </span>
  );
}
