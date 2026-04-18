import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CalculationInfoPopoverProps {
  title: string;
  children: React.ReactNode;
}

/**
 * Small (i) button shown next to a risk category title.
 * Click to reveal a popover explaining how the score is calculated.
 */
export const CalculationInfoPopover = ({ title, children }: CalculationInfoPopoverProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-full text-muted-foreground hover:text-primary"
          aria-label={`How ${title} is calculated`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-96 max-h-[70vh] overflow-y-auto text-xs leading-relaxed"
      >
        <p className="text-sm font-semibold text-foreground mb-2">
          How {title} is calculated
        </p>
        <div className="space-y-2 text-muted-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
};
