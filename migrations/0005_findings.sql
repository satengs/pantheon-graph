create table if not exists studio_findings (
  id          text primary key,
  user_id     text not null,
  code        text not null,
  title       text not null,
  lane        text not null,
  url         text not null,
  why         text not null,
  found       text not null,
  suggested   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists studio_findings_user_lane_idx on studio_findings (user_id, lane);

alter table studio_tasks add column if not exists lane text not null default 'issue';
