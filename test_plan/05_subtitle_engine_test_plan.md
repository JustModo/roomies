# Test Plan: Custom Subtitle Engine & Tag Parser

## Module Overview
This module covers custom subtitle override tag parsing (ASS/SSA), tokenization of numpad alignments (`\an1`–`\an9`), ASS BGR hex color conversion (`\c&HBBGGRR&` -> `#RRGGBB`), coordinate positioning (`\pos(x,y)`), inline styling (`\b1`, `\i1`, `\u1`, `\s1`), line breaks (`\N`, `\h`), legacy SSA alignments (`\a1`–`\a11`), WebVTT/SRT HTML tag parsing (`<b>`, `<i>`, `<font color="...">`), drawing/effect tag stripping, 9-region flexbox grid alignment mapping, and overlay rendering math.

**Total Test Cases**: 30 (TC-SUB-001 to TC-SUB-030)

---

## Detailed Test Case Specifications

### Category 1: Numpad Alignment Parsing (`\an1` to `\an9`) (TC-SUB-001 to TC-SUB-009)

#### TC-SUB-001: Numpad Alignment `\an1` (Bottom-Left)
- **Objective**: Verify `\an1` tag maps to bottom-left 9-region grid overlay.
- **Input**: Dialogue string `{\an1}Bottom Left Text`.
- **Expected Outcome**: Parsed alignment = `1`, flexbox overlay grid position = `bottom-left`.

#### TC-SUB-002: Numpad Alignment `\an2` (Bottom-Center)
- **Objective**: Verify `\an2` tag maps to bottom-center (standard subtitle default).
- **Input**: Dialogue string `{\an2}Bottom Center Text`.
- **Expected Outcome**: Parsed alignment = `2`, grid position = `bottom-center`.

#### TC-SUB-003: Numpad Alignment `\an3` (Bottom-Right)
- **Objective**: Verify `\an3` tag maps to bottom-right grid position.
- **Input**: Dialogue string `{\an3}Bottom Right Text`.
- **Expected Outcome**: Parsed alignment = `3`, grid position = `bottom-right`.

#### TC-SUB-004: Numpad Alignment `\an4` (Middle-Left)
- **Objective**: Verify `\an4` tag maps to middle-left grid position.
- **Input**: Dialogue string `{\an4}Middle Left Text`.
- **Expected Outcome**: Parsed alignment = `4`, grid position = `middle-left`.

#### TC-SUB-005: Numpad Alignment `\an5` (Middle-Center)
- **Objective**: Verify `\an5` tag maps to middle-center grid position.
- **Input**: Dialogue string `{\an5}Middle Center Text`.
- **Expected Outcome**: Parsed alignment = `5`, grid position = `middle-center`.

#### TC-SUB-006: Numpad Alignment `\an6` (Middle-Right)
- **Objective**: Verify `\an6` tag maps to middle-right grid position.
- **Input**: Dialogue string `{\an6}Middle Right Text`.
- **Expected Outcome**: Parsed alignment = `6`, grid position = `middle-right`.

#### TC-SUB-007: Numpad Alignment `\an7` (Top-Left)
- **Objective**: Verify `\an7` tag maps to top-left grid position.
- **Input**: Dialogue string `{\an7}Top Left Text`.
- **Expected Outcome**: Parsed alignment = `7`, grid position = `top-left`.

#### TC-SUB-008: Numpad Alignment `\an8` (Top-Center)
- **Objective**: Verify `\an8` tag maps to top-center grid position.
- **Input**: Dialogue string `{\an8}Top Center Text`.
- **Expected Outcome**: Parsed alignment = `8`, grid position = `top-center`.

#### TC-SUB-009: Numpad Alignment `\an9` (Top-Right)
- **Objective**: Verify `\an9` tag maps to top-right grid position.
- **Input**: Dialogue string `{\an9}Top Right Text`.
- **Expected Outcome**: Parsed alignment = `9`, grid position = `top-right`.

---

### Category 2: Legacy SSA Alignment Compatibility (`\a1` to `\a11`) (TC-SUB-010 to TC-SUB-013)

#### TC-SUB-010: Legacy SSA Alignment `\a1` to `\a3` Mapping
- **Objective**: Verify legacy SSA bottom alignments `\a1`, `\a2`, `\a3` convert to `\an1`, `\an2`, `\an3`.
- **Input**: `{\a1}Legacy Bottom Left`.
- **Expected Outcome**: Converted to alignment `1`.

#### TC-SUB-011: Legacy SSA Alignment `\a5` to `\a7` Mapping (Top Alignments)
- **Objective**: Verify legacy SSA top alignments `\a5`, `\a6`, `\a7` convert to `\an7`, `\an8`, `\an9`.
- **Input**: `{\a6}Legacy Top Center`.
- **Expected Outcome**: Converted to alignment `8`.

#### TC-SUB-012: Legacy SSA Alignment `\a9` to `\a11` Mapping (Middle Alignments)
- **Objective**: Verify legacy SSA middle alignments `\a9`, `\a10`, `\a11` convert to `\an4`, `\an5`, `\an6`.
- **Input**: `{\a10}Legacy Middle Center`.
- **Expected Outcome**: Converted to alignment `5`.

#### TC-SUB-013: Fallback Alignment for Unrecognized Alignment Codes
- **Objective**: Verify invalid alignment tags (e.g. `{\an99}`) fall back safely to `\an2` (bottom-center).
- **Input**: `{\an99}Invalid Tag`.
- **Expected Outcome**: Alignment = `2`.

---

### Category 3: BGR Color Conversion & Styling Tags (TC-SUB-014 to TC-SUB-020)

#### TC-SUB-014: Primary ASS BGR Hex Color Conversion (`\c&HBBGGRR&`)
- **Objective**: Verify ASS BGR hex color `\c&HFF0000&` (Blue in BGR) converts to standard CSS RGB `#0000FF`.
- **Input**: `{\c&HFF0000&}Blue Text`.
- **Expected Outcome**: CSS style `color: #0000FF` (Blue).

#### TC-SUB-015: ASS Primary Color Alternate Syntax (`\1c&HBBGGRR&`)
- **Objective**: Verify alternate primary color tag `\1c&H00FF00&` (Green in BGR) converts to `#00FF00`.
- **Input**: `{\1c&H00FF00&}Green Text`.
- **Expected Outcome**: CSS style `color: #00FF00`.

#### TC-SUB-016: ASS Outline / Border Color Conversion (`\3c&HBBGGRR&`)
- **Objective**: Verify border color tag `\3c&H0000FF&` (Red in BGR) sets text shadow / outline color `#FF0000`.
- **Input**: `{\3c&H0000FF&}Red Outline`.
- **Expected Outcome**: Outline color set to `#FF0000`.

#### TC-SUB-017: Bold (`\b1`), Italic (`\i1`), Underline (`\u1`), Strikethrough (`\s1`)
- **Objective**: Verify ASS inline font style tags convert to corresponding CSS styles.
- **Input**: `{\b1\i1\u1\s1}Styled Text`.
- **Expected Outcome**: CSS contains `font-weight: bold; font-style: italic; text-decoration: underline line-through;`.

#### TC-SUB-018: Reset Inline Styling (`\b0`, `\i0`, `\r`)
- **Objective**: Verify reset tags turn off inline styles or reset style to default.
- **Input**: `{\b1}Bold {\b0}Normal`.
- **Expected Outcome**: First word bold, second word normal.

#### TC-SUB-019: ASS Hard Line Breaks (`\N`) and Non-Breaking Spaces (`\h`)
- **Objective**: Verify `\N` converts to `<br/>` and `\h` converts to non-breaking space (`&nbsp;` or space).
- **Input**: `Line 1\NLine 2\hEnd`.
- **Expected Outcome**: Parsed text contains line break between Line 1 and Line 2.

#### TC-SUB-020: Font Name (`\fnFontName`) and Font Size (`\fs24`) Parsing
- **Objective**: Verify font face and font size tags update CSS `font-family` and `font-size`.
- **Input**: `{\fnArial\fs32}Custom Font`.
- **Expected Outcome**: CSS contains `font-family: Arial; font-size: 32px;`.

---

### Category 4: Absolute Positioning & Drawing Tags (TC-SUB-021 to TC-SUB-025)

#### TC-SUB-021: Absolute Position Tag Parsing (`\pos(x,y)`)
- **Objective**: Verify `\pos(192,540)` extracts X=192, Y=540 coordinates.
- **Input**: `{\pos(192,540)}Positioned Subtitle`.
- **Expected Outcome**: Parsed position `{ x: 192, y: 540 }`.

#### TC-SUB-022: Viewport Percentage Coordinate Normalization
- **Objective**: Verify raw coordinates (192, 540) on a 1920x1080 play resolution normalize to percentages (X: 10%, Y: 50%).
- **Input**: Position `(192, 540)` with PlayResX=1920, PlayResY=1080.
- **Expected Outcome**: CSS position `left: 10%; top: 50%; position: absolute;`.

#### TC-SUB-023: Stripping ASS Vector Drawing Tags (`\p1` ... `\p0`)
- **Objective**: Verify ASS vector drawing paths between `\p1` and `\p0` (e.g. `{\p1}m 0 0 l 100 0 100 100{\p0}`) are stripped to prevent raw path data rendering on screen.
- **Input**: `{\p1}m 0 0 l 100 0{\p0}Visible Subtitle`.
- **Expected Outcome**: Drawing path removed, only `"Visible Subtitle"` rendered.

#### TC-SUB-024: Stripping Complex Karaoke & Movement Tags (`\k`, `\move`, `\fad`)
- **Objective**: Verify karaoke timers (`\k50`), movement (`\move(x1,y1,x2,y2)`), and fade tags (`\fad(t1,t2)`) are stripped safely without corrupting subtitle text.
- **Input**: `{\k50\move(0,0,100,100)}Karaoke Text`.
- **Expected Outcome**: Clean text `"Karaoke Text"` rendered.

#### TC-SUB-025: Multiple Override Blocks in Single Dialogue Line
- **Objective**: Verify dialogue line with multiple tag blocks (`{\an8\c&H00FFFF&}Top {\c&H0000FF&}Yellow`) parses both blocks cleanly.
- **Input**: `{\an8\c&H00FFFF&}Yellow {\c&H0000FF&}Red`.
- **Expected Outcome**: 2 styled text spans generated within top-center alignment container.

---

### Category 5: WebVTT / SRT HTML Tag Parsing (TC-SUB-026 to TC-SUB-030)

#### TC-SUB-026: Standard HTML Formatting Tags (`<b>`, `<i>`, `<u>`)
- **Objective**: Verify HTML formatting tags in SRT/WebVTT parse cleanly.
- **Input**: `<b>Bold</b> <i>Italic</i> <u>Underline</u>`.
- **Expected Outcome**: Correct HTML/CSS nodes generated.

#### TC-SUB-027: SRT Font Color Tag (`<font color="#FF0000">`)
- **Objective**: Verify `<font color="#FF0000">Red Text</font>` converts to inline CSS `color: #FF0000`.
- **Input**: `<font color="#FF0000">Red Text</font>`.
- **Expected Outcome**: Styled span with color `#FF0000`.

#### TC-SUB-028: Malformed Unclosed HTML Tags Handling
- **Objective**: Verify malformed unclosed tags (`<b>Unclosed Bold Text`) do not break parser layout.
- **Input**: `<b>Unclosed Bold Text`.
- **Expected Outcome**: Text parsed safely without throw.

#### TC-SUB-029: WebVTT Cue Settings Parsing (`align:left line:15%`)
- **Objective**: Verify WebVTT header cue settings (`align:left line:15%`) parse into overlay position styles.
- **Input**: Cue line `00:00:10.000 --> 00:00:13.000 align:left line:15%`.
- **Expected Outcome**: Alignment = left, vertical offset = 15%.

#### TC-SUB-030: Comprehensive Subtitle Tag Parser End-to-End Test
- **Objective**: Full end-to-end verification of ASS, SSA, SRT, WebVTT tokenization, color conversion, alignment grid mapping, and tag stripping.
- **Input**: Mixed subtitle test suite execution.
- **Expected Outcome**: 100% assertions pass across all subtitle parser edge cases.
