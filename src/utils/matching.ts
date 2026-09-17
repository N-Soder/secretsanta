// Shared bipartite matching helpers used by generatePairs (fallback when the
// randomised algorithm gives up) and by historyExclusions (feasibility check).

// Fisher-Yates shuffle; returns a new array, does not mutate the input.
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Finds a maximum bipartite matching between givers and receivers using a
 * simple augmenting-path (Kuhn's) algorithm. Fine for the small participant
 * counts (<200) this app deals with.
 *
 * When `randomize` is true, both the giver order and each giver's candidate
 * order are shuffled with Math.random, so repeated calls can yield different
 * (but still maximum) matchings.
 */
export function findMaximumMatching(
  giverIds: string[],
  candidateReceivers: Map<string, Set<string>>,
  randomize = false,
): Map<string, string> {
  const giverForReceiver = new Map<string, string>();

  const tryAugment = (giverId: string, visited: Set<string>): boolean => {
    const candidates = candidateReceivers.get(giverId);
    if (!candidates) return false;

    const orderedCandidates = randomize ? shuffle(Array.from(candidates)) : Array.from(candidates);

    for (const receiverId of orderedCandidates) {
      if (visited.has(receiverId)) continue;
      visited.add(receiverId);

      const currentGiver = giverForReceiver.get(receiverId);
      if (currentGiver === undefined || tryAugment(currentGiver, visited)) {
        giverForReceiver.set(receiverId, giverId);
        return true;
      }
    }

    return false;
  };

  const orderedGivers = randomize ? shuffle(giverIds) : giverIds;
  for (const giverId of orderedGivers) {
    tryAugment(giverId, new Set());
  }

  const giverToReceiver = new Map<string, string>();
  for (const [receiverId, giverId] of giverForReceiver) {
    giverToReceiver.set(giverId, receiverId);
  }
  return giverToReceiver;
}

/**
 * Finds a perfect matching (every giver matched) if one exists, otherwise
 * returns null. When `randomize` is true, the matching found is randomised
 * (see findMaximumMatching).
 */
export function findPerfectMatching(
  giverIds: string[],
  candidateReceivers: Map<string, Set<string>>,
  randomize = false,
): Map<string, string> | null {
  const matching = findMaximumMatching(giverIds, candidateReceivers, randomize);
  if (matching.size !== giverIds.length) {
    return null;
  }
  return matching;
}
