export function Chevron({ dir = "right", className = "" }: { dir?: "left" | "right"; className?: string }) {
  return (
    <svg
      viewBox="0 0 12 28"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="square"
      style={dir === "left" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M2 2 L10 14 L2 26" />
    </svg>
  );
}
