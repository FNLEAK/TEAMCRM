import type { Stage } from "./stages";

export type Lead = {
  id: string;
  workspaceId: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  dealValue: string;
  notes: string | null;
  stage: Stage;
  assigneeId: string | null;
  assignee: { id: string; name: string | null; email: string } | null;
  lastContactedAt: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BoardColumn = {
  stage: Stage;
  total: number;
  page: number;
  perStage: number;
  leads: Lead[];
};
