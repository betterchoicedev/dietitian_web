import * as React from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TimePicker = React.forwardRef(({ className, onChange, value, ...props }, ref) => {
  return (
    <div className={cn("relative", className)}>
      <div className="absolute left-2 top-1/2 -translate-y-1/2">
        <Clock className="h-4 w-4 text-gray-400" />
      </div>
      <Input
        ref={ref}
        type="time"
        className="pl-8"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        {...props}
      />
    </div>
  );
});

TimePicker.displayName = "TimePicker";

export { TimePicker };
export default TimePicker;