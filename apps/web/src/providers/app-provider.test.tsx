import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import AppProvider from "./app-provider"

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/organisms/AdminNavbar", () => ({
  default: () => <div>Admin navigation</div>,
}))

vi.mock("@/components/ui/app-sidebar", () => ({
  AppSidebar: () => <div>App sidebar</div>,
}))

function setOnlineStatus(isOnline: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: isOnline,
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setOnlineStatus(true)
})

describe("AppProvider offline notification", () => {
  it("shows an accessible notification when the app mounts offline", async () => {
    setOnlineStatus(false)

    render(
      <AppProvider>
        <div>Dashboard content</div>
      </AppProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeNull()
    })

    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite")
    expect(screen.getByRole("status").textContent).toContain("You're offline")
  })

  it("updates the notification when connectivity changes", async () => {
    setOnlineStatus(true)
    render(
      <AppProvider>
        <div>Dashboard content</div>
      </AppProvider>,
    )

    expect(screen.queryByRole("status")).toBeNull()

    setOnlineStatus(false)
    fireEvent(window, new Event("offline"))

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeNull()
    })

    setOnlineStatus(true)
    fireEvent(window, new Event("online"))

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull()
    })
  })

  it("removes connectivity listeners when unmounted", () => {
    const addEventListener = vi.spyOn(window, "addEventListener")
    const removeEventListener = vi.spyOn(window, "removeEventListener")
    const { unmount } = render(
      <AppProvider>
        <div>Dashboard content</div>
      </AppProvider>,
    )

    const onlineListener = addEventListener.mock.calls.find(
      ([event]) => event === "online",
    )?.[1]
    const offlineListener = addEventListener.mock.calls.find(
      ([event]) => event === "offline",
    )?.[1]

    expect(onlineListener).toBeDefined()
    expect(offlineListener).toBeDefined()

    unmount()

    expect(removeEventListener).toHaveBeenCalledWith("online", onlineListener)
    expect(removeEventListener).toHaveBeenCalledWith("offline", offlineListener)
  })
})
