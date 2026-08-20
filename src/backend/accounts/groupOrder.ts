import {
  fetchGroupOrder,
  upsertGroupOrder,
} from "@/backend/supabase/data";
import { AccountWithToken } from "@/stores/auth";

export interface GroupOrderResponse {
  groupOrder: string[];
}

export function updateGroupOrder(
  _url: string,
  account: AccountWithToken,
  groupOrder: string[],
) {
  return upsertGroupOrder(account.userId, groupOrder).then(() => ({
    groupOrder,
  }));
}

export function getGroupOrder(_url: string, account: AccountWithToken) {
  return fetchGroupOrder(account.userId).catch(() => ({ groupOrder: [] }));
}
