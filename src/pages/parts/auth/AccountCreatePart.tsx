export interface AccountProfile {
  device: string;
  profile: {
    colorA: string;
    colorB: string;
    icon: string;
    avatarUrl?: string | null;
  };
}
