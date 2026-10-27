-- Rewards and Pocket Money schedules: pay day, interest and matching, the weekly bonus and streak nudges (checked every
-- 30 minutes, each once), and a nightly tidy. Safe to run again.

do $$
declare j text;
begin
  foreach j in array array['luex-rewards', 'luex-rewards-tidy'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

select cron.schedule('luex-rewards', '*/30 * * * *', $job$ select public.queue_reward_jobs(); $job$);
select cron.schedule('luex-rewards-tidy', '47 3 * * *', $job$ select public.reward_tidy_sends(); $job$);
