/**
 * jsdom does not implement layout: every element reports a size of zero, which
 * makes virtualisers render an empty window and hides layout-dependent bugs.
 *
 * This helper fakes a fixed viewport size for all elements so components that
 * depend on element measurements can be exercised in unit tests. Call the
 * returned function in `afterAll` to restore the original descriptors.
 */
const MEASURED_PROPERTIES = ["offsetWidth", "offsetHeight", "clientWidth", "clientHeight"] as const;

export function installJsdomLayout(width = 1200, height = 600): () => void {
  const originals = new Map<string, PropertyDescriptor | undefined>();

  for (const property of MEASURED_PROPERTIES) {
    originals.set(property, Object.getOwnPropertyDescriptor(HTMLElement.prototype, property));
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get() {
        return property.includes("Width") ? width : height;
      },
    });
  }

  return () => {
    for (const property of MEASURED_PROPERTIES) {
      const descriptor = originals.get(property);
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, property, descriptor);
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
      }
    }
  };
}
