import React, { useState, useRef, useEffect } from "react";
import { Check, X, ChevronsUpDown } from "lucide-react";
import { Command, CommandInput, CommandItem, CommandGroup, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MultiSelect({
  options,
  selectedValues = [],
  onChange,
  placeholder = "Select...",
  className = "",
  id
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  // Map options to an object for faster lookup
  const optionsMap = options.reduce((acc, option) => {
    acc[option.value] = option.label;
    return acc;
  }, {});

  // Filter options based on input value
  const filteredOptions = options.filter((option) => {
    return option.label.toLowerCase().includes(inputValue.toLowerCase());
  });

  // Handle selecting an option
  const handleSelect = (value) => {
    if (selectedValues.includes(value)) {
      // If already selected, remove it
      onChange(selectedValues.filter((item) => item !== value));
    } else {
      // Add it to selected values
      onChange([...selectedValues, value]);
    }
  };

  // Handle removing a selected value
  const handleRemove = (value, e) => {
    e.stopPropagation();
    onChange(selectedValues.filter((item) => item !== value));
  };

  // Clear all selected values
  const handleClearAll = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  // Focus the input when popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-full justify-between ${
            selectedValues.length > 0 ? "h-auto min-h-10" : "h-10"
          } ${className}`}
          id={id}
        >
          <div className="flex flex-wrap gap-1.5">
            {selectedValues.length > 0 ? (
              selectedValues.map((value) => (
                <Badge
                  key={value}
                  variant="secondary"
                  className="rounded-sm px-1 font-normal"
                >
                  {optionsMap[value] || value}
                  <button
                    className="ml-1 rounded-sm"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => handleRemove(value, e)}
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Remove {optionsMap[value]}</span>
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <div className="flex items-center">
            {selectedValues.length > 0 && (
              <button
                className="mr-1 rounded-sm"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={handleClearAll}
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                <span className="sr-only">Clear all</span>
              </button>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[200px] p-0">
        <Command>
          <CommandInput
            ref={inputRef}
            placeholder="Search options..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandGroup>
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <div
                      className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border ${
                        selectedValues.includes(option.value)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-primary opacity-50"
                      }`}
                    >
                      {selectedValues.includes(option.value) && (
                        <Check className="h-3 w-3" />
                      )}
                    </div>
                    {option.label}
                  </CommandItem>
                ))
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No results found.
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}