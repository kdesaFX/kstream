import classNames from "classnames";
import { useRef } from "react";

import { Icon, Icons } from "@/components/Icon";
import { UserIcon, UserIcons } from "@/components/UserIcon";
import { AccountProfile } from "@/pages/parts/auth/AccountCreatePart";
import { useAuthStore } from "@/stores/auth";
import { AVATAR_ACCEPT } from "@/utils/avatarImage";

export interface AvatarProps {
  profile: AccountProfile["profile"];
  /** Used for the letter fallback when there is no uploaded photo. */
  nickname?: string;
  sizeClass?: string;
  iconClass?: string;
  bottom?: React.ReactNode;
}

/** First letter of the nickname (ignore leftover Discord `#0` tags). */
export function avatarLetterFromNickname(nickname?: string): string | null {
  if (!nickname?.trim()) return null;
  const cleaned = nickname.replace(/#\d{1,4}$/, "").trim();
  const match = /[A-Za-z0-9]/.exec(cleaned);
  if (match?.[0]) return match[0].toUpperCase();
  return cleaned[0]?.toUpperCase() ?? null;
}

function isKnownUserIcon(icon: string): icon is UserIcons {
  return Object.values(UserIcons).includes(icon as UserIcons);
}

export function Avatar(props: AvatarProps) {
  const photo = props.profile.avatarUrl;
  const letter = avatarLetterFromNickname(props.nickname);
  const icon = props.profile.icon;

  return (
    <div className="relative inline-block">
      <div
        className={classNames(
          props.sizeClass,
          "rounded-full overflow-hidden flex items-center justify-center text-white",
        )}
        style={
          photo
            ? undefined
            : {
                background: `linear-gradient(to bottom right, ${props.profile.colorA}, ${props.profile.colorB})`,
              }
        }
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : letter ? (
          <span
            aria-hidden
            className={classNames(
              props.iconClass,
              "font-semibold leading-none select-none",
            )}
          >
            {letter}
          </span>
        ) : isKnownUserIcon(icon) ? (
          <UserIcon className={props.iconClass} icon={icon} />
        ) : (
          <Icon className={props.iconClass} icon={Icons.USER} />
        )}
      </div>
      {props.bottom ? (
        <div className="absolute bottom-0 left-1/2 transform translate-y-1/2 -translate-x-1/2">
          {props.bottom}
        </div>
      ) : null}
    </div>
  );
}

export function UserAvatar(props: {
  sizeClass?: string;
  iconClass?: string;
  bottom?: React.ReactNode;
  withName?: boolean;
}) {
  const auth = useAuthStore();

  if (!auth.account || auth.account === null) return null;

  const nickname = auth.account.nickname;

  return (
    <>
      <Avatar
        profile={auth.account.profile}
        nickname={nickname}
        sizeClass={
          props.sizeClass ?? "w-[1.5rem] h-[1.5rem] ssm:w-[2rem] ssm:h-[2rem]"
        }
        iconClass={props.iconClass}
        bottom={props.bottom}
      />
      {props.withName && nickname ? (
        <span>
          {nickname.length >= 20 ? `${nickname.slice(0, 20 - 1)}…` : nickname}
        </span>
      ) : null}
    </>
  );
}

export function NoUserAvatar(props: { iconClass?: string }) {
  return (
    <div className="relative inline-flex items-center justify-center text-white">
      <Icon
        className={props.iconClass ?? "text-base ssm:text-xl"}
        icon={Icons.MENU}
      />
    </div>
  );
}

export function AvatarFileButton({
  onFile,
  disabled,
  children,
  className,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className={className}
        onClick={() => inputRef.current?.click()}
      >
        {children}
      </button>
    </>
  );
}
