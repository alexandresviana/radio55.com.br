interface LogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "light" | "dark";
}

const sizes = {
  sm: { icon: 28, text: "text-lg" },
  md: { icon: 36, text: "text-xl" },
  lg: { icon: 48, text: "text-2xl" },
};

export default function Logo({ size = "md", variant = "dark" }: LogoProps) {
  const s = sizes[size];
  const textColor = variant === "light" ? "text-white" : "text-slate-900";
  const subColor = variant === "light" ? "text-emerald-300" : "text-emerald-700";

  return (
    <div className="flex items-center gap-3">
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="48" height="48" rx="12" className="fill-emerald-700" />
        <path
          d="M10 24c0-6 4-10 10-10"
          stroke="#fbbf24"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M10 24c0 6 4 10 10 10"
          stroke="#fbbf24"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M14 24c0-4 2.5-6.5 6-6.5"
          stroke="#fde68a"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="30" cy="24" r="3" fill="#fbbf24" />
        <text
          x="34"
          y="29"
          fill="#fde68a"
          fontSize="16"
          fontWeight="800"
          fontFamily="system-ui, sans-serif"
        >
          55
        </text>
      </svg>
      <div className="leading-tight">
        <p className={`font-bold tracking-tight ${s.text} ${textColor}`}>Rádio 55</p>
        <p className={`text-xs font-medium uppercase tracking-wider ${subColor}`}>Sergipe</p>
      </div>
    </div>
  );
}
