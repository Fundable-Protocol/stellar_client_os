import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CampaignImageGallery from "./CampaignImageGallery";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

describe("CampaignImageGallery", () => {
  it("loads only the hero eagerly and lazy-loads the remaining images", () => {
    const { getAllByRole } = render(
      <CampaignImageGallery
        images={[
          { src: "/hero.jpg", alt: "Campaign hero" },
          { src: "/detail.jpg", alt: "Campaign detail" },
          { src: "/impact.jpg", alt: "Campaign impact" },
        ]}
      />,
    );

    const images = getAllByRole("img");

    expect(images[0].getAttribute("loading")).toBe("eager");
    expect(images[0].getAttribute("fetchpriority")).toBe("high");
    expect(images[1].getAttribute("loading")).toBe("lazy");
    expect(images[1].getAttribute("fetchpriority")).toBe("auto");
    expect(images[2].getAttribute("loading")).toBe("lazy");
    expect(images[2].getAttribute("fetchpriority")).toBe("auto");
  });

  it("does not render an empty gallery", () => {
    const { queryByTestId } = render(<CampaignImageGallery images={[]} />);

    expect(queryByTestId("campaign-image-gallery")).toBeNull();
  });
});
