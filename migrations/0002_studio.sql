-- Origin studio: validation rules, backlog tasks, per-brand JSON config, page notes.
create table if not exists studio_rules (
  id          text primary key,
  user_id     text not null,
  code        text not null,
  title       text not null,
  layer       text not null,
  domain      text not null,
  product     text not null,
  statement   text not null,
  check_json  text not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists studio_rules_user_id_idx on studio_rules (user_id);

create table if not exists studio_tasks (
  id          text primary key,
  user_id     text not null,
  rule_id     text,
  title       text not null,
  notes       text not null default '',
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);
create index if not exists studio_tasks_user_id_idx on studio_tasks (user_id);

create table if not exists studio_configs (
  id          text primary key,
  user_id     text not null,
  brand       text not null,
  json        text not null,
  updated_at  timestamptz not null default now()
);
create unique index if not exists studio_configs_user_brand_idx on studio_configs (user_id, brand);

create table if not exists studio_notes (
  id          text primary key,
  user_id     text not null,
  page_key    text not null,
  body        text not null default '',
  updated_at  timestamptz not null default now()
);
create unique index if not exists studio_notes_user_page_idx on studio_notes (user_id, page_key);
