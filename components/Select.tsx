"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  error?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  options: SelectOption[];
  containerClassName?: string;
  value?: string;
  onChange?: any;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  [key: string]: any;
}

export const Select = ({
  label,
  error,
  options,
  className,
  containerClassName,
  searchable = false,
  searchPlaceholder = "Buscar...",
  value,
  onChange,
  name,
  placeholder = "Selecione uma opção",
  disabled,
  required,
  ...props
}: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search on open and reset filter
  useEffect(() => {
    if (isOpen && searchable) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    if (!isOpen) {
      // Optional: reset filter on close
      // setFilter("");
    }
  }, [isOpen, searchable]);

  const handleSelect = (optionValue: string) => {
    if (onChange) {
      // Synthetic event to match typical React ChangeEvent structure used in the app
      onChange({
        target: {
          name: name || "",
          value: optionValue,
        },
      });
    }
    setIsOpen(false);
    setFilter("");
  };

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!filter) return options;
    const term = filter.toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(term));
  }, [options, filter]);

  return (
    <div
      className={cn("relative w-full", containerClassName)}
      ref={containerRef}
    >
      {label && (
        <label className="block text-xs uppercase tracking-wide text-gray-400 mb-2 font-medium">
          {label}
          {required && <span className="text-orange-400 ml-1">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full px-4 py-3 rounded-xl transition-all duration-200 flex items-center justify-between",
          "bg-white/5 backdrop-blur-sm border border-white/10",
          "text-white cursor-pointer relative overflow-hidden",
          "hover:bg-white/[0.07] hover:border-white/20",
          "focus:outline-none", // Remove default outline
          isOpen &&
            "ring-2 ring-orange-500/40 border-orange-500/50 bg-white/[0.08]",
          disabled && "opacity-50 cursor-not-allowed hover:bg-white/5",
          error &&
            "border-red-500/50 focus:ring-red-500/40 focus:border-red-500/50",
          className
        )}
        tabIndex={disabled ? -1 : 0} // Make it focusable
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span
          className={cn(
            "truncate select-none",
            !selectedOption && "text-gray-500"
          )}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={cn(
            "w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ml-2",
            isOpen && "transform rotate-180",
            error && "text-red-400"
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
        
        {/* Subtle gradient background on hover */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-orange-500/0 via-orange-500/0 to-orange-500/0 opacity-0 hover:opacity-5 transition-opacity duration-300 pointer-events-none -z-10" />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#111]/95 backdrop-blur-xl shadow-2xl shadow-black/50 ring-1 ring-white/5 animate-in fade-in zoom-in-95 duration-100 origin-top">
          {searchable && (
            <div className="p-2 border-b border-white/10 sticky top-0 bg-[#111]/95 z-20">
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 focus:outline-none transition-all"
                  onClick={(e) => e.stopPropagation()}
                />
                <svg
                  className="absolute left-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto select-scroll p-1.5">
            {filteredOptions.length > 0 ? (
              <ul role="listbox">
                {filteredOptions.map((option) => (
                  <li
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    role="option"
                    aria-selected={option.value === value}
                    className={cn(
                      "px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors flex items-center justify-between group mb-0.5 last:mb-0",
                      option.value === value
                        ? "bg-orange-500/10 text-orange-400 font-medium"
                        : "text-gray-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <span className="truncate mr-2">{option.label}</span>
                    {option.value === value && (
                      <svg
                        className="w-4 h-4 text-orange-500 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-8 text-sm text-gray-500 text-center flex flex-col items-center justify-center gap-2">
                <svg
                  className="w-8 h-8 text-gray-600 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Nenhum resultado encontrado</span>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-sm text-red-400 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
      <style jsx>{`
        .select-scroll {
          scrollbar-width: none;
        }
        .select-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
      `}</style>
    </div>
  );
};

Select.displayName = "Select";
