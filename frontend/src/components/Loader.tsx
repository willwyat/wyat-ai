export default function Loader() {
  // Rotating border around a square using an SVG stroke dash offset
  return (
    <div
      className="w-full flex flex-col items-center justify-center select-none text-gray-800 dark:text-gray-200"
      // Tweak size & speed here via CSS variables
      style={{
        ["--size" as any]: "40px",
        ["--duration" as any]: "1600ms",
      }}
    >
      <div
        className="runner"
        style={{
          width: "var(--size)",
          height: "var(--size)",
          position: "relative",
        }}
      >
        {/* Base square track */}
        <div className="absolute inset-0 border-[4px] border-gray-300/20 dark:border-gray-700/20" />

        {/* Animated border segment */}
        <svg
          className="absolute inset-0"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* The rectangle path has pathLength=100 so percentages are easy */}
          <rect
            x="3"
            y="3"
            width="94"
            height="94"
            pathLength={100}
            fill="none"
            stroke="currentColor"
            strokeWidth={12}
            strokeLinecap="square"
            className="dash"
          />
        </svg>
      </div>

      <style jsx>{`
        .runner {
          image-rendering: pixelated;
        }
        /* Show only a segment of the border, then move it around */
        .dash {
          stroke-dasharray: 22 78; /* visible length, gap (percent of perimeter) */
          animation: spin var(--duration) linear infinite;
        }
        @keyframes spin {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -100;
          } /* clockwise around the perimeter */
        }
        @media (prefers-reduced-motion: reduce) {
          .dash {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
