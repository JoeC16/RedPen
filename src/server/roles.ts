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
      ];
    case "school_admin":
      return [
        { href: "/", label: "Home" },
        { href: "/classes", label: "Classes" },
        { href: "/audit", label: "Audit log" },
      ];
    case "authority_admin":
      return [
        { href: "/", label: "Home" },
        { href: "/schools", label: "Schools" },
        { href: "/audit", label: "Audit log" },
      ];
  }
}
