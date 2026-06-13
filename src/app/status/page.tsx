import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Status",
  description: "Malcom service status.",
};

export default function StatusPage() {
  return (
    <InfoPage
      eyebrow="Status"
      title="Status"
      description="Basic status information for the current Malcom deployment."
      sections={[
        {
          title: "Application",
          body: "The Next.js application is available when this page loads. Add external uptime monitoring before production launch.",
        },
        {
          title: "Model backend",
          body: "Chat availability depends on MALCOM_LLM_BASE_URL and the configured model being reachable from the server.",
        },
        {
          title: "Supabase",
          body: "Auth, synced chats, profile data, and persisted documents require Supabase public and service-role environment variables.",
        },
        {
          title: "Stripe",
          body: "Billing requires Stripe secret, webhook, and price environment variables. Webhook delivery controls subscription activation.",
        },
      ]}
    />
  );
}
