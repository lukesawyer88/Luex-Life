-- Home Care schedules: bin and job reminders (checked every hour, each sent once) and a nightly tidy. Safe to run again.

do $$
declare j text;
begin
  foreach j in array array['luex-home-reminders', 'luex-home-tidy'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

select cron.schedule('luex-home-reminders', '41 * * * *', $job$ select public.queue_home_reminders(); $job$);
select cron.schedule('luex-home-tidy', '43 3 * * *', $job$ select public.hc_tidy_sends(); $job$);
