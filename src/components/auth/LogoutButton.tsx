'use client';

import { LogOut } from 'lucide-react';

export function LogoutButton({ className, label = 'Abmelden' }: { className?: string; label?: string }) {
  return (
    <button
      type="button"
      className={className ?? 'inline-flex items-center gap-1.5 hover:text-rose-300'}
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
        window.location.assign('/gate');
      }}
    >
      <LogOut className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
