import type { RevealView } from '../api/types';
interface RevealState { view: RevealView | null; draft: string; baseline: string; status: string; }
type Action = { type: 'received'; view: RevealView } | { type: 'edited'; text: string }
  | { type: 'saving' } | { type: 'saved'; submitted: string; saved: string } | { type: 'failed' };
export const initialRevealState: RevealState = { view: null, draft: '', baseline: '', status: '' };
export function revealReducer(state: RevealState, action: Action): RevealState {
  switch (action.type) {
    case 'received': {
      const dirty = state.draft !== state.baseline;
      return { ...state, view: action.view, baseline: action.view.ownWishlist,
        draft: dirty ? state.draft : action.view.ownWishlist, status: dirty ? state.status : '' };
    }
    case 'edited': return { ...state, draft: action.text, status: 'Unsaved changes' };
    case 'saving': return { ...state, status: 'Saving…' };
    case 'saved': {
      const unchanged = state.draft === action.submitted;
      return { ...state, baseline: action.saved, draft: unchanged ? action.saved : state.draft,
        status: unchanged ? 'Saved' : 'Unsaved changes' };
    }
    case 'failed': return { ...state, status: 'Couldn’t save your wishlist. Try again.' };
  }
}
