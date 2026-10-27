-- Food schedules: use-by alerts (checked every 30 minutes, sent once a day from 08:00 family time) and a nightly tidy.
-- Safe to run again.

do $$
declare j text;
begin
  foreach j in array array['luex-food-alerts', 'luex-food-tidy'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

select cron.schedule('luex-food-alerts', '*/30 * * * *', $job$ select public.queue_food_alerts(); $job$);
select cron.schedule('luex-food-tidy', '41 3 * * *', $job$ select public.food_tidy_alert_sends(); select public.food_tidy_import_log(); $job$);
