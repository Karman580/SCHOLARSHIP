'use client';
import { useEffect } from 'react';

/** Client-only convenience so a student can find their way back. Never leaves the device. */
export function RememberCase({ token, label }: { token: string; label: string }) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem('saathi_cases');
      const list: { token: string; createdAt: string; label: string }[] = raw ? JSON.parse(raw) : [];
      if (!list.some((c) => c.token === token)) {
        list.unshift({ token, createdAt: new Date().toISOString(), label });
        localStorage.setItem('saathi_cases', JSON.stringify(list.slice(0, 20)));
      }
    } catch {
      // A blocked or full storage is not an error worth showing anyone.
    }
  }, [token, label]);
  return null;
}
