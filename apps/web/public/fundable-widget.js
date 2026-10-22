(() => {
  const scriptUrl = document.currentScript instanceof HTMLScriptElement
    ? new URL(document.currentScript.src, window.location.href)
    : new URL(window.location.href);
  const campaignIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

  function hostPrefersDark(element) {
    let node = element;
    while (node && node instanceof HTMLElement) {
      if (node.classList.contains("dark")) return true;
      const style = window.getComputedStyle(node);
      if (style.colorScheme === "dark") return true;
      const match = style.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const alpha = style.backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)/);
        if (alpha && Number(alpha[1]) === 0) {
          node = node.parentElement;
          continue;
        }
        const [red, green, blue] = match.slice(1).map(Number);
        if ((red * 299 + green * 587 + blue * 114) / 1000 < 127) return true;
        return false;
      }
      node = node.parentElement;
    }
    return typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  class FundableWidget extends HTMLElement {
    static get observedAttributes() {
      return ["campaign-id", "theme"];
    }

    constructor() {
      super();
      this.root = this.attachShadow({ mode: "open" });
      this.root.innerHTML = `
        <style>
          :host { display:block; width:100%; max-width:440px; margin-inline:auto; }
          .loading { color:#64748b; font:13px system-ui,sans-serif; padding:12px; }
          iframe { display:block; width:100%; min-height:390px; border:0; border-radius:14px; }
        </style>
        <div class="loading" role="status">Loading campaign widget…</div>
      `;
      this.loading = this.root.querySelector(".loading");
      this.frame = null;
      this.observer = null;
      this.media = null;
      this.lastSrc = "";
      this.onHostThemeChange = () => this.updateFrame();
    }

    connectedCallback() {
      if (!this.frame) {
        this.frame = document.createElement("iframe");
        this.frame.title = "Fundable campaign funding widget";
        this.frame.loading = "lazy";
        this.frame.referrerPolicy = "strict-origin-when-cross-origin";
        this.frame.addEventListener("load", () => {
          if (!campaignIdPattern.test(this.getAttribute("campaign-id") || "")) return;
          this.loading.hidden = true;
        });
        this.frame.addEventListener("error", () => {
          this.loading.hidden = false;
          this.loading.textContent = "Campaign widget could not be loaded. Please try again.";
          this.loading.setAttribute("role", "alert");
        });
        this.root.append(this.frame);
      }

      this.observer?.disconnect();
      this.observer = new MutationObserver(this.onHostThemeChange);
      this.observer.observe(this, { attributes: true, attributeFilter: ["class", "style"] });
      for (let node = this.parentElement; node; node = node.parentElement) {
        this.observer.observe(node, { attributes: true, attributeFilter: ["class", "style"] });
      }
      this.media?.removeEventListener?.("change", this.onHostThemeChange);
      this.media = typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
      this.media?.addEventListener?.("change", this.onHostThemeChange);
      this.updateFrame();
    }

    disconnectedCallback() {
      this.observer?.disconnect();
      this.observer = null;
      this.media?.removeEventListener?.("change", this.onHostThemeChange);
      this.media = null;
    }

    attributeChangedCallback() {
      if (this.isConnected) this.updateFrame();
    }

    updateFrame() {
      if (!this.frame) return;
      const id = this.getAttribute("campaign-id") || "";
      if (!campaignIdPattern.test(id)) {
        this.frame.removeAttribute("src");
        this.loading.hidden = false;
        this.loading.textContent = "A valid campaign-id is required.";
        this.loading.setAttribute("role", "alert");
        return;
      }

      const requestedTheme = this.getAttribute("theme") || "auto";
      const theme = requestedTheme === "dark" || requestedTheme === "light" || requestedTheme === "forest"
        ? requestedTheme
        : requestedTheme === "auto" && hostPrefersDark(this)
          ? "dark"
          : "light";
      const src = new URL(`/api/campaigns/${encodeURIComponent(id)}/widget`, scriptUrl.origin);
      src.searchParams.set("theme", theme);
      if (src.href !== this.lastSrc) {
        this.lastSrc = src.href;
        this.loading.hidden = false;
        this.loading.textContent = "Loading campaign widget…";
        this.loading.removeAttribute("role");
        this.frame.src = src.href;
      }
    }
  }

  if (!customElements.get("fundable-widget")) {
    customElements.define("fundable-widget", FundableWidget);
  }
})();
