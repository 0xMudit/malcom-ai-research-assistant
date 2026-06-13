import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using Malcom.",
};

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow="Terms"
      title="Terms of Service"
      description="These terms summarize expected use while Malcom is in active development."
      sections={[
        {
          title: "Use responsibly",
          body: "Malcom provides AI-generated research assistance. Verify important outputs before relying on them for legal, medical, financial, engineering, or safety-critical decisions.",
        },
        {
          title: "Your content",
          body: "You are responsible for the prompts, documents, and code you submit. Do not upload content you do not have permission to process.",
        },
        {
          title: "Subscriptions",
          body: "Paid plans are processed through Stripe. Subscription status is applied after Stripe confirms payment and webhook delivery.",
        },
        {
          title: "Availability",
          body: "The service may change, pause, or degrade while models, infrastructure, billing, and storage systems are improved.",
        },
      ]}
    />
  );
}
