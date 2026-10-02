interface Props {
  label: string; // announced to screen readers, which can't see the animation
}

/** Spinning ring for waits with no progress to report. */
export default function Spinner({ label }: Props) {
  return (
    <span className="spin-row" role="status">
      <span className="spin" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
