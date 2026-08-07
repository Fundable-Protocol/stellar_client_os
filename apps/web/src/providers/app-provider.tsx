"use client";

import React, { type ReactNode, useState } from 'react'
import { WifiOff } from "lucide-react"
import { SidebarProvider } from '@/components/ui/sidebar'
import AdminNavbar from '@/components/organisms/AdminNavbar'
import { AppSidebar } from '@/components/ui/app-sidebar'
import { SyncQueueBanner } from '@/components/organisms/SyncQueueBanner'
import { SyncQueueDrawer } from '@/components/organisms/SyncQueueDrawer'
import { useSyncQueue } from '@/hooks/use-sync-queue'

function AppProvider({ children }: { children: ReactNode; }) {
  const syncQueue = useSyncQueue()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="pt-20">
      <SidebarProvider className="h-[calc(100dvh-5rem)] min-h-[calc(100dvh-5rem)]">
        <AppSidebar />
        <main className="flex flex-col h-full w-full overflow-hidden">
          <AdminNavbar />
          {!syncQueue.isOnline && syncQueue.pendingCount === 0 && (
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sticky top-0 z-50 flex min-h-11 items-center justify-center gap-2 border-b border-amber-700 bg-amber-950 px-4 py-2 text-center text-sm text-amber-100"
            >
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                You&apos;re offline. Network actions are unavailable until your connection is restored.
              </span>
            </div>
          )}
          <SyncQueueBanner
            syncQueue={syncQueue}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
          <SyncQueueDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            syncQueue={syncQueue}
          />
          <div className="flex-1 px-4 py-4 overflow-y-auto pb-16 sm:pb-20 md:pb-4">
            {children}
          </div>
        </main>
      </SidebarProvider>
    </div>
  )
}

export default AppProvider
