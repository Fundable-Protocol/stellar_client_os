import React from "react";
import { DeveloperPortal } from "@/components/modules/developers/DeveloperPortal";

export const metadata = {
  title: "Developer Portal & Public API | Fundable",
  description:
    "RESTful Public API with OAuth2 authentication, rate-limit quota display, embeddable widgets, webhooks, and sandbox testing environment.",
};

export default function DevelopersPage() {
  return <DeveloperPortal />;
}
