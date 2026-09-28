import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Shared touch-target sizing: ~40px hit area on touch widths, shrinking to
// the compact desktop size at sm: (640px), where a pointer is assumed.
export const touchIconSize = "h-10 w-10 sm:h-8 sm:w-8"
export const touchButtonHeight = "h-10 sm:h-7"
