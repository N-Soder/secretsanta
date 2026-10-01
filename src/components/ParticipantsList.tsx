import { useState } from 'react';
import { Participant } from '../types';
import { ParticipantRow } from './ParticipantRow';
import { produce } from 'immer';

interface ParticipantsListProps {
  participants: Record<string, Participant>;
  onChangeParticipants: (newParticipants: Record<string, Participant>) => void;
  onOpenRules: (participantName: string) => void;
  autoFocusNew?: boolean;
}

export function ParticipantsList({
  participants,
  onChangeParticipants,
  onOpenRules,
  autoFocusNew = true,
}: ParticipantsListProps) {
  const [nextParticipantId, setNextParticipantId] = useState(() => crypto.randomUUID());

  const updateParticipant = (id: string, name: string) => {
    if (id === nextParticipantId) {
      setNextParticipantId(crypto.randomUUID());
    }
      
    onChangeParticipants(produce(participants, draft => {
      draft[id] ??= {id, name, rules: []};
      draft[id].name = name;
    }));
  };

  const removeParticipant = (id: string) => {
    onChangeParticipants(produce(participants, draft => {
      delete draft[id];

      for (const participant of Object.values(draft)) {
        participant.rules = participant.rules.filter(rule => 
          rule.targetParticipantId !== id
        );
      }
    }));
  };

  const participantsList = [...Object.values(participants), { 
    id: nextParticipantId, 
    name: '', 
    rules: [] 
  }];

  return (
    <div className="space-y-2">
      {participantsList.map((participant, index) => (
        <ParticipantRow
          key={participant.id}
          autoFocusNew={autoFocusNew}
          participant={participant}
          participantIndex={index}
          isLast={index === Object.keys(participants).length}
          onNameChange={(name) => updateParticipant(participant.id, name)}
          onOpenRules={() => onOpenRules(participant.id)}
          onRemove={() => removeParticipant(participant.id)}
        />
      ))}
    </div>
  );
}
