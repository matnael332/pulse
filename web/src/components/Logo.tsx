// The pulse mark: a heartbeat line on the accent square (the same drawing as favicon.svg).
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--mantine-primary-color-filled)" />
      <path
        d="M5 17h5l3-7 5 13 3-6h6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
