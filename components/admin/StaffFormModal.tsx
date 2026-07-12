"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import type { AssignableAccessRole, StaffInput, StaffMember } from "../../shared/types/domain";

interface StaffFormModalProps {
  open: boolean;
  staffMember: StaffMember | null;
  onClose: () => void;
  onSubmit: (input: Partial<StaffInput>) => Promise<void>;
}

export function StaffFormModal({ open, staffMember, onClose, onSubmit }: StaffFormModalProps) {
  if (!open) return null;
  return <StaffFormDialog staffMember={staffMember} onClose={onClose} onSubmit={onSubmit} />;
}

function StaffFormDialog({ staffMember, onClose, onSubmit }: Omit<StaffFormModalProps, "open">) {
  const [name, setName] = useState(staffMember?.name ?? "");
  const [pin, setPin] = useState("");
  const [accessRole, setAccessRole] = useState<AssignableAccessRole>(
    staffMember?.accessRole === "admin" ? "admin" : "staff",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const input: Partial<StaffInput> = { name, accessRole };
      if (pin) input.pin = pin;
      await onSubmit(input);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={(node) => node?.showModal()}
      onClose={onClose}
      className="w-full max-w-sm rounded-[var(--radius-panel)] border border-border bg-bg p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">{staffMember ? "Edit staff" : "New staff"}</h2>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Name</span>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">{staffMember ? "New PIN (leave blank to keep current)" : "PIN"}</span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="font-figures h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Role</span>
          <select
            value={accessRole}
            onChange={(e) => setAccessRole(e.target.value as AssignableAccessRole)}
            className="h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={submit}
            loading={submitting}
            disabled={!name || (!staffMember && pin.length < 4)}
          >
            Save
          </Button>
        </div>
      </div>
    </dialog>
  );
}
