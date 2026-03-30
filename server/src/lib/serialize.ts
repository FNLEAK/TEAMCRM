import type { Lead, User } from "@prisma/client";

export function serializeLead<T extends Lead & { assignee?: User | null }>(lead: T) {
  const { dealValue, assignee, ...rest } = lead;
  return {
    ...rest,
    dealValue: dealValue.toString(),
    assignee: assignee
      ? { id: assignee.id, name: assignee.name, email: assignee.email }
      : null,
  };
}
