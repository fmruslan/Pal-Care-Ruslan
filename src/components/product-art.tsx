export function ProductArt({
  kind,
  large = false,
  size = "card",
}: {
  kind: string;
  large?: boolean;
  size?: "card" | "compact" | "thumbnail" | "hero";
}) {
  return (
    <div
      aria-hidden="true"
      data-product-art={kind}
      className={`product-wash relative flex items-center justify-center overflow-hidden ${size === "hero" ? "rounded-full" : "rounded-xl"} ${large ? "min-h-80 h-full" : size === "thumbnail" ? "size-18 shrink-0" : size === "hero" ? "size-36 sm:size-40" : size === "compact" ? "h-36 sm:h-40" : "h-48"}`}
    >
      {size !== "thumbnail" && (
        <div className="absolute inset-3 rounded-full border border-brand/10" />
      )}
      <svg
        viewBox="0 0 280 210"
        className={`relative max-w-full drop-shadow-sm ${large ? "h-72 w-full max-w-96" : size === "thumbnail" ? "h-16 w-18" : size === "hero" ? "h-36 w-40" : "h-36 w-48"}`}
        fill="none"
      >
        <ellipse
          cx="140"
          cy="185"
          rx="68"
          ry="8"
          fill="var(--art-shadow)"
          opacity=".12"
        />
        {kind === "computer" ? (
          <>
            <rect
              x="57"
              y="55"
              width="166"
              height="118"
              rx="16"
              fill="var(--art-body)"
              stroke="var(--art-edge)"
              strokeWidth="3"
            />
            <rect
              x="106"
              y="90"
              width="55"
              height="48"
              rx="7"
              fill="var(--art-edge)"
            />
            <path
              d="M75 75h130M78 153h125M90 90v48M175 90v48"
              stroke="var(--art-highlight)"
              strokeWidth="4"
              strokeDasharray="4 5"
            />
            <rect
              x="192"
              y="100"
              width="38"
              height="48"
              rx="5"
              fill="var(--art-alt)"
              stroke="var(--art-edge)"
              strokeWidth="3"
            />
          </>
        ) : kind === "headphones" ? (
          <>
            <path
              d="M72 126V94a68 68 0 0 1 136 0v32"
              stroke="var(--art-edge)"
              strokeWidth="17"
            />
            <path
              d="M72 94a68 68 0 0 1 136 0"
              stroke="var(--art-body)"
              strokeWidth="13"
            />
            <path
              d="M83 63a66 66 0 0 1 114 0"
              stroke="var(--art-highlight)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M75 119v31m130-31v31"
              stroke="var(--art-alt)"
              strokeWidth="9"
            />
            <rect
              x="57"
              y="109"
              width="44"
              height="68"
              rx="21"
              fill="var(--art-edge)"
              transform="rotate(-9 57 109)"
            />
            <rect
              x="61"
              y="109"
              width="32"
              height="62"
              rx="16"
              fill="var(--art-body)"
              transform="rotate(-9 61 109)"
            />
            <path
              d="M69 121v31"
              stroke="var(--art-highlight)"
              strokeWidth="3"
              opacity=".8"
              strokeLinecap="round"
              transform="rotate(-9 69 121)"
            />
            <rect
              x="181"
              y="103"
              width="44"
              height="68"
              rx="21"
              fill="var(--art-edge)"
              transform="rotate(9 181 103)"
            />
            <rect
              x="189"
              y="109"
              width="32"
              height="62"
              rx="16"
              fill="var(--art-body)"
              transform="rotate(9 189 109)"
            />
            <circle
              cx="205"
              cy="141"
              r="5"
              stroke="var(--art-highlight)"
              strokeWidth="2"
            />
          </>
        ) : kind === "kettle" ? (
          <>
            <path
              d="M180 88c59-23 64 64 10 66"
              stroke="var(--art-edge)"
              strokeWidth="13"
            />
            <path
              d="M178 89c44-15 52 49 10 55"
              stroke="var(--art-body)"
              strokeWidth="5"
            />
            <path
              d="M102 87c-3 29-24 58-14 78 12 23 94 23 107 0 12-22-10-49-12-78Z"
              fill="var(--art-alt)"
              stroke="var(--art-edge)"
              strokeWidth="2"
            />
            <path
              d="M105 115C78 109 68 81 45 82l-7-13c32-5 47 13 64 18"
              fill="var(--art-alt)"
              stroke="var(--art-edge)"
              strokeWidth="2"
            />
            <ellipse
              cx="142"
              cy="87"
              rx="41"
              ry="9"
              fill="var(--art-highlight)"
              stroke="var(--art-edge)"
              strokeWidth="2"
            />
            <path
              d="M108 104c-3 24-17 40-14 53"
              stroke="var(--card)"
              strokeWidth="5"
              opacity=".65"
              strokeLinecap="round"
            />
            <rect
              x="132"
              y="67"
              width="20"
              height="15"
              rx="6"
              fill="var(--art-edge)"
            />
            <path
              d="M137 70h9"
              stroke="var(--art-highlight)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <path
              d="M139 44v-8c0-12 19-12 19 0v16"
              stroke="var(--art-edge)"
              strokeWidth="7"
            />
            <rect
              x="84"
              y="45"
              width="115"
              height="132"
              rx="31"
              fill="var(--art-edge)"
            />
            <rect
              x="86"
              y="45"
              width="105"
              height="128"
              rx="29"
              fill="var(--art-body)"
            />
            <rect
              x="96"
              y="59"
              width="83"
              height="101"
              rx="21"
              fill="var(--art-highlight)"
            />
            {Array.from({ length: 9 }, (_, row) => (
              <path
                key={row}
                d={`M105 ${71 + row * 10}h66`}
                stroke="var(--art-edge)"
                strokeWidth="2"
                strokeDasharray="2 5"
                opacity=".65"
              />
            ))}
            <rect
              x="125"
              y="109"
              width="25"
              height="22"
              rx="7"
              fill="var(--art-body)"
            />
            <path
              d="M133 120h9m-4-4v8"
              stroke="var(--art-edge)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M101 54h62"
              stroke="var(--card)"
              strokeWidth="2"
              opacity=".5"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </div>
  );
}
