import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PaymentStreamForm } from "./PaymentStreamForm"

const baseStreamData = {
  name: "Test stream",
  recipient: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  token: "XLM",
  amount: "10",
  duration: "day",
  durationValue: "1",
  cancellability: false,
  transferability: false,
}

const baseProps = {
  tokenOptions: [{ label: "XLM", value: "XLM" }],
  setStreamData: vi.fn(),
  durationOptions: [{ label: "Day", value: "day" }],
  onSubmit: vi.fn(),
  isSubmitting: false,
}

describe("PaymentStreamForm", () => {
  it("announces dynamic end-time validation errors politely", () => {
    const { container, rerender } = render(
      <PaymentStreamForm streamData={baseStreamData} {...baseProps} />
    )
    const liveRegion = container.querySelector(
      '[aria-live="polite"][aria-atomic="true"]'
    )

    expect(liveRegion).not.toBeNull()
    expect(liveRegion?.textContent).toBe("")

    rerender(
      <PaymentStreamForm
        streamData={{ ...baseStreamData, durationValue: "0" }}
        {...baseProps}
      />
    )

    expect(liveRegion?.textContent).toContain(
      "Duration must be greater than zero"
    )
  })
})
