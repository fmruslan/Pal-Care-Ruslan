export function ProductArt({
  kind,
  large = false,
}: {
  kind: string;
  large?: boolean;
}) {
  const color =
    kind === "kettle"
      ? "bg-[#efe8dc]"
      : kind === "speaker"
        ? "bg-[#e7e8e3]"
        : "bg-[#e6ecdf]";
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center overflow-hidden rounded-2xl ${color} ${large ? "h-80" : "h-48"}`}
    >
      <svg
        viewBox="0 0 240 180"
        className={large ? "h-64 w-80" : "h-40 w-56"}
        fill="none"
      >
        <ellipse
          cx="122"
          cy="157"
          rx="60"
          ry="8"
          fill="#203e36"
          opacity=".08"
        />
        {kind === "headphones" ? (
          <>
            <path
              d="M64 110V87a56 56 0 0 1 112 0v23"
              stroke="#2a4138"
              strokeWidth="15"
            />
            <path
              d="M65 81a55 55 0 0 1 110 0"
              stroke="#7b8e78"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <rect
              x="52"
              y="90"
              width="34"
              height="59"
              rx="16"
              fill="#273e35"
              transform="rotate(-8 52 90)"
            />
            <rect
              x="61"
              y="94"
              width="18"
              height="48"
              rx="9"
              fill="#4b6150"
              transform="rotate(-8 61 94)"
            />
            <rect
              x="155"
              y="85"
              width="34"
              height="59"
              rx="16"
              fill="#273e35"
              transform="rotate(8 155 85)"
            />
            <rect
              x="161"
              y="92"
              width="18"
              height="48"
              rx="9"
              fill="#4b6150"
              transform="rotate(8 161 92)"
            />
          </>
        ) : kind === "kettle" ? (
          <>
            <path
              d="M155 75c48-18 55 50 9 49"
              stroke="#465348"
              strokeWidth="11"
            />
            <path
              d="M84 76c-6 28-21 48-12 64 10 19 81 19 92 0 10-17-9-42-12-64Z"
              fill="#e1b88d"
              stroke="#a27d59"
              strokeWidth="2"
            />
            <path
              d="M87 104C66 98 59 78 41 78l-8-12c26-4 41 9 53 16"
              fill="#e1b88d"
              stroke="#a27d59"
              strokeWidth="2"
            />
            <ellipse
              cx="118"
              cy="76"
              rx="34"
              ry="7"
              fill="#f0d5b7"
              stroke="#a27d59"
              strokeWidth="2"
            />
            <rect x="110" y="61" width="16" height="12" rx="5" fill="#465348" />
            <path
              d="M92 90c-5 19-14 35-11 44"
              stroke="#f1d7bb"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <rect
              x="71"
              y="32"
              width="98"
              height="119"
              rx="28"
              fill="#52665a"
            />
            <rect x="80" y="43" width="80" height="98" rx="20" fill="#8e9c89" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <path
                key={n}
                d={`M87 ${54 + n * 10}h66`}
                stroke="#536651"
                strokeWidth="2"
                strokeDasharray="2 4"
              />
            ))}
            <rect x="112" y="22" width="16" height="19" rx="7" fill="#344e40" />
            <path
              d="M119 26v8"
              stroke="#d8e2ce"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </div>
  );
}
