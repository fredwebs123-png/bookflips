# DailyBrief — timeline rail handoff

Paste this into the session that builds DailyBrief. It describes one change: the **Schedule** card becomes a vertical timeline ("rail") in the app's existing dark system, and items that need you get placed on it. Nothing else about the brief changes.

Reference mockups (interactive, same data as the live screenshots):
- Phone + fold, in the real system: https://claude.ai/artifact/5N5ZdJ2b4ej3fjm413kNAj (DailyBrief Dark Timeline)
- The Structured-style rail mechanics this is based on: https://screensdesign.com/apps/structured-daily-planner/?vs=135555&utm_source=screensdesign&utm_medium=mcp&utm_content=search_screens

## 1. Keep exactly as is
- Ground `#0B0B0B`, card `#151515` (radius 22), tile `#1C1C1C` (radius 16)
- Text `#F2F2F2`, body copy `#C9C9C9`, secondary `#8E8E8E`, hairlines `#222`
- Labels: 11.5px, uppercase, letter-spacing 0.18em, `#8E8E8E`
- Greeting 30/600 with the name in `#8E8E8E`; narrative paragraph; the "47% of the day" white progress bar; the three stat tiles
- Amber `#D9A440` is **only** for "needs you" (dot, TODAY pill text). Do not introduce any other accent.

## 2. The rail (replaces the collapsed "Day is open" row inside the Schedule card)
Grid per row: `44px time | 40px node | 1fr text | 22px check`, column gap 12.

- **Time** (left): 12/600 `#8E8E8E`, right-aligned. The current time row is `#F2F2F2`.
- **Node**: 40px wide capsule, radius 20, icon 18px centered at the top (10px padding). Height encodes duration: `max(40px, minutes × 1.6px)` → 30 min ≈ 48px, 45 min ≈ 72px, 1 h ≈ 96px.
  - grey `#242424` / icon `#C9C9C9` → calendar event
  - amber `#D9A440` / icon `#1A1300` → needs-you item placed on the rail
  - white `#F2F2F2` / icon `#0B0B0B` → the *next* event (at most one)
  - ring: transparent, 2px `#3A3A3A` border, 40px tall → a text, at the minute it arrived (optional, togglable)
- **Text**: title 15/600; second line 13 `#8E8E8E`. Needs-you rows get a 10px amber label above the title: `NEEDS YOU · TODAY`.
- **Check**: 22px circle, 2px `#3A3A3A`; checked = filled `#F2F2F2`. Checking a needs-you capsule marks it done in Needs You and decrements the tile.
- **Now**: 12px white dot with a 4px `rgba(242,242,242,.14)` halo in the node column, time in white, label `NOW` in the label style.
- **Gaps**: when the gap to the next item is > 30 min, collapse it to one 34px row: dashed 2px `#2E2E2E` vertical in the node column and italic 13px `#5E5E5E` text: `open until 2:00`, `open evening`.
- Card header right side reads `Day is open · 3 placed` (or `4 events · 3 placed`) with the existing chevron.

## 3. Placing needs-you items on the rail
Rule, not AI: each needs-you item gets a suggested slot so it has a time.
1. Start at `now` rounded up to the next 15 min, plus 15 min.
2. Place items in priority order (overdue money first), 15 min apart, each at its estimated length (default 10 min; "2 min" for a single tap-to-pay).
3. Never overlap a calendar event; if a slot collides, jump to 15 min after that event ends.
4. Prefer slots before the next meeting if there is ≥ 45 min free before it.
5. Snoozing an item ("not now") moves it to after the next event; "not for me" removes it from the rail and the list.
Show the chosen time on the Needs You list too: the TODAY pill becomes the time (`12:15`), amber text, same pill.

## 4. Fold / tablet (≥ 700px wide)
Two columns, 14px gap. Left: greeting card, then the Schedule card with the rail. Right: Needs You card, Texts card. Four stat tiles across the top (Meetings left / Needs you / Texts today / Unread work) with the 3px white mini-bar each. The rail and the Needs You list are the same data; a check on either side updates both.

## 5. Acceptance
- With an open calendar and 3 needs-you items, the Schedule card shows Now + 3 amber capsules + the gaps, not "Day is open".
- Durations are visible: a 45-min call is visibly taller than a 10-min payment.
- Nothing on the screen is amber except needs-you nodes, their labels and their time pills.
- Checking an amber capsule removes it from Needs You and updates the `3` tile.
- Phone width 390 has no horizontal scroll; fold width 760 shows two columns.

Recommendation: ship V1 (rail inside the Schedule card) first. V2 (texts on the rail as ring nodes) is a toggle you can add later.
