'use client'

// فراهم‌کننده‌های سراسری — TanStack Query + تم + تنظیمات نمایش
import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useDisplayStore } from '@/store/display-store'
import { settingsApi } from '@/lib/api/endpoints'
import { useEffect } from 'react'

function DisplaySettingsHydrator() {
  const hydrate = useDisplayStore((s) => s.hydrate)
  useEffect(() => {
    // تنظیمات نمایش از سرور خوانده و اعمال می‌شود (تقویم/ارقام/اعشار)
    settingsApi
      .get()
      .then((res) => hydrate(res.settings))
      .catch(() => {
        // در حالت آفلاین/قطعی، پیش‌فرض‌ها اعمال می‌شوند
      })
  }, [hydrate])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <DisplaySettingsHydrator />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
