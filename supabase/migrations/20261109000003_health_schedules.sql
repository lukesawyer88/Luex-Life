-- Family Health schedule: medicine and check-up reminders (every 5 minutes; each sent once). Safe to run again.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'luex-health-reminders') then
    perform cron.unschedule('luex-health-reminders');
  end if;
end $$;

select cron.schedule('luex-health-reminders', '*/5 * * * *', $job$ select public.queue_health_reminders(); $job$);
