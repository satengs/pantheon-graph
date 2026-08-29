-- Parent companies and sub-brands. Seed wraps FDR + Achieve under Pantheon.
create table if not exists studio_orgs (
  id               text primary key,
  user_id          text not null,
  slug             text not null,
  name             text not null,
  kind             text not null,
  parent_id        text,
  website          text not null default '',
  host             text not null default '',
  products_json    text not null default '[]',
  probe_json       text not null default '{}',
  include_in_graph integer not null default 1,
  created_at       timestamptz not null default now()
);
create unique index if not exists studio_orgs_user_slug_idx on studio_orgs (user_id, slug);
create index if not exists studio_orgs_user_parent_idx on studio_orgs (user_id, parent_id);
