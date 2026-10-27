-- Bookings and Hosting schedule: the "tomorrow" message (checked every hour, sent once per date). Safe to run again.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'luex-host-reminders') then
    perform cron.unschedule('luex-host-reminders');
  end if;
end $$;

select cron.schedule('luex-host-reminders', '53 * * * *', $job$ select public.queue_host_reminders(); $job$);
