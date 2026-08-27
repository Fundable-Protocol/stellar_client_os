import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Input } from "./input"

describe("Input", () => {
  it.each(["e", "E", "+", "-"])(
    "blocks %s in number inputs",
    (key) => {
      const { getByRole } = render(<Input type="number" />)

      expect(fireEvent.keyDown(getByRole("spinbutton"), { key })).toBe(false)
    }
  )

  it.each(["1", ".", "Backspace", "ArrowLeft"])(
    "allows %s in number inputs",
    (key) => {
      const { getByRole } = render(<Input type="number" />)

      expect(fireEvent.keyDown(getByRole("spinbutton"), { key })).toBe(true)
    }
  )

  it.each([
    { key: "+", ctrlKey: true },
    { key: "-", ctrlKey: true },
    { key: "+", metaKey: true },
    { key: "-", metaKey: true },
  ])("allows $key with command modifiers", (keyboardEvent) => {
    const { getByRole } = render(<Input type="number" />)

    expect(
      fireEvent.keyDown(getByRole("spinbutton"), keyboardEvent)
    ).toBe(true)
  })

  it("preserves a caller-supplied keydown handler", () => {
    let defaultPrevented = false
    const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLInputElement>) => {
      defaultPrevented = event.defaultPrevented
    })
    const { getByRole } = render(
      <Input type="number" onKeyDown={onKeyDown} />
    )

    fireEvent.keyDown(getByRole("spinbutton"), { key: "e" })

    expect(onKeyDown).toHaveBeenCalledOnce()
    expect(defaultPrevented).toBe(true)
  })

  it("does not filter exponential characters from text inputs", () => {
    const { getByRole } = render(<Input type="text" />)

    expect(fireEvent.keyDown(getByRole("textbox"), { key: "e" })).toBe(true)
  })
})
