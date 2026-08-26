create table if not exists studio_snapshots (
  id          text primary key,
  user_id     text not null,
  url         text not null,
  html        text not null,
  jsonld      text not null default '[]',
  fetched_at  timestamptz not null default now()
);
create unique index if not exists studio_snapshots_user_url_idx on studio_snapshots (user_id, url);
create index if not exists studio_snapshots_user_idx on studio_snapshots (user_id);
