-- Schedules for Luex Life's server functions: push notifications every minute, calendar imports every
-- 10 minutes, and a daily tidy-up.
--
-- BEFORE applying, the cron secret must exist in Vault (never in this file):
--   select vault.create_secret('<long random value>', 'cron_secret');
-- and the same value must be set as the CRON_SECRET secret on both edge functions.
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
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
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
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

-- every night at 03:17 UTC: old sent notifications and reminder records
select cron.schedule(
  'luex-tidy',
  '17 3 * * *',
  $job$
  delete from public.notifications where pushed_at is not null and pushed_at < now() - interval '60 days';
  delete from public.reminder_sends where sent_at < now() - interval '30 days';
  $job$
);
