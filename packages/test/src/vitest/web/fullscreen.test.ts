import { describe, it, expect } from 'vitest';
import { FULLSCREEN_OFF, fullscreenTransition } from '@roomies/web/src/features/room/fullscreen';

describe('fullscreenTransition', () => {
  it('pushes one history entry when entering either kind', () => {
    const element = fullscreenTransition(FULLSCREEN_OFF, 'elementEntered');
    expect(element).toEqual({ state: { mode: 'element', historyPushed: true }, effects: { pushHistory: true } });
    const pseudo = fullscreenTransition(FULLSCREEN_OFF, 'pseudoEntered');
    expect(pseudo.state.mode).toBe('pseudo');
    expect(pseudo.effects.pushHistory).toBe(true);
  });

  it('exits pseudo fullscreen from the button and pops its history entry', () => {
    const { state } = fullscreenTransition(FULLSCREEN_OFF, 'pseudoEntered');
    expect(fullscreenTransition(state, 'exitRequested')).toEqual({ state: FULLSCREEN_OFF, effects: { popHistory: true } });
  });

  it('exits element fullscreen through the browser, then pops history once it ends', () => {
    const { state } = fullscreenTransition(FULLSCREEN_OFF, 'elementEntered');
    const requested = fullscreenTransition(state, 'exitRequested');
    expect(requested.effects).toEqual({ exitElement: true });
    expect(fullscreenTransition(requested.state, 'elementExited')).toEqual({ state: FULLSCREEN_OFF, effects: { popHistory: true } });
  });

  it('treats Back as exit without popping a second entry', () => {
    const pseudo = fullscreenTransition(FULLSCREEN_OFF, 'pseudoEntered').state;
    expect(fullscreenTransition(pseudo, 'popstate')).toEqual({ state: FULLSCREEN_OFF, effects: {} });

    const element = fullscreenTransition(FULLSCREEN_OFF, 'elementEntered').state;
    const back = fullscreenTransition(element, 'popstate');
    expect(back.effects).toEqual({ exitElement: true });
    expect(fullscreenTransition(back.state, 'elementExited').effects).toEqual({ popHistory: false });
  });

  it('ignores stray exit events', () => {
    expect(fullscreenTransition(FULLSCREEN_OFF, 'elementExited').state).toBe(FULLSCREEN_OFF);
    expect(fullscreenTransition(FULLSCREEN_OFF, 'exitRequested').effects).toEqual({});
  });
});
