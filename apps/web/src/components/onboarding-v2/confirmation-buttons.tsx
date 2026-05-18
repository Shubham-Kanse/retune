"use client";

interface ConfirmationButtonsProps {
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary: () => void;
  disabled?: boolean;
}

export function ConfirmationButtons({
  primaryLabel = "Looks correct",
  secondaryLabel = "Something is wrong",
  onPrimary,
  onSecondary,
  disabled,
}: ConfirmationButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onPrimary}
        disabled={disabled}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={onSecondary}
        disabled={disabled}
        className="rounded-lg bg-stone-700 px-4 py-2 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-600 disabled:opacity-40"
      >
        {secondaryLabel}
      </button>
    </div>
  );
}
