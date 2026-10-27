-- Schedules for tidying Documents files. Safe to run again.
--   luex-docs-tidy (03:29): old reminder records, removed papers, and departed grown-ups' own papers
--   luex-file-tidy (04:11): the "file-tidy" server function deletes pages that belong to no paper

do $$
declare j text;
begin
  foreach j in array array['luex-docs-tidy', 'luex-file-tidy'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

select cron.schedule('luex-docs-tidy', '29 3 * * *',
  $job$ select public.doc_tidy_sends(); select public.doc_tidy_removed(); select public.doc_tidy_departed(); $job$);

select cron.schedule(
  'luex-file-tidy',
  '11 4 * * *',
  $job$
  select net.http_post(
    url := 'https://pjttemdnnnnlfijvoeip.supabase.co/functions/v1/file-tidy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from luex_private.settings where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
