-- Append-only history. Catalog head stays in studio_catalog; every snapshot is a new row here.
create table if not exists studio_history (
  id          text primary key,
  user_id     text not null,
  kind        text not null,
  label       text not null,
  bytes       integer not null default 0,
  rows        integer not null default 0,
  json        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists studio_history_user_created_idx on studio_history (user_id, created_at desc);
