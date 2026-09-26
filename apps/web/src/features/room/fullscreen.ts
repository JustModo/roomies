export type FullscreenMode = 'off' | 'element' | 'pseudo';

export interface FullscreenState {
  mode: FullscreenMode;
  historyPushed: boolean;
}

export type FullscreenEvent = 'elementEntered' | 'elementExited' | 'pseudoEntered' | 'exitRequested' | 'popstate';

export interface FullscreenEffects {
  pushHistory?: boolean;
  popHistory?: boolean;
  exitElement?: boolean;
}

export const FULLSCREEN_OFF: FullscreenState = { mode: 'off', historyPushed: false };

export function fullscreenTransition(state: FullscreenState, event: FullscreenEvent): { state: FullscreenState; effects: FullscreenEffects } {
  switch (event) {
    case 'elementEntered':
      return { state: { mode: 'element', historyPushed: true }, effects: { pushHistory: !state.historyPushed } };
    case 'pseudoEntered':
      return { state: { mode: 'pseudo', historyPushed: true }, effects: { pushHistory: !state.historyPushed } };
    case 'elementExited':
      if (state.mode !== 'element') return { state, effects: {} };
      return { state: FULLSCREEN_OFF, effects: { popHistory: state.historyPushed } };
    case 'exitRequested':
      if (state.mode === 'element') return { state, effects: { exitElement: true } };
      if (state.mode === 'pseudo') return { state: FULLSCREEN_OFF, effects: { popHistory: state.historyPushed } };
      return { state, effects: {} };
    case 'popstate':
      if (state.mode === 'element') return { state: { mode: 'element', historyPushed: false }, effects: { exitElement: true } };
      return { state: FULLSCREEN_OFF, effects: {} };
  }
}
