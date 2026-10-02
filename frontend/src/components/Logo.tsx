interface Props {
  /** Rendered square size in px. The mark is legible down to about 16px. */
  size?: number;
}

// The mark: three stacked slabs with the top one lifted clear of the pile and
// filled in the accent — a resume sitting at the top of the stack.
export default function Logo({ size = 24 }: Props) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 24 24"
      role="img" aria-label="Top of the Stack">
      <rect className="logo-pile" x="3" y="17" width="18" height="4" />
      <rect className="logo-pile" x="3" y="11.5" width="18" height="4" />
      <rect className="logo-top" x="3" y="3" width="18" height="5" />
    </svg>
  );
}
