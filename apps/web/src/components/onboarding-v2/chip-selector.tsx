"use client";

import { useState } from "react";

interface ChipSelectorProps {
  chips: Array<{ label: string; value: string }>;
  multiSelect: boolean;
  onSelect: (value: string | string[]) => void;
}

export function ChipSelector({ chips, multiSelect, onSelect }: ChipSelectorProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (value: string) => {
    if (multiSelect) {
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      setSelected(next);
    } else {
      onSelect(value);
    }
  };

  const confirm = () => {
    if (selected.length > 0) onSelect(selected);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role={multiSelect ? "group" : "radiogroup"}>
        {chips.map((chip) => (
          <button
            type="button"
            key={chip.value}
            onClick={() => toggle(chip.value)}
            role={multiSelect ? "checkbox" : "radio"}
            aria-checked={selected.includes(chip.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${selected.includes(chip.value) ? "bg-indigo-600 text-white" : "bg-stone-700 text-stone-300 hover:bg-stone-600"}`}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {multiSelect && selected.length > 0 && (
        <button
          type="button"
          onClick={confirm}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Continue
        </button>
      )}
    </div>
  );
}
