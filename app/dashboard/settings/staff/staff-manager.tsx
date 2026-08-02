"use client";

import { useState, useTransition } from "react";
import { inkPillStyles } from "@/app/_components/button-variants";

/** Secondary pill for the invite/role row actions. */
const outlinePill =
  "rounded-pill border border-line px-3 py-1.5 text-sm font-semibold text-ink " +
  "transition hover:bg-sand disabled:opacity-60";

import {
  assignableRoles,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  type RoleKey,
} from "@/lib/authz";

import {
  inviteStaffAction,
  removeMemberAction,
  revokeInvitationAction,
  setMemberRoleAction,
} from "./actions";

type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  roles: RoleKey[];
  isSelf: boolean;
};

type Invitation = {
  id: string;
  email: string;
  role: RoleKey;
  expiresAt: string;
};

/**
 * Staff & roles UI (M5 / audit F4). The role select only offers what the
 * signed-in actor may actually grant — the server enforces the same rule, so
 * this is a courtesy rather than the control.
 *
 * After inviting, the invite URL is shown for direct sharing: email delivery
 * is best-effort (and a no-op when the mailer is unconfigured), so an owner
 * is never stuck waiting on an email they cannot see.
 */
export function StaffManager({
  members,
  invitations,
  actorRoles,
}: {
  members: Member[];
  invitations: Invitation[];
  actorRoles: RoleKey[];
}) {
  const grantable = assignableRoles(actorRoles);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: (formData: FormData) => Promise<{ error?: string; inviteUrl?: string }>,
    formData: FormData,
    { reset }: { reset?: HTMLFormElement | null } = {},
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.inviteUrl) setInviteUrl(result.inviteUrl);
      reset?.reset();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {/* Invite */}
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-bold text-ink">
          Invite someone
        </h2>
        <p className="mt-1 text-sm text-muted">
          They&rsquo;ll get a link that expires in 7 days and works once, for
          this email address only.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          action={(formData) => {
            run(inviteStaffAction, formData);
          }}
        >
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="invite-email" className="text-sm font-semibold text-ink">
              Email
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="chef@example.com"
              className="rounded-control border border-line px-3 py-2 text-base text-ink"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="invite-role" className="text-sm font-semibold text-ink">
              Role
            </label>
            <select
              id="invite-role"
              name="role"
              defaultValue={grantable.includes("staff") ? "staff" : grantable[0]}
              className="rounded-control border border-line px-3 py-2 text-base text-ink"
            >
              {grantable.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className={inkPillStyles}
          >
            {pending ? "Sending…" : "Send invite"}
          </button>
        </form>

        {inviteUrl ? (
          <div className="mt-4 rounded-control border border-line bg-sand p-3">
            <p className="text-sm font-semibold text-ink">Invite link</p>
            <p className="mt-1 break-all font-mono text-xs text-muted">
              {inviteUrl}
            </p>
            <p className="mt-2 text-xs text-muted">
              We emailed this too, if email is configured. Share it directly if
              they don&rsquo;t receive it.
            </p>
          </div>
        ) : null}

        <dl className="mt-5 grid gap-2 border-t border-line pt-4 text-sm">
          {grantable.map((role) => (
            <div key={role} className="flex gap-2">
              <dt className="font-semibold text-ink">{ROLE_LABEL[role]}</dt>
              <dd className="text-muted">{ROLE_DESCRIPTION[role]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Pending invitations */}
      {invitations.length > 0 ? (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-bold text-ink">
            Pending invitations
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">
                    {invitation.email}
                  </p>
                  <p className="text-sm text-muted">
                    {ROLE_LABEL[invitation.role]} · expires{" "}
                    {new Date(invitation.expiresAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                <form
                  action={(formData) => {
                    run(revokeInvitationAction, formData);
                  }}
                >
                  <input
                    type="hidden"
                    name="invitationId"
                    value={invitation.id}
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className={outlinePill}
                  >
                    Withdraw
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Members */}
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-bold text-ink">Team</h2>
        <ul className="mt-3 divide-y divide-line">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">
                  {member.name ?? member.email ?? "Team member"}
                  {member.isSelf ? (
                    <span className="ml-2 text-sm font-normal text-muted">
                      (you)
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-muted">
                  {member.email} · {member.roles.map((r) => ROLE_LABEL[r]).join(", ")}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <form
                  action={(formData) => {
                    run(setMemberRoleAction, formData);
                  }}
                >
                  <input type="hidden" name="userId" value={member.userId} />
                  <label className="sr-only" htmlFor={`role-${member.userId}`}>
                    Role for {member.email}
                  </label>
                  <select
                    id={`role-${member.userId}`}
                    name="role"
                    defaultValue={member.roles[0]}
                    disabled={pending || grantable.length === 0}
                    className="rounded-control border border-line px-3 py-1.5 text-sm text-ink"
                  >
                    {grantable.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={pending}
                    className="ml-2 rounded-pill border border-line px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-sand disabled:opacity-60"
                  >
                    Update
                  </button>
                </form>

                {member.isSelf ? null : (
                  <form
                    action={(formData) => {
                      run(removeMemberAction, formData);
                    }}
                  >
                    <input type="hidden" name="userId" value={member.userId} />
                    <button
                      type="submit"
                      disabled={pending}
                      className={outlinePill}
                    >
                      Remove
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
