import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function MenuHeader({ 
  status, 
  onStatusChange, 
  onBack, 
  onDelete 
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Edit Menu Plan</h1>
      </div>
      <div className="flex items-center gap-3">
        <Select
          value={status}
          onValueChange={onStatusChange}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="active">Active</SelectItem>
          </SelectContent>
        </Select>
        <Button 
          variant="destructive"
          onClick={onDelete}
        >
          <Trash className="h-4 w-4 mr-2" />
          Delete Menu
        </Button>
      </div>
    </div>
  );
}