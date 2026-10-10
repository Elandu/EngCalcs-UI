import Link from "next/link";

/** Shared vector brand lock-up for EngCalcs marketing, auth and engineering workspace. */
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="EngCalcs home">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="presentation" focusable="false">
          <rect width="48" height="48" rx="5" fill="#19382f" />
          <path d="M35 10H23L12 20V28L23 38H35" fill="none" stroke="#f6f4ed" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter" />
          <path d="M30 16H21V32H30M21 24H29" fill="none" stroke="#d5ac71" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
      </span>
      <span className="brand-wordmark">EngCalcs</span>
    </Link>
  );
}
