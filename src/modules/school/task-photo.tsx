import { useLetterUrls } from "./data";

/** A letter photo, tap to open it full size */
export function TaskPhoto({ path }: { path: string }) {
  const url = useLetterUrls([path]).data?.get(path);
  if (!url) return <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface)]" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img src={url} alt="The letter" className="max-h-80 w-full rounded-2xl object-contain" />
    </a>
  );
}
