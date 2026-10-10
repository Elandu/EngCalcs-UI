import Link from "next/link";

/** Shared vector brand lock-up for EngCalcs marketing, auth and engineering workspace. */
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="EngCalcs home">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 64 64" role="presentation" focusable="false">
          <rect width="64" height="64" rx="9" fill="#19382F" />
          <g transform="translate(7 7) scale(.78)" fill="none" strokeLinejoin="bevel" strokeLinecap="square">
            <path d="M44.8 10.5H26.4L10.0 23.0V40.9L26.7 53.3H45.8" stroke="#F6F4ED" strokeWidth="7.3" />
            <path d="M42.3 23.1H32.0L23.1 29.4V35.4L32.0 42.0H42.3" stroke="#D5AC71" strokeWidth="6.3" />
          </g>
        </svg>
      </span>
      <span className="brand-wordmark">EngCalcs</span>
    </Link>
  );
}
