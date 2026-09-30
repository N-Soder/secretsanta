import { useRef } from 'react';

export type StepTab<T extends string> = {
  id: T;
  label: string;
};

interface StepTabsProps<T extends string> {
  tabs: StepTab<T>[];
  selected: T;
  onSelect: (id: T) => void;
  idPrefix: string;
}

export function StepTabs<T extends string>({ tabs, selected, onSelect, idPrefix }: StepTabsProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (offset === 0) return;

    event.preventDefault();
    const next = (index + offset + tabs.length) % tabs.length;
    onSelect(tabs[next].id);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div role="tablist" className="grid border-b border-line" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map((tab, index) => {
        const isSelected = tab.id === selected;

        return (
          <button
            key={tab.id}
            ref={el => { buttonRefs.current[index] = el; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={isSelected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={e => handleKeyDown(e, index)}
            className={`relative flex items-center justify-center gap-2 px-2 py-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:bg-ivory ${
              isSelected ? 'text-pine' : 'text-muted hover:text-pine'
            }`}
          >
            <span className={`grid place-items-center w-[22px] h-[22px] rounded-full text-xs ${
              isSelected ? 'bg-pine text-ivory' : 'bg-[#EFE9DC]'
            }`}>
              {index + 1}
            </span>
            {tab.label}
            {isSelected && <span className="absolute left-[20%] right-[20%] -bottom-px h-0.5 bg-cranberry" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
