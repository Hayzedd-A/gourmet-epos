"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StaffFormModal } from "@/components/admin/StaffFormModal";
import { Button } from "@/components/ui/Button";
import { getApi } from "@/lib/ipc/client";
import { useSession } from "@/lib/session";
import { canManageStaff } from "@/shared/permissions";
import type { StaffInput, StaffMember } from "@/shared/types/domain";

export default function StaffPage() {
  const router = useRouter();
  const { session } = useSession();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [editing, setEditing] = useState<StaffMember | null | "new">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && !canManageStaff(session.accessRole)) {
      router.replace("/pos");
    }
  }, [session, router]);

  async function load() {
    setStaff(await getApi().staff.list());
  }

  useEffect(() => {
    let cancelled = false;
    getApi()
      .staff.list()
      .then((list) => {
        if (!cancelled) setStaff(list);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(input: Partial<StaffInput>) {
    if (editing === "new") {
      await getApi().staff.create(input as StaffInput);
    } else if (editing) {
      await getApi().staff.update(editing.id, input);
    }
    setEditing(null);
    await load();
  }

  async function handleDelete(member: StaffMember) {
    setError(null);
    try {
      await getApi().staff.delete(member.id);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  if (!session || !canManageStaff(session.accessRole)) {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">Staff</h1>
            <p className="text-sm text-muted">
              Local PIN accounts for this terminal. Super admins (like you) always log in with Zupa credentials
              instead.
            </p>
          </div>
          <Button onClick={() => setEditing("new")}>New staff</Button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-3 font-medium text-ink">{member.name}</td>
                  <td className="px-4 py-3 capitalize text-muted">{member.accessRole.replace("_", " ")}</td>
                  <td className="flex justify-end gap-3 px-4 py-3">
                    {member.accessRole === "super_admin" ? (
                      <span className="text-xs text-muted">Managed via Zupa login</span>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditing(member)}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(member)}
                          className="text-sm font-medium text-danger hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted">
                    No staff yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <StaffFormModal
          open={editing !== null}
          staffMember={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
