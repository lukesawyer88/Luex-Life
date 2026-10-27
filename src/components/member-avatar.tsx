import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAvatarUrl, type Member } from "@/lib/family";
import { cn } from "@/lib/utils";

const SIZES = { sm: "size-8 text-xs", md: "size-11 text-sm", lg: "size-20 text-2xl" } as const;

export function MemberAvatar({
  member,
  size = "md",
  className,
}: {
  member: Pick<Member, "display_name" | "colour" | "avatar_path">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { data: url } = useAvatarUrl(member.avatar_path);
  const initial = member.display_name.trim().charAt(0).toUpperCase() || "?";
  return (
    <Avatar className={cn(SIZES[size], "ring-2 ring-offset-2 ring-offset-[var(--surface)]", className)} style={{ ["--tw-ring-color" as string]: member.colour }}>
      {url ? <AvatarImage src={url} alt={member.display_name} className="object-cover" /> : null}
      <AvatarFallback className="font-semibold text-white" style={{ background: member.colour }}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
