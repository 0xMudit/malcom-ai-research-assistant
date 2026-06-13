create table if not exists public.chat_sessions (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  folder text not null default '',
  tags text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id text primary key,
  session_id text not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id text primary key,
  name text not null,
  email text not null,
  rating integer not null check (rating between 1 and 5),
  suggestion text not null,
  user_agent text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.response_feedback (
  id text primary key,
  message_id text not null,
  reaction text not null check (reaction in ('like', 'dislike', 'comment')),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  id text primary key,
  name text not null,
  email text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  user_agent text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sexual_health_facts (
  id integer primary key,
  fact text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.starred_responses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  session_id text not null references public.chat_sessions(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  memory text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mime_type text not null default '',
  size integer not null default 0,
  content text not null,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.user_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  period_started_at timestamptz not null default now(),
  message_count integer not null default 0,
  cooldown_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null default '',
  stripe_subscription_id text not null default '',
  stripe_price_id text not null default '',
  status text not null default 'none',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.chat_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.chat_sessions
  add column if not exists folder text not null default '';

alter table public.chat_sessions
  add column if not exists tags text not null default '';

alter table public.chat_sessions
  add column if not exists pinned boolean not null default false;

create index if not exists chat_sessions_updated_at_idx
  on public.chat_sessions (updated_at desc);

create index if not exists chat_sessions_user_id_updated_at_idx
  on public.chat_sessions (user_id, updated_at desc);

create index if not exists chat_sessions_user_id_pinned_updated_at_idx
  on public.chat_sessions (user_id, pinned desc, updated_at desc);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

create index if not exists response_feedback_created_at_idx
  on public.response_feedback (created_at desc);

create index if not exists access_requests_created_at_idx
  on public.access_requests (created_at desc);

create index if not exists starred_responses_user_id_created_at_idx
  on public.starred_responses (user_id, created_at desc);

create index if not exists documents_user_id_created_at_idx
  on public.documents (user_id, created_at desc);

create index if not exists user_subscriptions_customer_idx
  on public.user_subscriptions (stripe_customer_id);

create index if not exists user_subscriptions_subscription_idx
  on public.user_subscriptions (stripe_subscription_id);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.feedback enable row level security;
alter table public.response_feedback enable row level security;
alter table public.access_requests enable row level security;
alter table public.sexual_health_facts enable row level security;
alter table public.starred_responses enable row level security;
alter table public.user_profiles enable row level security;
alter table public.documents enable row level security;
alter table public.user_usage enable row level security;
alter table public.user_subscriptions enable row level security;
