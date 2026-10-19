"use client";

import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import type { Role } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

interface UserMenuProps {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: Role;
    department: string | null;
  };
}

function getInitials(name: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu({ user }: UserMenuProps) {
  const t = useT();
  const roleLabel = t(`roles.${user.role}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/20 text-xs text-primary">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start text-start md:flex">
            <span className="text-sm font-medium leading-none">
              {user.name?.split(" ")[0] ?? user.email}
            </span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">{roleLabel}</span>
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/20 text-primary">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground" dir="ltr">{user.email}</div>
              <div className="mt-1 text-[10px] text-primary">{roleLabel}</div>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />


        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}