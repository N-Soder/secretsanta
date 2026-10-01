export interface Rule {
  type: 'must' | 'mustNot';
  targetParticipantId: string;
  // Set when the rule was added automatically from a previous year's draw.
  origin?: 'history';
}

export interface Participant {
  id: string;
  name: string;
  hint?: string;
  email?: string;
  rules: Rule[];
}

export type Participants = Record<string, Participant>;

// New type for encrypted data
export interface ReceiverData {
  name: string;
  hint?: string;
  email?: string;
}
