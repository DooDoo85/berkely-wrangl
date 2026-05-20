import wranglBadgeSrc from '../assets/wrangl_badge.png'

/**
 * WranglBadge — the in-app logo mark.
 *
 * Uses the official Berkely Distribution logo badge (cropped from the
 * full lockup). Used in the desktop sidebar header and the mobile top bar.
 *
 * The PNG asset must live at `src/assets/wrangl_badge.png` (a high-res
 * crop of the badge portion of the full Wrangl logo). The browser will
 * cache it once after first load.
 *
 * Props:
 *   size — pixel dimension (square). Default 40.
 *   className — optional Tailwind classes for sizing/positioning.
 */
export default function WranglBadge({ size = 40, className = '' }) {
  return (
    <img
      src={wranglBadgeSrc}
      alt="Wrangl"
      width={size}
      height={size}
      className={className}
      style={{
        display: 'block',
        flexShrink: 0,
      }}
    />
  )
}
