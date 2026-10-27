-- Family Board schedules: children's journal questions (every 5 minutes), shared places removed after an hour
-- (every 10 minutes), and removed messages' words cleared a day later (nightly). Safe to run again.

do $$
declare j text;
begin
  foreach j in array array['luex-board-prompts', 'luex-board-places', 'luex-board-tidy'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

select cron.schedule('luex-board-prompts', '*/5 * * * *', $job$ select public.queue_journal_prompts(); $job$);
select cron.schedule('luex-board-places', '*/10 * * * *', $job$ select public.board_tidy_places(); $job$);
select cron.schedule('luex-board-tidy', '29 3 * * *', $job$ select public.board_tidy_removed(); select public.board_tidy_sends(); $job$);
