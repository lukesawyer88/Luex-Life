-- Contacts and Emergency schedule: a twice-a-year nudge to check the details (1 April and 1 October). Safe to run again.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'luex-emergency-checkup') then
    perform cron.unschedule('luex-emergency-checkup');
  end if;
end $$;

select cron.schedule('luex-emergency-checkup', '17 10 1 4,10 *', $job$ select public.em_checkup(); $job$);
