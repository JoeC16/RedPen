import type { UserRole } from "./db/schema";

export const roleLabel: Record<UserRole, string> = {
  authority_admin: "Authority admin",
  school_admin: "School admin",
  teacher: "Teacher",
};

export type NavItem = { href: string; label: string };

export function navFor(role: UserRole): NavItem[] {
  switch (role) {
    case "teacher":
      return [
        { href: "/", label: "Home" },
        { href: "/classes", label: "My classes" },
        { href: "/trust", label: "Trust centre" },
      ];
    case "school_admin":
      return [
        { href: "/", label: "Home" },
        { href: "/dashboard", label: "Dashboard" },
        { href: "/classes", label: "Classes" },
        { href: "/audit", label: "Audit log" },
        { href: "/data", label: "School data" },
        { href: "/trust", label: "Trust centre" },
      ];
    case "authority_admin":
      return [
        { href: "/", label: "Home" },
        { href: "/dashboard", label: "Dashboard" },
        { href: "/schools", label: "Schools" },
        { href: "/audit", label: "Audit log" },
        { href: "/data", label: "School data" },
        { href: "/settings", label: "Settings" },
        { href: "/trust", label: "Trust centre" },
      ];
  }
}
