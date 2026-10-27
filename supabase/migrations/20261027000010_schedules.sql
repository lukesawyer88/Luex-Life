-- Schedules for Luex Life's server functions: push notifications every minute, calendar imports every
-- 10 minutes, and a daily tidy-up.
--
-- The schedule's secret is made by migration 20261027000009 and never leaves the database.
-- Safe to run again: each job is removed and re-created.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

do $$
declare j text;
begin
  foreach j in array array['luex-push', 'luex-import', 'luex-tidy'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

select cron.schedule(
  'luex-push',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://pjttemdnnnnlfijvoeip.supabase.co/functions/v1/push-sender',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from luex_private.settings where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

select cron.schedule(
  'luex-import',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := 'https://pjttemdnnnnlfijvoeip.supabase.co/functions/v1/import-feeds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from luex_private.settings where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

-- every night at 03:17 UTC: old sent notifications and reminder records
create or replace function public.tidy_old_notifications()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications where pushed_at < now() - interval '60 days';
end $$;
create or replace function public.tidy_old_reminder_sends()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.reminder_sends where sent_at < now() - interval '30 days';
end $$;
revoke all on function public.tidy_old_notifications(), public.tidy_old_reminder_sends() from public, anon, authenticated;
select cron.schedule('luex-tidy', '17 3 * * *', $job$ select public.tidy_old_notifications(); select public.tidy_old_reminder_sends(); $job$);
