-- Full crawl + state catalog. Not small; lives in Postgres, not Mongo.
create table if not exists studio_catalog (
  id          text primary key,
  user_id     text not null,
  kind        text not null,
  bytes       integer not null,
  rows        integer not null,
  json        text not null,
  updated_at  timestamptz not null default now()
);
create unique index if not exists studio_catalog_user_kind_idx on studio_catalog (user_id, kind);
