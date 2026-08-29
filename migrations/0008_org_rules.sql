-- Rule codes attached to a parent company (system + optional brand rules).
alter table studio_orgs add column if not exists rules_json text not null default '[]';
