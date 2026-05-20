/**
 * WranglBadge — the in-app logo mark.
 *
 * Inline SVG so it scales perfectly at any size with no network request.
 * Used in the desktop sidebar header and the mobile top bar.
 *
 * Props:
 *   size — pixel dimension (square). Default 40.
 *   className — optional Tailwind classes for sizing/positioning
 *
 * The badge contains the W monogram with a lasso curl on a warm
 * gold-tan background, framed by a dark brown rounded square.
 * Subtle slat lines and a mesa silhouette nod to the Berkely
 * Distribution Western branding without being literal.
 */
export default function WranglBadge({ size = 40, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      className={className}
      role="img"
      aria-label="Wrangl"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="wranglBadgeBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8C896" />
          <stop offset="100%" stopColor="#C49866" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="256" height="256" rx="44" fill="#2A1D10" />
      <rect x="6" y="6" width="244" height="244" rx="40" fill="url(#wranglBadgeBg)" />
      <rect x="12" y="12" width="232" height="232" rx="36" fill="none"
            stroke="#C89860" strokeWidth="1.5" opacity="0.6" />
      <line x1="30" y1="52"  x2="226" y2="52"  stroke="#8B5A2B" strokeWidth="0.8" opacity="0.35" />
      <line x1="30" y1="84"  x2="226" y2="84"  stroke="#8B5A2B" strokeWidth="0.8" opacity="0.35" />
      <line x1="30" y1="116" x2="226" y2="116" stroke="#8B5A2B" strokeWidth="0.8" opacity="0.35" />
      <path d="M 14 244 L 14 188 L 36 184 L 46 168 L 68 165 L 76 178 L 92 174 L 108 184
               L 138 178 L 152 172 L 166 176 L 174 168 L 188 165 L 200 178 L 216 180 L 230 184
               L 242 188 L 242 244 Z"
            fill="#5C3E22" opacity="0.85" />
      <path d="M 76 244 L 82 220 Q 100 212 116 218 Q 134 222 156 220 L 168 244 Z"
            fill="#3D2814" opacity="0.6" />
      <text x="128" y="160" textAnchor="middle" fill="#2A1D10"
            fontFamily="Georgia, 'Times New Roman', serif" fontSize="178"
            fontWeight="700" letterSpacing="-3">W</text>
      <path d="M 178 168 Q 200 174 198 198 Q 194 218 176 217 Q 162 215 164 200"
            fill="none" stroke="#2A1D10" strokeWidth="11" strokeLinecap="round" />
    </svg>
  );
}
