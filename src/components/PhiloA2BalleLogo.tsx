import {
  CROSSBAR_KNOT_PATH,
  LACE_BOW_PATH,
  LEFT_LACE_PATH,
  LEFT_SHOE_DETAIL_PATH,
  LEFT_SHOE_OUTLINE_PATH,
  RIGHT_LACE_PATH,
  RIGHT_SHOE_DETAIL_PATH,
  RIGHT_SHOE_OUTLINE_PATH,
} from '../utils/logoShoePaths';
import { LOGO_CROSSBAR_ANCHOR, type WindStrength } from '../utils/logoWindPhysics';

interface PhiloA2BalleLogoProps {
  windStrength?: WindStrength;
  paused?: boolean;
  className?: string;
  showFrame?: boolean;
}

const WIND_CLASS: Record<WindStrength, string> = {
  calme: 'logo-wind-calme',
  brise: 'logo-wind-brise',
  rafale: 'logo-wind-rafale',
};

export function PhiloA2BalleLogo({
  windStrength = 'brise',
  paused = false,
  className = '',
  showFrame = true,
}: PhiloA2BalleLogoProps) {
  const windAnimClass = WIND_CLASS[windStrength] ?? 'logo-wind-brise';

  return (
    <div
      className={`relative overflow-hidden bg-[#121617] select-none ${
        showFrame ? 'rounded-xl border border-[#27272A]/60 shadow-sm' : ''
      } ${paused ? 'logo-anim-paused' : ''} ${className}`}
      style={{
        aspectRatio: `${LOGO_CROSSBAR_ANCHOR.naturalWidth} / ${LOGO_CROSSBAR_ANCHOR.naturalHeight}`,
      }}
    >
      <svg
        viewBox={`0 0 ${LOGO_CROSSBAR_ANCHOR.naturalWidth} ${LOGO_CROSSBAR_ANCHOR.naturalHeight}`}
        className="w-full h-full block"
        role="img"
        aria-label="Logo PHILOA2BALLES"
      >
        <defs>
          <filter id="philo-shoe-shadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.82" />
          </filter>
          <linearGradient id="philo-wind-streak" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Exact original rainy-glass artwork & typography cropped cleanly without burgundy margin */}
        <image
          href="/assets/philoa2balle-logo-bg.png"
          x="0"
          y="0"
          width={LOGO_CROSSBAR_ANCHOR.naturalWidth}
          height={LOGO_CROSSBAR_ANCHOR.naturalHeight}
          preserveAspectRatio="xMidYMid slice"
        />

        {/* Subtle passing breeze wisps near the hanging shoes */}
        <g className="logo-wind-wisp pointer-events-none">
          <path
            d="M 310 792 Q 485 772, 690 796"
            fill="none"
            stroke="url(#philo-wind-streak)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M 355 896 Q 525 878, 730 902"
            fill="none"
            stroke="url(#philo-wind-streak)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>

        {/* Fixed knot loop clinging around the horizontal crossbar of A (x=510, y=536) */}
        <g filter="url(#philo-shoe-shadow)">
          <path
            d={CROSSBAR_KNOT_PATH}
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="1.5"
          />
          <g
            className="logo-lace-bow"
            style={{
              transformOrigin: `${LOGO_CROSSBAR_ANCHOR.x}px ${LOGO_CROSSBAR_ANCHOR.y}px`,
            }}
          >
            <path
              d={LACE_BOW_PATH}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="4.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>

        {/* Main pendulum assembly anchored on the A crossbar (510, 536) */}
        <g
          className={windAnimClass}
          filter="url(#philo-shoe-shadow)"
          style={{
            transformOrigin: `${LOGO_CROSSBAR_ANCHOR.x}px ${LOGO_CROSSBAR_ANCHOR.y}px`,
          }}
        >
          {/* Left lace + left continuous-line high-top sneaker */}
          <path
            d={LEFT_LACE_PATH}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <g
            className="logo-shoe-left"
            style={{
              transformOrigin: `${LOGO_CROSSBAR_ANCHOR.leftShoePivotX}px ${LOGO_CROSSBAR_ANCHOR.leftShoePivotY}px`,
            }}
          >
            {/* Soft translucent backing inside silhouette so dark glass reads cleanly */}
            <path d={LEFT_SHOE_OUTLINE_PATH} fill="rgba(14, 17, 18, 0.42)" />
            <path
              d={LEFT_SHOE_OUTLINE_PATH}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="5.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={LEFT_SHOE_DETAIL_PATH}
              fill="none"
              stroke="#F4F4F5"
              strokeWidth="3.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>

          {/* Right lace + right continuous-line high-top sneaker */}
          <path
            d={RIGHT_LACE_PATH}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <g
            className="logo-shoe-right"
            style={{
              transformOrigin: `${LOGO_CROSSBAR_ANCHOR.rightShoePivotX}px ${LOGO_CROSSBAR_ANCHOR.rightShoePivotY}px`,
            }}
          >
            <path d={RIGHT_SHOE_OUTLINE_PATH} fill="rgba(14, 17, 18, 0.42)" />
            <path
              d={RIGHT_SHOE_OUTLINE_PATH}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="5.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={RIGHT_SHOE_DETAIL_PATH}
              fill="none"
              stroke="#F4F4F5"
              strokeWidth="3.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
