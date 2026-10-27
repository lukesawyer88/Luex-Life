-- Household Money schedules: reminders, direct debits and the Monday summary (checked every 30 minutes, each sent
-- once, from 08:00 family time) and a nightly tidy. Safe to run again.

do $$
declare j text;
begin
  foreach j in array array['luex-money-alerts', 'luex-money-tidy'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

select cron.schedule('luex-money-alerts', '*/30 * * * *', $job$ select public.queue_money_alerts(); $job$);
select cron.schedule('luex-money-tidy', '53 3 * * *', $job$ select public.money_tidy_sends(); select public.money_tidy_summaries(); $job$);
