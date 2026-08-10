import { Icon, Icons } from "@/components/Icon";

export interface IconPatchProps {
  active?: boolean;
  onClick?: () => void;
  clickable?: boolean;
  className?: string;
  icon: Icons;
  transparent?: boolean;
  downsized?: boolean;
  large?: boolean;
  navigation?: boolean;
}

export function IconPatch(props: IconPatchProps) {
  const clickableClasses = props.clickable
    ? "cursor-pointer hover:scale-110 hover:bg-pill-backgroundHover hover:text-white active:scale-125"
    : "";
  const transparentClasses = props.transparent
    ? "bg-opacity-0 hover:bg-opacity-50"
    : "";
  const navigationClasses = props.navigation
    ? "bg-opacity-50 hover:bg-opacity-100"
    : "";
  const activeClasses = props.active
    ? "bg-pill-backgroundHover text-white"
    : "";
  const sizeClasses = props.large
    ? "h-16 w-16 text-2xl"
    : props.downsized
      ? "h-10 w-10"
      : "h-12 w-12";
  // Font Awesome bell hangs a bit low optically — nudge it up in the circle.
  const iconNudge =
    props.icon === Icons.BELL ? "relative -translate-y-px" : "";

  return (
    <div className={props.className || undefined} onClick={props.onClick}>
      <div
        className={`flex items-center justify-center rounded-full border-2 border-transparent bg-pill-background bg-opacity-100 transition-[background-color,color,transform,border-color] duration-75 ${transparentClasses} ${navigationClasses} ${clickableClasses} ${activeClasses} ${sizeClasses}`}
      >
        <Icon
          icon={props.icon}
          className={`inline-flex h-[1em] w-[1em] items-center justify-center leading-none [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:shrink-0 ${iconNudge}`}
        />
      </div>
    </div>
  );
}
