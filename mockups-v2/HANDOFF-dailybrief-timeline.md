# DailyBrief — "dark broadsheet" restyle + timeline rail

Paste this into the session that builds DailyBrief. Two changes, in one pass:
1. Restyle the brief to the **dark broadsheet** system below (no cards; serif + sans; brass only for needs-you).
2. The **Schedule** section becomes a vertical timeline ("rail") and needs-you items get placed on it.

Reference mockups (same copy and data as the live screenshots):
- Chosen design, full phone + fold + glance: https://claude.ai/artifact/… (DailyBrief Broadsheet)
- The six samples it was picked from: https://claude.ai/artifact/VSzYxCdaoXxjhnmkGANgRx
- Rail mechanics source: https://screensdesign.com/apps/structured-daily-planner/?vs=135555&utm_source=screensdesign&utm_medium=mcp&utm_content=search_screens

## 1. Tokens
| token | value | used for |
|---|---|---|
| ground | `#121212` | screen background (not pure black) |
| inset | `#1E1E1E` | calendar-event rail nodes only |
| rule-strong | `#3A3A3A` | around the counts, under section heads |
| rule | `#2A2A2A` | between rows |
| ink | `#EDE8DF` | headlines, titles, masthead rule, progress fill, "next" node |
| body | `#D6D0C5` | the narrative paragraph |
| secondary | `#9A948A` | labels, times, second lines, counts in section heads |
| faint | `#5A564F` | hints, footer, checkbox rings, gap dashes |
| brass | `#C9A66B` | needs-you only: nodes, dots, NEEDS YOU labels, placed times, the needs-you count, and the user's name in the greeting |

No other color. Progress bar track `#2A2A2A`, fill ink. Remove all card backgrounds, radii and shadows; sections are separated by rules.

## 2. Type
- **Serif: Instrument Serif** (Google Fonts, 400 + italic). Used for: masthead "The Daily Brief" 20px; greeting 38px (34 on fold), name in italic brass; tile numerals 30px; rail times 14px; counts in section heads 16px; gap notes 14px italic; placed times in the Needs You list 15px brass; footer 13px italic.
- **Sans: Instrument Sans** 400–600. Used for: narrative 14.5/1.5 in body color with a serif drop cap (30px, float left); item titles 14–14.5/600; second lines 12–12.5 secondary; labels 10.5px uppercase 0.16em secondary; hint 12px faint.
- Rule: if it's a number, a time or a note-to-self, it's serif. If you read it as a sentence, it's sans.

## 3. Structure (phone, top to bottom)
1. **Masthead**: "The Daily Brief" (serif) left, `SUN · OCT 18 · FROM 11:56` (label) right, 2px ink rule beneath.
2. **Greeting** + full narrative with drop cap.
3. **Progress**: 3px bar, then `47% of the day` label.
4. **Counts**: 3 tiles (4 on fold) in one row, 1px rule-strong above and below and between; serif numerals; needs-you numeral in brass.
5. **Today, in order** (the rail) — section head with serif count on the right ("3 placed").
6. **Needs you** — rows: 6px brass dot, title, second line, serif brass time on the right (the slot chosen on the rail, replaces the TODAY pill). Hint line in faint beneath.
7. **Texts** — rows separated by 1px rules, serif count in the head.
8. **Work** — one section with two "quiet" rows: `Teams … nothing new`, `Slack … nothing new` (italic serif), instead of two empty cards.
9. **Footer**: italic serif, faint: "A new brief every morning at 6:45. Pull down to refresh."

## 4. The rail
Row grid: `40px time | 36px node | 1fr text | 20px check`, column gap 10.
- Time: serif 14 secondary, right-aligned.
- Node: 36px capsule, radius 18, icon 16px at the top (9px padding). Height = `max(36px, minutes × 1.45px)` → 30 min ≈ 44, 45 min ≈ 64, 1 h ≈ 88.
  - inset `#1E1E1E` + 1px rule-strong border, brass icon → calendar event
  - solid brass, ink icon → needs-you item placed on the rail
  - solid ink, ink-colored icon dark → the one *next* event
  - transparent with rule-strong border, secondary icon → a text at its arrival minute (optional toggle), or the 6:45 "Tomorrow's brief" marker
- Text: 14/600 title; 12 secondary second line; needs-you rows get a 9.5px brass `NEEDS YOU` label above the title.
- Check: 20px circle, 1.5px faint ring; checked = filled ink. Checking a brass node marks the item done in Needs You and decrements the count tile.
- Now: 10px ink dot in the node column, serif time in ink, `NOW` label in secondary.
- Gaps > 30 min collapse to a 28px row: 1px dashed faint vertical in the node column + italic serif note ("open until two", "open evening").

## 5. Placing needs-you items (rule, not AI)
1. Start at `now` rounded up to the next :15, plus 15 min.
2. Place in priority order (overdue money first), 15 min apart, each at its estimated length (default 10 min; 2 min for a tap-to-pay).
3. Never overlap a calendar event; on collision, jump to 15 min after that event ends.
4. Prefer slots before the next meeting when ≥ 45 min is free before it.
5. "Not now" moves the item to after the next event; "not for me" removes it from rail and list.
Show the chosen time in the Needs You list as the serif brass time.

## 6. Fold / tablet (≥ 700px)
Masthead and the four counts span the width. Two columns, 28px gutter. Left: greeting, narrative, progress, rail. Right: Needs You, Texts, Work. Footer spans. Rail and Needs You are one dataset; a check on either side updates both.

## 7. Glance (widget / lock screen, optional)
Masthead line, then four lines: next two brass items (`12:15  Pay Global Lending · $789.10`), the next event, and an italic serif footer `3 need you · 4 texts · 47% of the day`.

## 8. Acceptance
- No card backgrounds remain; sections are separated by rules only.
- Nothing is brass except needs-you elements, the needs-you count, and the name in the greeting.
- Numbers, times and notes render in Instrument Serif; sentences in Instrument Sans.
- With an open calendar and 3 needs-you items, the rail shows Now + 3 brass capsules + gap notes, not "Day is open".
- Checking a brass capsule removes the item from Needs You and updates the count.
- 390px: no horizontal scroll. 760px: two columns with masthead and counts spanning.
