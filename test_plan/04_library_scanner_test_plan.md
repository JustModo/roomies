# Test Plan: Library Scanner & Media Detection

## Module Overview
This module covers media library folder classification (`mediaDetector`), Movie vs Show folder structure rules, single video file fallback handling, episode pattern regex parsing (`S01E01`, `1x01`, `Episode XX`, `/Season XX/`), sidecar subtitle discovery (`.srt`, `.vtt`, `.ass`, `.ssa`), ISO language code resolution (`eng`, `en`, `fre`, `fr`, `jpn`, `ja`), and WebVTT format conversion.

**Total Test Cases**: 35 (TC-SCAN-001 to TC-SCAN-035)

---

## Detailed Test Case Specifications

### Category 1: Media Type Classification Engine (`detectMediaType`) (TC-SCAN-001 to TC-SCAN-008)

#### TC-SCAN-001: Classification of Folder with Single Video File as Movie
- **Objective**: Verify `detectMediaType` classifies a directory containing 1 main video file (`Inception.mp4`) as `'movie'`.
- **Input**: Directory `/media/Movies/Inception/` with `Inception.mp4`.
- **Expected Outcome**: Returns `{ type: "movie", confidence: 1.0 }`.

#### TC-SCAN-002: Classification of Folder with Multiple Video Files as Show
- **Objective**: Verify `detectMediaType` classifies a directory containing 3+ episode files (`S01E01.mp4`, `S01E02.mp4`) as `'show'`.
- **Input**: Directory `/media/Shows/Breaking Bad/` with episode files.
- **Expected Outcome**: Returns `{ type: "show", confidence: 1.0 }`.

#### TC-SCAN-003: Classification of Folder with Nested Season Subdirectories as Show
- **Objective**: Verify folder containing `Season 1/` and `Season 2/` subdirectories is classified as `'show'`.
- **Input**: Directory `/media/Shows/The Office/` containing `Season 01/` subfolder.
- **Expected Outcome**: Returns `{ type: "show" }`.

#### TC-SCAN-004: Classification of Folder with Single Video and Featurette Extras as Movie
- **Objective**: Verify folder with 1 main feature video (`Feature.mkv`) and 2 small extras (`trailer.mp4`, `sample.mp4`) is classified as `'movie'`.
- **Input**: Main feature (2GB) + trailer (50MB) + sample (10MB).
- **Expected Outcome**: Classifies as `'movie'` selecting largest file as feature.

#### TC-SCAN-005: Single Isolated Video File Scan Fallback
- **Objective**: Verify passing an isolated video file directly to scanner classifies it as a movie.
- **Input**: File path `/media/StandaloneMovie.mp4`.
- **Expected Outcome**: Processed as a single movie item.

#### TC-SCAN-006: Empty Folder Scan Handling
- **Objective**: Verify scanning an empty folder returns zero media items without throwing errors.
- **Input**: Empty directory `/media/EmptyFolder/`.
- **Expected Outcome**: Returns empty media list, zero database inserts.

#### TC-SCAN-007: Non-Media Files Folder Rejection
- **Objective**: Verify folder containing only text documents, PDFs, and images is ignored.
- **Input**: Directory with `readme.txt`, `cover.jpg`, `doc.pdf`.
- **Expected Outcome**: Ignored by scanner, zero database inserts.

#### TC-SCAN-008: Deeply Nested TV Show Folder Structure
- **Objective**: Verify show detection traverses 3 levels of nested folders (`/Show/Season 01/Specials/ep1.mp4`).
- **Input**: Deeply nested structure.
- **Expected Outcome**: Episode recognized and mapped to show.

---

### Category 2: Movie Handler (`processMovie`) (TC-SCAN-009 to TC-SCAN-016)

#### TC-SCAN-009: Movie Metadata Extraction via FFprobe
- **Objective**: Verify `processMovie` extracts duration, resolution, video codec, and audio codec using FFprobe metadata.
- **Input**: Movie file `TestMovie.mp4` (duration: 7200s, resolution: 1920x1080).
- **Expected Outcome**: Database `MediaFile` record created with duration `7200`.

#### TC-SCAN-010: Feature Video Selection by File Size
- **Objective**: Verify that when multiple video files exist in a movie folder, the largest file by size is picked as feature film.
- **Input**: `movie.mkv` (4GB), `behind_the_scenes.mkv` (500MB).
- **Expected Outcome**: `movie.mkv` assigned as main media file.

#### TC-SCAN-011: Movie Name Normalization
- **Objective**: Verify folder names with release tags (`Inception.2010.1080p.BluRay.x264`) are cleaned into human-readable titles (`Inception`).
- **Input**: Folder name `Inception.2010.1080p.BluRay.x264`.
- **Expected Outcome**: Movie name set to `"Inception"`.

#### TC-SCAN-012: Database Movie Record Upsert
- **Objective**: Verify scanning existing movie updates database record without creating duplicate entries.
- **Input**: Rescan library with existing movie.
- **Expected Outcome**: Existing `Movie` record updated (`updatedAt`), count remains 1.

#### TC-SCAN-013: Movie Cascade Deletion Cleanup
- **Objective**: Verify deleting a library record cascades deletion to associated `Movie`, `MediaFile`, and `Subtitle` records.
- **Input**: Prisma delete on `Library`.
- **Expected Outcome**: All child records deleted from database.

#### TC-SCAN-014: Handling Movies with Special Characters in Filenames
- **Objective**: Verify filenames containing spaces, brackets, parentheses, and accent characters parse correctly (`[1080p] Movie (2022) - Cafe.mp4`).
- **Input**: Special character filename.
- **Expected Outcome**: Parsed cleanly without database crash.

#### TC-SCAN-015: Corrupted Video File Rejection
- **Objective**: Verify corrupted 0-byte video file is flagged and skipped during movie processing.
- **Input**: 0-byte file `corrupt.mp4`.
- **Expected Outcome**: Warning logged, corrupt file skipped.

#### TC-SCAN-016: Movie Subtitle Discovery Integration
- **Objective**: Verify `processMovie` automatically invokes sidecar subtitle discovery for the movie folder.
- **Input**: Movie folder with `movie.mp4` and `movie.srt`.
- **Expected Outcome**: Subtitle record created and linked to movie's `MediaFile`.

---

### Category 3: Show Handler & Episode Pattern Parsing (`processShow`) (TC-SCAN-017 to TC-SCAN-024)

#### TC-SCAN-017: Standard Episode Pattern Regex Parsing (`S01E05`)
- **Objective**: Verify filename `Show.S01E05.mp4` parses Season 1, Episode 5.
- **Input**: Filename `Show.S01E05.mp4`.
- **Expected Outcome**: `number` set to 5 (or 105), title formatted cleanly.

#### TC-SCAN-018: Alternate Episode Pattern Regex Parsing (`1x08`)
- **Objective**: Verify filename `Show.1x08.mp4` parses Season 1, Episode 8.
- **Input**: Filename `Show.1x08.mp4`.
- **Expected Outcome**: Episode number 8 extracted.

#### TC-SCAN-019: Explicit "Episode XX" Filename Pattern Parsing
- **Objective**: Verify filename `Show - Episode 12 - Title.mp4` parses Episode 12.
- **Input**: Filename `Show - Episode 12 - Title.mp4`.
- **Expected Outcome**: Episode number 12 extracted.

#### TC-SCAN-020: Season Folder Episode Parsing (`/Season 02/E04.mp4`)
- **Objective**: Verify file `E04.mp4` inside folder `Season 02` resolves to Season 2 Episode 4.
- **Input**: Path `/Show/Season 02/E04.mp4`.
- **Expected Outcome**: Season 2 Episode 4 identified.

#### TC-SCAN-021: Episode Numeric Ordering Assertion
- **Objective**: Verify show episodes are saved in database sorted in ascending order by episode number (E01, E02, E03).
- **Input**: Unsorted episode files (`ep3.mp4`, `ep1.mp4`, `ep2.mp4`).
- **Expected Outcome**: Querying show's media files returns `[E01, E02, E03]`.

#### TC-SCAN-022: Multi-Season Show Grouping
- **Objective**: Verify episodes across Season 1 and Season 2 are grouped under the single parent `Movie` (type `'show'`) record.
- **Input**: Folder with `Season 1` (10 eps) and `Season 2` (10 eps).
- **Expected Outcome**: 1 `Movie` record created, 20 `MediaFile` child records linked.

#### TC-SCAN-023: Special / OVA Episode Pattern Handling (`S00E01` or `OVA`)
- **Objective**: Verify OVA / Special episodes are categorized without crashing episode sorter.
- **Input**: Filename `Show.S00E01.OVA.mp4`.
- **Expected Outcome**: Special episode processed with number 0.

#### TC-SCAN-024: Show Title Extraction from Folder Hierarchy
- **Objective**: Verify parent folder name is used as the show's canonical title (`/media/Shows/Breaking Bad/Season 1/ep1.mp4` -> `"Breaking Bad"`).
- **Input**: Path `/media/Shows/Breaking Bad/Season 1/ep1.mp4`.
- **Expected Outcome**: Show title set to `"Breaking Bad"`.

---

### Category 4: Sidecar Subtitle Matching & Language Resolution (TC-SCAN-025 to TC-SCAN-030)

#### TC-SCAN-025: Matching Sidecar Subtitle by Matching Basename (`movie.srt`)
- **Objective**: Verify subtitle `movie.srt` matches video `movie.mp4`.
- **Input**: `movie.mp4` and `movie.srt` in same directory.
- **Expected Outcome**: Subtitle record created and linked to `MediaFile`.

#### TC-SCAN-026: Language Resolution for ISO 639-1 / 639-2 Codes (`movie.en.srt`, `movie.eng.srt`)
- **Objective**: Verify language suffix `.en.srt` or `.eng.srt` resolves canonical language to `"English"`.
- **Input**: `movie.eng.srt`, `movie.fre.srt`, `movie.jpn.srt`.
- **Expected Outcome**: Language strings resolved: `"English"`, `"French"`, `"Japanese"`.

#### TC-SCAN-027: Handling Multi-Language Subtitles in Same Directory
- **Objective**: Verify 3 sidecar subtitles for 1 movie (`movie.en.srt`, `movie.es.srt`, `movie.fr.srt`) register 3 distinct `Subtitle` records.
- **Input**: 3 subtitle files alongside 1 video.
- **Expected Outcome**: 3 `Subtitle` records created for the single `MediaFile`.

#### TC-SCAN-028: Subtitle Format Conversion to WebVTT (`convertSubtitleToVtt`)
- **Objective**: Verify SRT/ASS sidecar subtitle files are converted to valid WebVTT format for browser web player compatibility.
- **Input**: Subtitle file `sub.srt` containing standard SRT timestamps `00:01:20,000 --> 00:01:23,500`.
- **Expected Outcome**: WebVTT output starts with `WEBVTT` header and uses dot timestamps `00:01:20.000 --> 00:01:23.500`.

#### TC-SCAN-029: Timestamp Offset Shift Adjustment
- **Objective**: Verify applying a timestamp offset shift (+2.5s) shifts all cue timestamps in converted WebVTT file.
- **Input**: Cue at `00:00:10.000`, shift offset +2.5s.
- **Expected Outcome**: Cue timestamp updated to `00:00:12.500`.

#### TC-SCAN-030: Subtitle Search Traversal in `.subtitles/` Subfolder
- **Objective**: Verify sidecar matcher finds subtitles located in a nested `Subs/` or `.subtitles/` directory.
- **Input**: `/movie.mp4` and `/Subs/movie.English.srt`.
- **Expected Outcome**: Subtitle successfully matched and registered.

---

### Category 5: Library Service Orchestrator (TC-SCAN-031 to TC-SCAN-035)

#### TC-SCAN-031: Full Directory Tree Library Rescan (`scanLibrary`)
- **Objective**: Verify calling `LibraryService.scanLibrary()` scans all registered library paths and updates database.
- **Input**: Library path `/media/` containing 2 movies and 1 show.
- **Expected Outcome**: Database populated with 3 `Movie` records and associated `MediaFile` entries.

#### TC-SCAN-032: Incremental Library Rescan Performance
- **Objective**: Verify rescanning an unchanged library performs zero unnecessary database writes.
- **Input**: Rescan existing library with zero new files.
- **Expected Outcome**: Scan finishes rapidly, record count unchanged.

#### TC-SCAN-033: Deleted File Removal During Rescan
- **Objective**: Verify deleting a video file from disk removes its record from database during next rescan.
- **Input**: Delete `movie2.mp4` from disk, trigger `scanLibrary()`.
- **Expected Outcome**: Orphaned `Movie` and `MediaFile` records deleted from database.

#### TC-SCAN-034: Handling Permission Denied Directories
- **Objective**: Verify scanner logs warning and continues scanning when encountering a directory with restricted read permissions (`chmod 000`).
- **Input**: Unreadable folder in library.
- **Expected Outcome**: Unreadable folder skipped gracefully; remaining library scanned successfully.

#### TC-SCAN-035: Full Integrated Library Scanner Lifecycle
- **Objective**: End-to-end test of library creation, media detection, metadata extraction, episode sorting, subtitle matching, VTT conversion, and rescan cleanup.
- **Input**: Comprehensive real mock filesystem structure.
- **Expected Outcome**: 100% assertions pass across all library scanner functions.
