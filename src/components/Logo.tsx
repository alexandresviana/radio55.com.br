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

        {/* Estrelas de fundo */}
        <circle cx="12" cy="11" r="1" fill="#a7f3d0" opacity="0.8" />
        <circle cx="38" cy="15" r="0.8" fill="#a7f3d0" opacity="0.6" />
        <circle cx="35" cy="37" r="1" fill="#a7f3d0" opacity="0.7" />

        {/* Planeta central */}
        <circle cx="24" cy="24" r="8" fill="#059669" />
        <circle cx="24" cy="24" r="8" stroke="#34d399" strokeWidth="1" opacity="0.8" />
        <path
          d="M17.5 21.5c2-1.8 5.5-2.4 9-1.4M16.8 26c2.6 1.9 7.3 2.4 11.4.6"
          stroke="#a7f3d0"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.9"
          fill="none"
        />

        {/* Anel orbital */}
        <ellipse
          cx="24"
          cy="24"
          rx="17"
          ry="7"
          stroke="#fbbf24"
          strokeWidth="2"
          fill="none"
          transform="rotate(-22 24 24)"
        />

        {/* Satélite na órbita */}
        <circle cx="38.5" cy="17" r="3" fill="#fbbf24" />
        <circle cx="38.5" cy="17" r="1.2" fill="#fef3c7" />
      </svg>
      <div className="leading-tight">
        <p className={`font-bold tracking-tight ${s.text} ${textColor}`}>Orbit View</p>
        <p className={`text-xs font-medium uppercase tracking-wider ${subColor}`}>
          Monitoramento
        </p>
      </div>
    </div>
  );
}
