import { useQueryClient } from "@tanstack/react-query";
import { Camera, Copy, Loader2, Mail, Plus, UserPlus, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ColourPicker } from "@/components/colour-picker";
import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { friendlyError, useInvites, type Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { squareJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type Role } from "@/modules/registry";

function roleLabel(r: string) {
  return ROLE_LABEL[r as Role] ?? r;
}

/* ------------------------------------------------------------------ edit one person */

function MemberEditor({ member, onDone }: { member: Member; onDone: () => void }) {
  const { me, family, isParent } = useFamilyState();
  const qc = useQueryClient();
  const isMe = member.id === me.id;
  const canEdit = isParent || isMe;
  const [name, setName] = useState(member.display_name);
  const [colour, setColour] = useState(member.colour);
  const [birthday, setBirthday] = useState(member.birthday ?? "");
  const [role, setRole] = useState<string>(member.role);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["members", family.id] });
    await qc.invalidateQueries({ queryKey: ["me"] });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const patch: { display_name: string; colour: string; birthday: string | null; role?: string } = {
        display_name: name.trim(),
        colour,
        birthday: birthday || null,
      };
      if (isParent && role !== member.role) patch.role = role;
      const { error } = await supabase.from("family_members").update(patch).eq("id", member.id);
      if (error) throw error;
      await refresh();
      toast.success("Saved");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please choose a picture");
      const blob = await squareJpeg(file);
      const path = `${family.id}/${member.id}-${Date.now()}.jpg`;
      const up = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { error } = await supabase.from("family_members").update({ avatar_path: path }).eq("id", member.id);
      if (error) throw error;
      if (member.avatar_path) await supabase.storage.from("avatars").remove([member.avatar_path]);
      await refresh();
      toast.success("Picture saved");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function removePerson() {
    if (!window.confirm(`Remove ${member.display_name} from the family?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("family_members").update({ archived_at: new Date().toISOString() }).eq("id", member.id);
      if (error) throw error;
      await refresh();
      toast.success(`${member.display_name} was removed`);
      onDone();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center gap-4">
        <MemberAvatar member={{ display_name: name || member.display_name, colour, avatar_path: member.avatar_path }} size="lg" />
        {canEdit ? (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
            <Button type="button" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Camera className="mr-2 size-4" />
              {member.avatar_path ? "Change picture" : "Add a picture"}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">Only your family can see it.</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pname">Name</Label>
        <Input id="pname" value={name} maxLength={60} required disabled={!canEdit} onChange={(e) => setName(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label>Colour</Label>
        <ColourPicker value={colour} onChange={canEdit ? setColour : () => {}} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bday">Birthday</Label>
        <Input id="bday" type="date" value={birthday} disabled={!canEdit} onChange={(e) => setBirthday(e.target.value)} className="h-11" />
      </div>
      {isParent ? (
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="parent">Parent (can see and change everything)</SelectItem>
              <SelectItem value="member">Adult (grandparent, babysitter, relative)</SelectItem>
              <SelectItem value="child">Child</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{roleLabel(member.role)}</p>
      )}
      {!member.user_id ? <p className="text-xs text-muted-foreground">This profile is managed by a parent and has no login.</p> : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" className="h-11 rounded-full px-6" disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
          {isParent && !isMe ? (
            <Button type="button" variant="ghost" className="h-11 rounded-full text-destructive" onClick={removePerson} disabled={busy}>Remove from family</Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------------ add a profile (no login) */

function AddProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("child");
  const [colour, setColour] = useState<string>("#1d8a4e");
  const [birthday, setBirthday] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase
        .from("family_members")
        .insert({ family_id: family.id, display_name: name.trim(), role, colour, birthday: birthday || null });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["members", family.id] });
      toast.success(`${name.trim()} was added`);
      setName("");
      setBirthday("");
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add someone without a login</DialogTitle>
          <DialogDescription>Good for young children. You manage their profile. You can invite them to log in later.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="an">Name</Label>
            <Input id="an" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Who are they?</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="child">Child</SelectItem>
                <SelectItem value="member">Adult (grandparent, babysitter, relative)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab">Birthday (optional)</Label>
            <Input id="ab" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <ColourPicker value={colour} onChange={setColour} />
          </div>
          <Button type="submit" className="h-11 w-full rounded-full" disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Add"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ invite someone to log in */

function InviteDialog({ open, onOpenChange, profiles }: { open: boolean; onOpenChange: (o: boolean) => void; profiles: Member[] }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("parent");
  const [profile, setProfile] = useState("new");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setName("");
    setRole("parent");
    setProfile("new");
    setLink(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const linked = profiles.find((p) => p.id === profile);
      const { data, error } = await supabase.rpc("create_invite", {
        p_family: family.id,
        p_email: email,
        p_role: linked ? linked.role : role,
        p_name: linked ? linked.display_name : name,
        p_member: linked?.id,
      });
      if (error) throw error;
      setLink(`${window.location.origin}/join?t=${data}`);
      await qc.invalidateQueries({ queryKey: ["invites", family.id] });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite someone to log in</DialogTitle>
          <DialogDescription>They join your family with this email address. The link works once and lasts 7 days.</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-3">
            <p className="text-sm">Luex can't send emails yet, so copy this link and send it to <strong>{email}</strong> yourself (message, WhatsApp, email).</p>
            <div className="glass-tile break-all p-3 text-xs">{link}</div>
            <Button
              className="h-11 w-full rounded-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  toast.success("Link copied");
                } catch {
                  toast.error("Couldn't copy. Select the link and copy it by hand.");
                }
              }}
            >
              <Copy className="mr-2 size-4" />Copy the link
            </Button>
            <p className="text-xs text-muted-foreground">Please don't share it with anyone else. It only works for {email}.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {profiles.length ? (
              <div className="space-y-1.5">
                <Label>Is this for a profile you already added?</Label>
                <Select value={profile} onValueChange={setProfile}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">No, someone new</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {profile === "new" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="in">Their name</Label>
                  <Input id="in" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label>Who are they?</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="parent">Parent (partner)</SelectItem>
                      <SelectItem value="member">Adult (grandparent, babysitter, relative)</SelectItem>
                      <SelectItem value="child">Child</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="ie">Their email address</Label>
              <Input id="ie" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
            </div>
            <Button type="submit" className="h-11 w-full rounded-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Create the invite"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ the page */

export function FamilyPage() {
  const { me, family, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const desktop = useDesktop();
  const [selectedId, setSelectedId] = useState<string>(me.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const invites = useInvites(family.id, isParent);

  const selected = members.find((m) => m.id === selectedId) ?? members.find((m) => m.id === me.id) ?? members[0];
  const noLogin = members.filter((m) => !m.user_id);

  async function cancelInvite(id: string) {
    const { error } = await supabase.rpc("revoke_invite", { p_invite: id });
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["invites", family.id] });
    toast.success("Invite cancelled");
  }

  return (
    <Windows>
      <RecordsWindow>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{family.name} · {members.length} {members.length === 1 ? "person" : "people"}</h2>
          {isParent ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-11 rounded-full"><Plus className="mr-1 size-4" />Add</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setInviting(true)}><Mail className="mr-2 size-4" />Invite someone to log in</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAdding(true)}><UserPlus className="mr-2 size-4" />Add someone without a login</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(m.id);
                  setSheetOpen(true);
                }}
                aria-pressed={selected?.id === m.id}
                className={cn("glass-tile flex min-h-16 w-full items-center gap-3 p-3 text-left", selected?.id === m.id && "outline-2 outline-[var(--status-blue)]")}
              >
                <MemberAvatar member={m} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{m.display_name}{m.id === me.id ? " (you)" : ""}</span>
                  <span className="block text-xs text-muted-foreground">{roleLabel(m.role)}{m.user_id ? "" : " · no login"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {isParent && invites.data?.length ? (
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">Waiting to join</h3>
            <ol className="space-y-2">
              {invites.data.map((i, n) => (
                <li key={i.id} className="glass-tile flex min-h-14 items-center gap-3 p-3">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{n + 1}. {i.display_name} · {roleLabel(i.role)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{i.email} · expires {new Date(i.expires_at).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}</span>
                  </span>
                  <Button size="icon" variant="ghost" className="size-11 rounded-full" aria-label={`Cancel the invite for ${i.display_name}`} onClick={() => void cancelInvite(i.id)}>
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </RecordsWindow>

      {desktop && selected ? (
        <DetailWindow>
          <MemberEditor key={selected.id + (selected.avatar_path ?? "")} member={selected} onDone={() => setSelectedId(me.id)} />
        </DetailWindow>
      ) : null}

      {!desktop && selected ? (
        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selected.display_name}</DialogTitle></DialogHeader>
            <MemberEditor key={selected.id + (selected.avatar_path ?? "")} member={selected} onDone={() => { setSheetOpen(false); setSelectedId(me.id); }} />
          </DialogContent>
        </Dialog>
      ) : null}

      <AddProfileDialog open={adding} onOpenChange={setAdding} />
      <InviteDialog open={inviting} onOpenChange={setInviting} profiles={noLogin} />
    </Windows>
  );
}
