import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

/**
 * Project dates are calendar days stored as UTC midnight. Reading them at local
 * noon of that day shows the same date in every timezone (no "Jan 14" for a
 * Jan 15 start in the Americas).
 */
export function calendarDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}
