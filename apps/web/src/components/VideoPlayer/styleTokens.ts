// Shared spacing/sizing tokens for the video player's control chrome
// (top bar, seek bar, bottom controls). Keeps the edge padding, icon
// sizes, and dividers visually identical across all three instead of
// each file hardcoding its own copy that can drift.

/** Horizontal padding from the video edge, used by every control bar. */
export const BAR_EDGE_X = 'px-2 sm:px-4 lg:px-6';

/** Tap-target padding for icon buttons in the control bars. */
export const ICON_BTN_PADDING = 'p-1 sm:p-1.5';

/** Icon size for primary actions (play, fullscreen, lock). */
export const ICON_PRIMARY = 'w-4 h-4 lg:w-5 lg:h-5';

/** Icon size for secondary actions (seek, volume, subtitles, chat). */
export const ICON_SECONDARY = 'w-4 h-4 lg:w-4.5 lg:h-4.5';

/**
 * Active-state accent: a small blue-500 tick, not a filled background.
 * Apply to a `relative` parent; renders a short underline centered below
 * the content. Used by text/icon toggle buttons in the bottom bar.
 */
export const ACTIVE_TICK =
  "after:content-[''] after:absolute after:-bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-3 after:h-[2px] after:bg-blue-500";

/** Uniform horizontal gap used everywhere in the bottom controls bar. */
export const CONTROLS_GAP = 'gap-2 sm:gap-3 lg:gap-4';

/**
 * Fixed width for the "current / total" time readout, sized for the worst
 * case ("99:99:99 / 99:99:99") so it never shifts neighboring buttons.
 */
export const TIME_PAIR_WIDTH = 'w-[19ch]';
