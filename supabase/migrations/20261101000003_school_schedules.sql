-- School and Activities schedules: the morning summary (checked every 15 minutes, sent once between 7 and 9.30am family
-- time) and a nightly tidy. Safe to run again.

do $$
declare j text;
begin
  foreach j in array array['luex-school-morning', 'luex-school-tidy'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

select cron.schedule('luex-school-morning', '*/15 * * * *', $job$ select public.queue_school_morning(); $job$);
select cron.schedule('luex-school-tidy', '37 3 * * *', $job$ select public.school_tidy_sends(); $job$);
