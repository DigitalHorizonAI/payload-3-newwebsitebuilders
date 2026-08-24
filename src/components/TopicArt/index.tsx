import React from 'react'

/**
 * The main site's four cover drawings, ported verbatim from its generator
 * (blog/_build/build.py ART dict). Inline SVG so the art follows the theme
 * tokens and can never 404. Keyed by category slug; an unknown topic renders
 * the cover ground alone — never a bare gray box.
 */
const ART: Record<string, React.ReactNode> = {
  cms: (
    <>
      <rect className="c-fill-2" x="40" y="52" width="180" height="26" rx="4" />
      <rect className="c-fill-2" x="40" y="92" width="130" height="26" rx="4" />
      <rect className="c-fill" x="40" y="132" width="220" height="26" rx="4" />
      <rect className="c-fill-2" x="40" y="172" width="96" height="26" rx="4" />
      <path className="c-line" d="M300 40 L440 40 L440 260 L300 260 Z" />
      <path className="c-line-2" d="M300 96 L440 96 M300 152 L440 152 M300 208 L440 208 M370 40 L370 260" />
    </>
  ),
  build: (
    <>
      <path className="c-line-2" d="M60 220 L240 130 L420 220 L240 268 Z" />
      <path className="c-line-2" d="M60 170 L240 80 L420 170 L240 218 Z" />
      <path className="c-line" d="M60 120 L240 30 L420 120 L240 168 Z" />
      <circle className="c-fill" cx="240" cy="99" r="15" />
    </>
  ),
  seo: (
    <>
      <circle className="c-line-2" cx="240" cy="150" r="118" />
      <circle className="c-line-2" cx="240" cy="150" r="78" />
      <circle className="c-line" cx="240" cy="150" r="38" />
      <circle className="c-fill" cx="240" cy="150" r="18" />
      <circle className="c-fill" cx="358" cy="150" r="7" />
      <circle className="c-fill" cx="240" cy="72" r="7" />
      <circle className="c-fill" cx="163" cy="211" r="7" />
      <path className="c-line" d="M240 150 L358 150 M240 150 L240 72 M240 150 L163 211" />
    </>
  ),
  process: (
    <>
      <path className="c-line-2" d="M40 250 L140 250 L140 190 L240 190 L240 130 L340 130 L340 70 L440 70" />
      <circle className="c-fill" cx="140" cy="250" r="9" />
      <circle className="c-fill" cx="240" cy="190" r="9" />
      <circle className="c-fill" cx="340" cy="130" r="9" />
      <circle className="c-line" cx="440" cy="70" r="13" />
      <path className="c-line" d="M40 274 L440 274" />
    </>
  ),
}

export const TopicArt: React.FC<{ topic?: string | null }> = ({ topic }) => {
  const art = topic ? ART[topic.toLowerCase()] : null

  return (
    <>
      <span className="cover-ground" aria-hidden="true" />
      {art && (
        <svg
          className="cover"
          viewBox="0 0 480 300"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          focusable="false"
        >
          {art}
        </svg>
      )}
    </>
  )
}
