interface Props {
  subtitle?: string;
}

/** SignBolt wordmark: a lightning-bolt mark + two-tone wordmark. */
export default function Logo({ subtitle }: Props) {
  return (
    <div className="logo-row">
      <span className="logo">
        <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden>
          <path
            d="M13 2 L3 14 h7 l-1 8 L21 9 h-7 l0 -7 z"
            fill="currentColor"
          />
        </svg>
        <span className="logo-text">
          Sign<b>Bolt</b>
        </span>
      </span>
      {subtitle && <span className="logo-sub">{subtitle}</span>}
    </div>
  );
}
