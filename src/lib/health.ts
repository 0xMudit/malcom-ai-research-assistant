import "server-only";

import {
  getLocalDatabaseHealth,
  getSupabaseFallbackReason,
} from "@/lib/database";
import {
  MALCOM_LLM_BASE_URL,
  MALCOM_MAX_NUM_PREDICT,
  MALCOM_MODEL,
  MALCOM_NUM_PREDICT,
  MALCOM_REQUEST_TIMEOUT_MS,
} from "@/lib/llm-config";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import {
  createSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from "@/lib/supabase/server";
import { isValidStripePriceConfig } from "@/lib/stripe";

const requiredSupabaseSchema = {
  chat_sessions: [
    "id",
    "user_id",
    "title",
    "folder",
    "tags",
    "pinned",
    "created_at",
    "updated_at",
  ],
  chat_messages: ["id", "session_id", "role", "content", "created_at"],
  feedback: ["id", "name", "email", "rating", "suggestion", "user_agent", "created_at"],
  response_feedback: ["id", "message_id", "reaction", "comment", "created_at"],
  access_requests: ["id", "name", "email", "status", "user_agent", "created_at"],
  sexual_health_facts: ["id", "fact", "created_at"],
  starred_responses: [
    "id",
    "user_id",
    "message_id",
    "session_id",
    "content",
    "created_at",
  ],
  user_profiles: ["user_id", "display_name", "memory", "created_at", "updated_at"],
  gf_memo: [
    "user_id",
    "memo_json",
    "summary",
    "prompt_count",
    "last_prompt_excerpt",
    "updated_at",
  ],
  documents: [
    "id",
    "user_id",
    "name",
    "mime_type",
    "size",
    "content",
    "summary",
    "created_at",
  ],
  user_usage: [
    "user_id",
    "period_started_at",
    "message_count",
    "cooldown_until",
    "updated_at",
  ],
  user_subscriptions: [
    "user_id",
    "stripe_customer_id",
    "stripe_subscription_id",
    "stripe_price_id",
    "status",
    "current_period_end",
    "updated_at",
  ],
} satisfies Record<string, string[]>;

const requiredSupabaseTables = Object.keys(
  requiredSupabaseSchema,
) as Array<keyof typeof requiredSupabaseSchema>;

type CheckStatus = "ok" | "warn" | "fail";

export type PublicAppHealth = {
  status: CheckStatus;
  checkedAt: string;
  components: {
    app: CheckStatus;
    ai: CheckStatus;
    storage: CheckStatus;
    billing: CheckStatus;
  };
};

function getStripeStatus() {
  const required = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID_PRO",
    "STRIPE_PRICE_ID_ENTERPRISE",
  ];
  const missing = required.filter((key) => !process.env[key]);
  const invalid = required.filter((key) => {
    const value = process.env[key]?.trim();

    if (!value) {
      return false;
    }

    if (key === "STRIPE_SECRET_KEY") {
      return !/^sk_(test|live)_/.test(value);
    }

    if (key === "STRIPE_WEBHOOK_SECRET") {
      return !value.startsWith("whsec_") || value === "whsec_...";
    }

    return !isValidStripePriceConfig(value);
  });
  const issues = [...missing, ...invalid.map((key) => `${key} (invalid)`)];

  return {
    status: issues.length ? ("warn" as CheckStatus) : ("ok" as CheckStatus),
    configured: issues.length === 0,
    missing: issues,
  };
}

async function checkLlm() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${MALCOM_LLM_BASE_URL}/api/tags`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    const models: Array<{ name?: unknown; model?: unknown }> = Array.isArray(
      data?.models,
    )
      ? data.models
      : [];
    const modelNames = models
      .map((model) =>
        typeof model?.name === "string"
          ? model.name
          : typeof model?.model === "string"
            ? model.model
            : "",
      )
      .filter(Boolean);
    const modelAvailable = modelNames.some((name) => name === MALCOM_MODEL);

    return {
      status: response.ok ? ("ok" as CheckStatus) : ("fail" as CheckStatus),
      connected: response.ok,
      baseUrl: MALCOM_LLM_BASE_URL,
      model: MALCOM_MODEL,
      modelAvailable,
      availableModels: modelNames.slice(0, 12),
      requestTimeoutMs: MALCOM_REQUEST_TIMEOUT_MS,
      defaultOutputTokens: MALCOM_NUM_PREDICT,
      maxOutputTokens: MALCOM_MAX_NUM_PREDICT,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "fail" as CheckStatus,
      connected: false,
      baseUrl: MALCOM_LLM_BASE_URL,
      model: MALCOM_MODEL,
      modelAvailable: false,
      availableModels: [],
      requestTimeoutMs: MALCOM_REQUEST_TIMEOUT_MS,
      defaultOutputTokens: MALCOM_NUM_PREDICT,
      maxOutputTokens: MALCOM_MAX_NUM_PREDICT,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach the model backend.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkSupabase() {
  const publicConfig = getSupabasePublicConfig();

  if (!publicConfig) {
    return {
      status: "warn" as CheckStatus,
      configured: false,
      adminConfigured: hasSupabaseAdminConfig(),
      fallbackReason: null,
      tables: requiredSupabaseTables.map((table) => ({
        table,
        ok: false,
        error: "Supabase public env vars are not configured.",
      })),
    };
  }

  if (!hasSupabaseAdminConfig()) {
    return {
      status: "warn" as CheckStatus,
      configured: true,
      adminConfigured: false,
      fallbackReason: null,
      tables: requiredSupabaseTables.map((table) => ({
        table,
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY is not configured.",
      })),
    };
  }

  const supabase = createSupabaseAdminClient();
  const tables = await Promise.all(
    requiredSupabaseTables.map(async (table) => {
      const { error } = await supabase
        .from(table)
        .select(requiredSupabaseSchema[table].join(","))
        .limit(1);

      return {
        table,
        ok: !error,
        error: error?.message || null,
      };
    }),
  );
  const failed = tables.filter((table) => !table.ok);
  const fallbackReason = getSupabaseFallbackReason();

  return {
    status:
      failed.length || fallbackReason
        ? ("warn" as CheckStatus)
        : ("ok" as CheckStatus),
    configured: true,
    adminConfigured: true,
    fallbackReason,
    tables,
  };
}

export async function getAppHealth() {
  const [llm, supabase] = await Promise.all([checkLlm(), checkSupabase()]);
  const sqlite = getLocalDatabaseHealth();
  const stripe = getStripeStatus();
  const status: CheckStatus =
    llm.status === "fail"
      ? "fail"
      : supabase.status === "warn" || stripe.status === "warn"
        ? "warn"
        : "ok";

  return {
    status,
    checkedAt: new Date().toISOString(),
    app: {
      status: "ok" as CheckStatus,
      runtime: "nextjs-node",
      uptimeSeconds: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV || "development",
    },
    llm,
    database: {
      sqlite,
      supabase,
    },
    stripe,
  };
}

export async function getPublicAppHealth(): Promise<PublicAppHealth> {
  const health = await getAppHealth();
  const storageStatus: CheckStatus = health.database.sqlite.ok ? "ok" : "fail";
  const status: CheckStatus =
    health.llm.status === "fail" || storageStatus === "fail"
      ? "fail"
      : health.stripe.status === "warn"
        ? "warn"
        : "ok";

  return {
    status,
    checkedAt: health.checkedAt,
    components: {
      app: health.app.status,
      ai: health.llm.status,
      storage: storageStatus,
      billing: health.stripe.status,
    },
  };
}
