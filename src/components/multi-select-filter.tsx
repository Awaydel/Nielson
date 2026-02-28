'use client'

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

interface MultiSelectProps {
  options: (string | number)[];
  selected: (string | number)[];
  onChange: (selected: (string | number)[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder = 'Выберите...',
  label,
  disabled = false,
  icon,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (value: string | number) => {
    const stringValue = String(value);
    const isSelected = selected.some(s => String(s) === stringValue);
    
    if (isSelected) {
      onChange(selected.filter(s => String(s) !== stringValue));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  const displayValue = selected.length === 0 
    ? placeholder 
    : selected.length === options.length 
      ? `Все (${selected.length})`
      : selected.length === 1 
        ? String(selected[0]) 
        : `Выбрано: ${selected.length}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "justify-between bg-white min-w-[140px]",
            selected.length > 0 && "border-emerald-300 bg-emerald-50/50"
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {icon}
            <span className="truncate">{displayValue}</span>
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Поиск..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Не найдено</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={handleSelectAll}
                className="cursor-pointer font-medium border-b mb-1"
              >
                <div className={cn(
                  "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                  selected.length === options.length 
                    ? "bg-emerald-600 border-emerald-600 text-white" 
                    : "border-gray-300"
                )}>
                  {selected.length === options.length && <Check className="h-3 w-3" />}
                </div>
                <span>Выбрать все</span>
              </CommandItem>
              {options.map((option) => {
                const stringValue = String(option);
                const isSelected = selected.some(s => String(s) === stringValue);
                return (
                  <CommandItem
                    key={stringValue}
                    value={stringValue}
                    onSelect={() => handleSelect(option)}
                    className="cursor-pointer"
                  >
                    <div className={cn(
                      "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                      isSelected 
                        ? "bg-emerald-600 border-emerald-600 text-white" 
                        : "border-gray-300"
                    )}>
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className="truncate">{option}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
