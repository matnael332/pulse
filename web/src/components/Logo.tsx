// The pulse mark: a heartbeat line on a white square (the same drawing as favicon.svg).
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#fff" />
      <path
        d="M5 17h5l3-7 5 13 3-6h6"
        fill="none"
        stroke="#000"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
