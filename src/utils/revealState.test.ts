import { describe, expect, it } from 'vitest';
import { revealReducer, initialRevealState } from './revealState';
import type { RevealView } from '../api/types';
const view: RevealView = { giverName: 'Ann', receiver: { name: 'Bob', hint: '', wishlist: 'Tea' }, ownWishlist: 'Books', message: '', budgetAmount: null, budgetCurrency: 'AUD', eventDate: null, expiresAt: '2027-01-01' };
describe('reveal draft', () => {
  it('refreshes the match while preserving unsaved wishlist text', () => {
    let state = revealReducer(initialRevealState, { type: 'received', view });
    state = revealReducer(state, { type: 'edited', text: 'My unsaved draft' });
    state = revealReducer(state, { type: 'received', view: { ...view, ownWishlist: 'Remote edit', receiver: { ...view.receiver, name: 'Cat' } } });
    expect(state.draft).toBe('My unsaved draft');
    expect(state.view?.receiver.name).toBe('Cat');
  });
  it('retains edits made during a save and marks them unsaved', () => {
    let state = revealReducer(initialRevealState, { type: 'received', view });
    state = revealReducer(state, { type: 'edited', text: 'Tea' });
    state = revealReducer(state, { type: 'saving' });
    state = revealReducer(state, { type: 'edited', text: 'Coffee' });
    state = revealReducer(state, { type: 'saved', submitted: 'Tea', saved: 'Tea' });
    expect(state.draft).toBe('Coffee');
    expect(state.status).toBe('Unsaved changes');
    expect(state.baseline).toBe('Tea');
  });
  it('retains failed text for explicit retry', () => {
    let state = revealReducer(initialRevealState, { type: 'received', view });
    state = revealReducer(state, { type: 'edited', text: 'Coffee' });
    state = revealReducer(state, { type: 'failed' });
    expect(state.draft).toBe('Coffee');
    expect(state.status).toContain('Try again');
  });
  it('refreshes a clean wishlist with the server value', () => {
    let state = revealReducer(initialRevealState, { type: 'received', view });
    state = revealReducer(state, { type: 'received', view: { ...view, ownWishlist: 'New wishlist' } });
    expect(state.draft).toBe('New wishlist');
  });
});
