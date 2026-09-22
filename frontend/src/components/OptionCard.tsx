'use client';

import { Check } from 'lucide-react';

interface OptionCardProps {
  label: string;
  selected?: boolean;
  onSelect: () => void;
}

export function OptionCard({ label, selected = false, onSelect }: OptionCardProps) {
  return (
    <button className={`option-card${selected ? ' selected' : ''}`} type="button" onClick={onSelect}>
      <span>{label}</span>
      {selected ? <Check size={18} aria-hidden="true" /> : null}
    </button>
  );
}
