-- Trips and Holidays schedule: the "two days to go" message (checked every hour, sent once per trip). Safe to run again.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'luex-trip-reminders') then
    perform cron.unschedule('luex-trip-reminders');
  end if;
end $$;

select cron.schedule('luex-trip-reminders', '47 * * * *', $job$ select public.queue_trip_reminders(); $job$);
