import classNames from "classnames";

import { Icon, Icons } from "@/components/Icon";
import { UserIcon } from "@/components/UserIcon";
import { AccountProfile } from "@/pages/parts/auth/AccountCreatePart";
import { useAuthStore } from "@/stores/auth";

export interface AvatarProps {
  profile: AccountProfile["profile"];
  sizeClass?: string;
  iconClass?: string;
  bottom?: React.ReactNode;
}

export function Avatar(props: AvatarProps) {
  return (
    <div className="relative inline-block">
      <div
        className={classNames(
          props.sizeClass,
          "rounded-full overflow-hidden flex items-center justify-center text-white",
        )}
        style={{
          background: `linear-gradient(to bottom right, ${props.profile.colorA}, ${props.profile.colorB})`,
        }}
      >
        <UserIcon
          className={props.iconClass}
          icon={props.profile.icon as any}
        />
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
          {nickname.length >= 20
            ? `${nickname.slice(0, 20 - 1)}…`
            : nickname}
        </span>
      ) : null}
    </>
  );
}

export function NoUserAvatar(props: { iconClass?: string }) {
  return (
    <div className="relative inline-block p-1 text-type-dimmed">
      <Icon
        className={props.iconClass ?? "text-base ssm:text-xl"}
        icon={Icons.MENU}
      />
    </div>
  );
}
