import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Malcom product updates.",
};

export default function ChangelogPage() {
  return (
    <InfoPage
      eyebrow="Changelog"
      title="Changelog"
      description="Recent product and infrastructure changes."
      sections={[
        {
          title: "Research workspace redesign",
          body: "Updated the app to a Supabase-dark interface with a clearer value proposition, cleaner sidebar, polished composer, starter prompts, and trust links.",
        },
        {
          title: "Attachments in composer",
          body: "Moved upload into the prompt box with drag-and-drop, previews, removal, supported format copy, and 2 MB validation.",
        },
        {
          title: "Usage and billing",
          body: "Added guest limits, free-user cooldown behavior, Stripe checkout, webhook handling, and billing pages.",
        },
        {
          title: "Rendering",
          body: "Improved markdown, math, table, and code-block rendering for technical answers.",
        },
      ]}
    />
  );
}
