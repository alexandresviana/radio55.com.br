"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";

interface HeaderProps {
  subtitle?: string;
}

export default function Header({ subtitle }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links = [
    { href: "/", label: "O que está rolando?" },
    { href: "/mapa", label: "Mapa" },
    { href: "/admin", label: "Admin" },
  ];

  function linkAtivo(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="border-b border-emerald-900/20 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <Link href="/" className="inline-block">
            <Logo variant="light" />
          </Link>
          {subtitle && (
            <p className="mt-1 truncate text-sm text-emerald-200/70">{subtitle}</p>
          )}
        </div>

        <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                linkAtivo(link.href)
                  ? "bg-emerald-700/50 text-white"
                  : "text-emerald-100/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="sm:hidden">{link.href === "/" ? "Rolando" : link.label}</span>
              <span className="hidden sm:inline">{link.label}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-emerald-100/80 transition hover:bg-white/10 hover:text-white"
          >
            Sair
          </button>
        </nav>
      </div>
    </header>
  );
}
