import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export default function MenuBasicDetails({ 
  menuData, 
  onUpdate
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu Details</CardTitle>
        <CardDescription>
          Basic information about the menu plan
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Menu Name</Label>
          <Input 
            id="name" 
            required
            value={menuData.programName || ''}
            onChange={(e) => onUpdate({...menuData, programName: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="active_from">Active From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  id="active_from"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {menuData.active_from ? format(new Date(menuData.active_from), "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={menuData.active_from ? new Date(menuData.active_from) : undefined}
                  onSelect={(date) => onUpdate({...menuData, active_from: date.toISOString().split('T')[0]})}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="active_until">Active Until</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  id="active_until"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {menuData.active_until ? format(new Date(menuData.active_until), "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={menuData.active_until ? new Date(menuData.active_until) : undefined}
                  onSelect={(date) => onUpdate({...menuData, active_until: date.toISOString().split('T')[0]})}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="space-y-2">
            <Label>Total Calories</Label>
            <p className="text-xl font-semibold text-green-600">{menuData.dailyTotalCalories || 0} kcal</p>
          </div>
          <div className="space-y-2">
            <Label>Protein</Label>
            <p className="text-xl font-semibold text-green-600">{menuData.macros?.protein || '0g'}</p>
          </div>
          <div className="space-y-2">
            <Label>Carbs</Label>
            <p className="text-xl font-semibold text-green-600">{menuData.macros?.carbs || '0g'}</p>
          </div>
          <div className="space-y-2">
            <Label>Fat</Label>
            <p className="text-xl font-semibold text-green-600">{menuData.macros?.fat || '0g'}</p>
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="notes">Notes & Recommendations</Label>
          <Textarea 
            id="notes" 
            rows={3}
            value={menuData.notes || ''}
            onChange={(e) => onUpdate({...menuData, notes: e.target.value})}
          />
        </div>
      </CardContent>
    </Card>
  );
}