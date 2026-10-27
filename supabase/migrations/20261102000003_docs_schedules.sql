-- Documents and Papers schedules: expiry reminders (checked every hour, each sent once) and a nightly tidy. Safe to run again.

do $$
declare j text;
begin
  foreach j in array array['luex-docs-reminders', 'luex-docs-tidy'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

select cron.schedule('luex-docs-reminders', '23 * * * *', $job$ select public.queue_doc_reminders(); $job$);
select cron.schedule('luex-docs-tidy', '29 3 * * *', $job$ select public.doc_tidy_sends(); $job$);
