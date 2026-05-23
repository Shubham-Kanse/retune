"use client";

/**
 * OrganizationsCard — Charter 19 Epic 01 multi-tenant scaffolding UI.
 *
 * Drops into `/settings`. Same visual language as the existing
 * settings cards: muted card background, small label + value rows,
 * ghost buttons. NO new components, no new tokens.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Check, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  kind: string;
  role: string;
  member_count: number;
}

interface OrgsResponse {
  orgs: OrgRow[];
  active_id: string | null;
}

export function OrganizationsCard() {
  const [data, setData] = useState<OrgsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/orgs");
      if (res.ok) setData((await res.json()) as OrgsResponse);
    } finally {
      setLoading(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: single-mount fetch is intentional
  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        toast.success("Workspace created.");
        setNewName("");
        await refresh();
      } else {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        toast.error(body.message ?? body.error ?? "Could not create the workspace.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleSwitch(orgId: string) {
    const res = await fetch(`/api/orgs/${orgId}/switch`, { method: "POST" });
    if (res.ok) {
      toast.success("Active workspace switched.");
      await refresh();
    } else {
      toast.error("Could not switch workspace.");
    }
  }

  async function handleInvite(orgId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const res = await fetch(`/api/orgs/${orgId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    if (res.ok) {
      const body = (await res.json()) as { status: string; signup_link?: string };
      if (body.status === "added") {
        toast.success("Member added.");
      } else if (body.signup_link) {
        toast.message("Invitation pending.", {
          description: `Share this link: ${body.signup_link}`,
        });
      }
      setInviteEmail("");
      setInviteFor(null);
      await refresh();
    } else {
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      toast.error(body.message ?? body.error ?? "Invite failed.");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-foreground">
          <Building2 className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Workspaces</p>
          <p className="text-xs text-muted-foreground">
            Share a Retune workspace with your team. The active one scopes the dashboard.
          </p>
        </div>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Loading workspaces…</p>}

      {!loading && data && (
        <div className="space-y-3">
          {data.orgs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              You aren't in any workspaces yet. Create one below to invite teammates.
            </p>
          )}

          {data.orgs.map((o) => (
            <div
              key={o.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{o.name}</p>
                  {data.active_id === o.id && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground">
                      <Check className="h-3 w-3" aria-hidden /> Active
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {o.role} · {o.member_count} member{o.member_count === 1 ? "" : "s"} ·{" "}
                  <span className="font-mono text-[10px]">{o.slug}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {data.active_id !== o.id && (
                  <Button size="sm" variant="ghost" onClick={() => handleSwitch(o.id)}>
                    Switch to
                  </Button>
                )}
                {(o.role === "owner" || o.role === "admin") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setInviteFor(inviteFor === o.id ? null : o.id)}
                  >
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Invite
                  </Button>
                )}
              </div>
              {inviteFor === o.id && (
                <form
                  onSubmit={(e) => handleInvite(o.id, e)}
                  className="mt-2 flex w-full flex-col gap-2 sm:mt-0 sm:basis-full"
                >
                  <Label htmlFor={`invite-${o.id}`} className="text-xs">
                    Invite by email
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id={`invite-${o.id}`}
                      type="email"
                      placeholder="teammate@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1"
                      required
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(e.target.value as "admin" | "member" | "viewer")
                      }
                      aria-label="Invite role"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Button type="submit" size="sm">
                      Send
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ))}

          <form onSubmit={handleCreate} className="mt-4 border-t border-border pt-4">
            <Label htmlFor="new-org-name" className="text-xs">
              Create a new workspace
            </Label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <Input
                id="new-org-name"
                type="text"
                placeholder="Acme Inc"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={80}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                loading={creating}
                disabled={creating || !newName.trim()}
              >
                Create
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
