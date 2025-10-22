import { Info } from "lucide-react";
import { useId } from "react";
import type { ComponentProps, CSSProperties } from "react";

interface InfoTooltipProps {
  text: string;
  ariaLabel: string;
  iconProps?: ComponentProps<typeof Info>;
  offsetX?: number;
}

export function InfoTooltip({
  text,
  ariaLabel,
  iconProps,
  offsetX,
}: InfoTooltipProps): JSX.Element {
  const tooltipId = useId();
  const tooltipStyle: (CSSProperties & { "--tooltip-offset-x"?: string }) | undefined =
    offsetX !== undefined ? { "--tooltip-offset-x": `${offsetX}px` } : undefined;
  return (
    <span className="info-tooltip" style={tooltipStyle}>
      <span
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        aria-describedby={tooltipId}
        className="info-tooltip__trigger"
      >
        <Info size={16} strokeWidth={2} aria-hidden="true" {...iconProps} />
      </span>
      <span role="tooltip" id={tooltipId} className="info-tooltip__bubble">
        {text}
      </span>
    </span>
  );
}
