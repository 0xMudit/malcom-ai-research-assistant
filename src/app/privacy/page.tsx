import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Malcom handles account data, guest chats, and uploads.",
};

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Privacy"
      title="Privacy Policy"
      description="Malcom is designed for research workflows that may include sensitive notes, code, and documents."
      sections={[
        {
          title: "Guest data",
          body: "Guest chats and guest usage are stored on your device through browser storage. Clearing browser storage or using the Clear guest data action removes that local data.",
        },
        {
          title: "Uploaded files",
          body: "Uploaded text files are used as context for the current conversation. Signed-in users may see uploaded documents in their document library; guest uploads remain local unless sent to the chat API for analysis.",
        },
        {
          title: "Account data",
          body: "Signed-in account data can include saved chats, starred responses, profile memory, usage status, and subscription status. Stripe handles payment details; Malcom stores only subscription identifiers and status.",
        },
        {
          title: "Contact",
          body: "Use the contact page for privacy requests, data questions, or support. Do not include secrets or highly sensitive personal data in support messages.",
        },
      ]}
    />
  );
}
