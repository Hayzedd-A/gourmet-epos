"use client";

import { useState } from "react";
import { Button } from "./ui/Button";

const MAX_PIN_LENGTH = 6;
const MIN_PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

interface PinPadProps {
  onSubmit: (pin: string) => Promise<void>;
}

export function PinPad({ onSubmit }: PinPadProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function press(key: string) {
    if (submitting) return;
    setError(null);
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "") return;
    setPin((p) => (p.length < MAX_PIN_LENGTH ? p + key : p));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(pin);
    } catch (cause) {
      setError((cause as Error).message || "Incorrect PIN");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6">
      <div className="flex h-3 gap-3" aria-live="polite">
        {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border border-border transition-colors ${
              i < pin.length ? "bg-primary border-primary" : "bg-transparent"
            }`}
          />
        ))}
      </div>

      <p className="h-5 text-sm text-danger" role="alert">
        {error}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, i) =>
          key === "" ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              disabled={submitting}
              className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-medium text-ink transition-colors hover:bg-surface active:bg-surface-hover disabled:opacity-50"
              aria-label={key === "back" ? "Backspace" : key}
            >
              {key === "back" ? "⌫" : key}
            </button>
          ),
        )}
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={pin.length < MIN_PIN_LENGTH}
        loading={submitting}
        onClick={submit}
      >
        Log in
      </Button>
    </div>
  );
}
