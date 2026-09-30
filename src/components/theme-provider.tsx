'use client';

// Theme provider — dark mode is the default from day one (PRD v2.2 §10:
// "Dark mode supported from the start — common for sellers checking deals at night").

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
