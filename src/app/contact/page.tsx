import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Malcom support.",
};

export default function ContactPage() {
  return (
    <InfoPage
      eyebrow="Contact"
      title="Contact Malcom"
      description="For support, privacy, billing, and reliability questions."
      sections={[
        {
          title: "Support",
          body: "Use your preferred support channel configured for this deployment. A hosted contact form can be connected here before launch.",
        },
        {
          title: "Billing",
          body: "For subscription issues, include your account email and the approximate checkout time. Do not send full card numbers or secrets.",
        },
        {
          title: "Security",
          body: "Report security concerns with concise reproduction steps and avoid sharing exploit details publicly.",
        },
        {
          title: "Product feedback",
          body: "Share unclear answers, broken rendering examples, missing document formats, or workflow gaps that slow down research.",
        },
      ]}
    />
  );
}
