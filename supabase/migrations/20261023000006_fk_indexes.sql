-- index ให้ foreign key ตามคำแนะนำ Supabase Performance Advisor
create index daily_notes_created_by_idx on public.daily_notes (created_by);
create index drive_logs_created_by_idx on public.drive_logs (created_by);
create index import_batches_undone_by_idx on public.import_batches (undone_by);
create index plan_days_updated_by_idx on public.project_plan_days (updated_by);
create index projects_updated_by_idx on public.projects (updated_by);
create index settings_updated_by_idx on public.settings (updated_by);
