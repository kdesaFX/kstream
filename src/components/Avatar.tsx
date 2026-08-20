import classNames from "classnames";
import { useRef } from "react";

import { Icon, Icons } from "@/components/Icon";
import { UserIcon } from "@/components/UserIcon";
import { AccountProfile } from "@/pages/parts/auth/AccountCreatePart";
import { useAuthStore } from "@/stores/auth";
import { AVATAR_ACCEPT } from "@/utils/avatarImage";

export interface AvatarProps {
  profile: AccountProfile["profile"];
  sizeClass?: string;
  iconClass?: string;
  bottom?: React.ReactNode;
}

export function Avatar(props: AvatarProps) {
  const photo = props.profile.avatarUrl;
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
        ) : (
          <UserIcon
            className={props.iconClass}
            icon={props.profile.icon as any}
          />
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
