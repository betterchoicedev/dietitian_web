import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash } from 'lucide-react';

export default function MealAlternatives({ alternatives = [], onChange, onAdd, onRemove }) {
  return (
    <div className="space-y-3">
      <Label className="flex items-center justify-between">
        Meal Alternatives
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="text-green-600 hover:text-green-700"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Alternative
        </Button>
      </Label>
      
      {alternatives.map((alt, index) => (
        <div key={index} className="flex gap-2">
          <Input
            value={alt}
            onChange={(e) => onChange(index, e.target.value)}
            placeholder={`Alternative ${index + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(index)}
            className="text-red-500 hover:text-red-700"
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      ))}
      
      {alternatives.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No alternatives added yet. Add alternative meal options that maintain similar macros.
        </p>
      )}
    </div>
  );
}