"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { FileText, LogOut, User } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";

interface AuthButtonProps {
  onLogoutClick?: () => void;
  /** Where to land after logging out. Defaults to the login page. */
  logoutRedirectTo?: string;
  /** Shown to signed-out visitors instead of the default "Masuk" button. */
  guestFallback?: React.ReactNode;
}

export function AuthButton({ onLogoutClick, logoutRedirectTo, guestFallback }: AuthButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { logout } = useAuthStore();
  const { user, isLoading } = useCurrentUser();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogoutClick = () => {
    setIsOpen(false);
    if (onLogoutClick) {
      onLogoutClick();
    } else {
      logout(logoutRedirectTo);
    }
  };

  if (isLoading) {
    return <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" aria-hidden />;
  }

  if (!user) {
    if (guestFallback !== undefined) {
      return <>{guestFallback}</>;
    }

    return (
      <Button asChild variant="ghost" className="h-10 rounded-lg px-3">
        <Link href="/login">Masuk</Link>
      </Button>
    );
  }

  // "Pencari Kerja #3d9a" -> "#3d9a": the name others see in TelaahBareng, shown next to the account name
  const publicTag = user.pseudonym?.match(/#\w+$/)?.[0];
  const displayName = user.name;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* User Profile Button */}
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="h-10 px-3 hover:bg-accent rounded-lg transition-colors flex items-center gap-2"
      >
        {/* User Icon + Basic Identity */}
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
              <User size={16} className="text-primary" />
            </div>
          </div>
          <div className="hidden md:flex flex-col items-start text-left">
            <span className="text-sm font-medium leading-none text-foreground">{displayName}</span>
          </div>
        </div>
      </Button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-50 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Status Header */}
          <div className="p-4 border-b border-border bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <User size={18} className="text-primary" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground break-all">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="p-1">
            <Link
              href="/telaah-bersama/saya"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <FileText className="w-4 h-4" />
              Post saya
            </Link>
            <button
              onClick={handleLogoutClick}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Keluar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
