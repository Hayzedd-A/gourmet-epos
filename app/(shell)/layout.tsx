"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SyncBadge } from "@/components/SyncBadge";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/session";
import { canManageCatalog, canManageStaff } from "@/shared/permissions";
import type { AccessRole } from "@/shared/types/domain";

const NAV: { href: string; label: string; show: (role: AccessRole) => boolean }[] = [
  { href: "/pos", label: "POS", show: () => true },
  { href: "/products", label: "Products", show: canManageCatalog },
  { href: "/sales", label: "Sales", show: canManageCatalog },
  { href: "/staff", label: "Staff", show: canManageStaff },
  { href: "/settings", label: "Settings", show: () => true },
];

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loading, logout } = useSession();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  if (loading || !session) {
    return null;
  }

  const nav = NAV.filter((item) => item.show(session.accessRole));

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <nav className="flex items-center gap-1">
          <span className="mr-2 px-2 text-sm font-semibold text-ink">Gourmet Twist</span>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors ${
                pathname === item.href ? "bg-primary text-primary-ink" : "text-ink hover:bg-surface"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <SyncBadge />
          <p className="text-xs text-muted">
            {session.name} · <span className="capitalize">{session.accessRole.replace("_", " ")}</span>
          </p>
          <Button
            variant="ghost"
            onClick={async () => {
              await logout();
              router.replace("/");
            }}
          >
            Log out
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
