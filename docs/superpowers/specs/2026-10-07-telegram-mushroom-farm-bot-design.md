# Telegram Mushroom Farm Bot — Design Spec

**Date:** 2026-10-07
**Farm:** Loni, Ghaziabad
**Owner/operator of this document:** Shashank Singh (sole bot "owner" — full access)
**Status:** Approved by owner in chat, section by section. Ready for implementation planning.

## 1. Purpose and hard rules

One Telegram bot, one database, one always-running program, for a mushroom farm with
several people in different roles. The bot **only asks, records, checks, and reports.
It must never control any equipment.** This is a hard rule with no exceptions.

Rules that apply to every role, every entry, everywhere in this system:

1. Every entry must include at least one photo. No entry is complete without one.
2. Workers are addressed in simple, everyday Hindi (Devanagari) — not formal or
   Sanskritised Hindi. Each person has a language setting. The owner gets English.
3. Buttons wherever possible. Typing only for numbers and short notes. One question
   at a time.
4. Before saving, the bot shows a short summary and lets the person correct one answer.
5. Impossible numbers are rejected politely and re-asked. Decimals may use a comma or
   a dot.
6. **Entries are immutable.** Nothing is ever edited or deleted once saved. A
   correction is saved as a new entry that refers back to the original; both are kept
   forever.
7. The bot records the time it received every message and photo. Photos are kept in
   their original received form, in folders organized by role, person, and date.
8. Tone of a diary, never an inspection. Nobody should feel blamed for reporting a
   problem.
9. All times are India time (Asia/Kolkata).

## 2. People and roles (today)

| Person   | Role                     | Language              | Schedule                                  | Build phase |
|----------|--------------------------|------------------------|--------------------------------------------|-------------|
| Anuragh  | Compost bag supplier     | Hindi (everyday)       | Every 3 days, sweeps both huts             | Phase 1 |
| Nitish   | Hut maker                | Hindi (everyday)       | Every 3 days + any day he works            | Phase 1 |
| Ajay     | Civil contractor         | Hindi (everyday)       | Daily, 7 days a week                       | Phase 2 |
| Chandan  | Facility supervisor      | Chosen by him on first use (English or Hindi) | Daily at 7:00 pm | Designed now; construction-mode live from Phase 2, full supervisor-mode switched on later (see §8) |
| Owner    | Owner (Shashank)         | English                | On demand + scheduled reports              | N/A |

Units today: **Hut 1** and **Hut 2**. Units, people, and roles are all defined in a
settings file (§3.3) — adding one later means editing settings, never rewriting code.
Growth plan: a PUF (insulated panel) room arrives ~January 2027; by end of 2027, up to
10 huts and 6 PUF rooms.

Ajay's work currently covers hut-related construction, a toilet, an office, and the
base/foundation for the PUF cabins — all handled by the same generic wall/other-work
flow in §7, with his own typed description identifying which building an entry
belongs to. No automatic categorization by building was built (see §7, "which wall");
this is a deliberate simplicity trade-off given Ajay's background (12th pass, Hindi
medium) — a per-building breakdown is read manually from his descriptions, not
computed automatically.

## 3. Core technical architecture

### 3.1 Language and bot framework
Python, using **python-telegram-bot** (v20+, async). Its built-in `JobQueue` handles
all recurring schedules (3-day reminders, daily 7 pm trigger, the 11:30 pm sleep
reminder loop) so no separate scheduling library is needed. All scheduling and
timestamps use Asia/Kolkata.

### 3.2 Database
**SQLite** — a single file, no separate database server to install or run. Fits the
single-laptop deployment and the "never edit, only append corrections" rule naturally:
the application code simply never issues `UPDATE`/`DELETE` against a submitted entry.
Lives at `D:\MushroomFarmBot\data\farm.db`.

Core tables (conceptual, not final column-level schema — that's for the implementation
plan):
- `person` — telegram_id, name, role, language, active
- `unit` — id, name (Hut 1, Hut 2, …), co2_enabled flag
- `entry` — one row per submission: entry_id, person_id, unit_id (nullable),
  role, received_at (receipt timestamp), payload (the answers, as structured data),
  photo_paths, corrects_entry_id (nullable, points to an earlier entry)
- `verification` — entry_id, verified_by, status (checked / query / disagreed), note,
  verified_at. Separate table; never alters the original entry.
- `owner_note` — owner's own free-standing notes/photos, not tied to a role's flow
- `reminder_state` — per-person/per-schedule tracking of the last reminder sent and
  escalation count, supporting "remind → remind again → tell owner" and the
  sleep-reminder loop

### 3.3 Settings file
A human-readable **YAML** file at `D:\MushroomFarmBot\config\settings.yaml` defining:
people (telegram_id, name, role, language), units, schedules, target environmental
ranges (marked "to be confirmed by grower/agronomist" — see §9), and per-unit toggles
(e.g. CO2 question on/off). Adding a person, unit, or role means editing this file,
not the program's code. Changes take effect on the next bot restart.

### 3.4 Photos
Saved exactly as Telegram sends them — never compressed or altered — in
`D:\MushroomFarmBot\photos\<role>\<person>\<YYYY-MM-DD>\<timestamp>_<n>.jpg`.

### 3.5 Access control
A static allow-list in `settings.yaml` maps specific Telegram numeric user IDs to a
person, role, and language. Anyone not on the list is silently ignored, and the owner
is notified that an unknown account tried to use the bot. No passwords are involved —
Telegram IDs are public, harmless numbers, not secrets. The bot's own access token
(from BotFather) is the only secret, and it lives only in the settings file, never in
code, never shared.

### 3.6 Correction / locking model
Every submitted entry is an immutable row. A correction is a brand-new row with
`corrects_entry_id` pointing at the original entry. Both rows are kept forever;
reports show the latest correction but the original remains in the data.

### 3.7 Instant alerts vs. the evening summary
Most problems reported by any role simply appear in the evening summary (§9). A small
set of specific answers bypass that and alert the owner **immediately**:
- Anuragh: picking "green mould" or "bad smell"
- Chandan (once in full supervisor-mode): any temperature/humidity/CO2 reading
  outside its target range, or picking "green mould," "white cobweb growth," or
  "brown spots"
No other role has an instant-alert rule at this time.

### 3.8 Excel export
Built with a standard Python spreadsheet library (openpyxl/pandas). Produces one
`.xlsx` file plus a folder of photos organized to match, generated on request via an
owner command.

## 4. Infrastructure — keeping the bot available

The bot runs on the owner's home Windows laptop (confirmed via direct inspection:
supports S3 sleep and Hibernate; OneDrive sync root confirmed at `D:\OneDrive`; AC
powered).

- **Live app location:** `D:\MushroomFarmBot` — a plain local folder, deliberately
  *outside* the OneDrive-synced folder, so OneDrive never tries to sync the database
  file while the bot is actively writing to it.
- **Nightly backups:** a scheduled job copies a fresh snapshot of the database and any
  new photos into `D:\OneDrive\MushroomFarmBot-Backups`, which OneDrive then uploads
  automatically. This is the off-laptop copy required by the data-safety rules (§10).
- **Auto-start and crash recovery:** a Windows Task Scheduler entry launches the bot
  automatically the moment Windows finishes starting up (no one needs to open
  anything), and restarts it automatically if it ever crashes, using Task Scheduler's
  own retry setting.
- **Power plan:** set so the laptop never sleeps on its own while on AC power. It only
  sleeps when the owner deliberately puts it to sleep at night. (No shutdown — sleep
  preserves the running bot process.)
- **Morning "turn on the laptop" nudge (9:00 am):** a separate, free **GitHub Actions**
  scheduled job in this repository — not running on the laptop — sends the owner a
  Telegram message at 9:00 am. This is deliberately decoupled from the laptop's own
  state, since the laptop being off is exactly the situation this nudge exists for.
- **Startup confirmation:** the bot itself sends "✅ I'm up and running" the moment it
  starts each morning. That message *is* the confirmation — the owner doesn't reply.
  If GitHub Actions hasn't seen that confirmation within ~90 minutes of the 9 am
  nudge, it sends the nudge again; a second miss triggers a direct alert to the owner.
- **Night "put the laptop to sleep" reminder (starts 11:30 pm):**
  1. Bot asks: "Have you put the laptop to sleep?" [Yes] [No]
  2. Yes → done.
  3. No → bot asks: "Are you out right now?" [Yes] [No]
     - Yes → bot asks how much longer (buttons: 30 min / 1 hr / 2 hr / custom). It
       waits that long, then re-asks step 1.
     - No → goes straight to step 4.
  4. Every 10 minutes, the bot re-asks step 1, indefinitely, until the answer is Yes.
     No escalation cap and no second-owner fallback — kept deliberately simple.
- **Project location:** the bot is a self-contained project at `D:\MushroomFarmBot`,
  entirely separate from this repository (the existing JavaScript mandi-price tracker),
  which continues untouched.

## 5. Role 1 — Anuragh (Compost Bag Supplier)

Schedule: every 3 days. Reminds him on the due day; reminds again if nothing by
evening; tells the owner if still nothing by the next morning.

Because this is a routine sweep (he checks on every hut every time), **the bot walks
him through each defined unit automatically, one after another** — he never has to
pick a hut from a menu.

Per unit (Hut 1, then Hut 2, …):
1. Number of bags in that hut today — the bot shows the last known count
   ("1050 — still correct?") with a quick confirm/update option, instead of making
   him retype it from scratch every time.
2. How far the white spawn growth has spread — buttons: *just started / about half /
   almost full / fully white.*
3. Problems seen — buttons, more than one allowed: *none / green mould / patchy or
   uneven growth / other coloured mould / bad smell / flies / torn bags / bags too
   wet / bags too dry / other.*
4. Photos: one wide photo showing all bags in the hut, plus close-ups of at least 3
   individual bags.
5. Anything else, in his own words — typed or voice note.

Instant alert to the owner (bypassing the evening summary) if "green mould" or "bad
smell" is picked in step 3 — research into commercial *Agaricus bisporus* cultivation
confirms green mould (*Trichoderma*) is the single most damaging and fastest-spreading
contaminant, with documented crop losses of 30–100% when caught late.

Current real numbers at design time: 2 huts, 1050 bags each, 2100 bags total, current
stage "just started."

## 6. Role 2 — Nitish (Hut Maker)

Schedule: every 3 days, plus any day he actually does work (self-initiated, not
waiting for a prompt).

Unlike Anuragh, Nitish's work is task-based, not a routine sweep — on a given day he
might touch only one hut. So he **picks which hut(s) he worked on**, and can select
more than one.

1. Which hut(s) — buttons, more than one selectable.
2. What was done — buttons, more than one selectable: *new hut construction / repair /
   covering or sheeting / door or ventilation work / cleaning / nothing today / other.*
   Picking "nothing today" skips straight to closing the entry — no photos required.
3. Short description in his own words — typed or voice note.
4. Any material used or needed — typed (materials vary too much for fixed buttons).
5. Any problem with a hut he wants the owner to know — typed or voice note. Not
   forced into fixed categories, unlike Anuragh's list — construction problems are
   too varied to usefully standardize, and there's no equivalent body of research to
   draw categories from the way there is for compost contamination.
6. Photos: a before-and-after pair for every repair; at least 2 photos for any other
   work type selected.

No instant-alert rule for Nitish — everything flows into the normal evening summary.

## 7. Role 3 — Ajay (Civil Contractor)

Schedule: daily, 7 days a week. **The most legally significant role** — treated as a
daily statement by Ajay of the work he says he's done. The interface is deliberately
kept as simple as possible: Ajay is 12th pass, Hindi medium, so the design minimizes
typing, choices, and anything resembling a technical decision on his part.

1. Was work done today? [Yes] [No] — if No, buttons: *no labour / no material / rain
   / holiday / other.*
2. If Yes, for each wall he worked on that day (he can log more than one per day):
   - Which wall — **one simple open question** ("which wall / what did you work on"),
     typed or voice, in his own words. This single free-text answer also identifies
     which building the work belongs to (hut, toilet, office, PUF cabin base) — there
     is deliberately no separate structured "pick a category" question, since that
     risked being confusing for him. The owner reads this text manually for a
     per-building breakdown; nothing is auto-categorized.
   - Length (ft) and height (ft) — **today's new work only**, never the wall's full
     current cumulative state. This is the key design decision that makes the running
     total work correctly (see below).
   - Thickness — buttons: *4.5 inch / 9 inch / other* (then type inches).
   - At least 2 photos, one showing the full length.
   - The bot calculates area (length × height) and volume (area × thickness) for that
     entry, shows the result, and asks him to confirm.
   - "Add another wall?" [Yes] [No]
3. Other work today — buttons, more than one allowed: *foundation / plaster /
   flooring / roof or shed / doors or windows / drainage / electrical / other.* Each
   gets a quantity and photos. **The unit (square feet vs. running feet) is set
   automatically per work type** (e.g. plaster/flooring default to square feet,
   drainage defaults to running feet) — Ajay is never asked to choose a unit.
4. Demolition today? If yes: what was demolished (typed), the size, before-and-after
   photos.
5. Labour count today — typed number.
6. Material received today? If yes: typed description plus a photo of the delivery
   or bill.
7. **Running totals** — wall length, area, and volume — are a single overall grand
   total, not broken down per wall or per building. Because every entry represents
   only *new* work (step 2 above), the total is simply the sum of every confirmed
   wall entry ever logged, including the opening balance. There is no persistent
   "named section" tracking and no risk of double-counting an ongoing wall as it gets
   taller over multiple visits. The total is shown back to Ajay after each submission
   and to the owner in reports.
8. **Opening balance** — entered once by the owner (never attributed to Ajay),
   explicitly tagged "entered by owner, before the bot." Three existing wall
   sections:

   | Section | Length | Height | Thickness |
   |---------|--------|--------|-----------|
   | 1       | 52 ft  | 9 ft   | 9 inch    |
   | 2       | 11 ft  | 9 ft   | 9 inch    |
   | 3       | 11 ft  | 9 ft   | 9 inch    |

   Starting totals: **74 ft length, 666 sq ft area, ~499.5 cubic ft volume.**
9. **Weekly verification** — Chandan (or the owner) marks each of Ajay's entries as
   *checked*, *query*, or *disagreed*, with a note. Stored in the separate
   `verification` table (§3.2) — Ajay's original entry is never altered. This duty
   continues for Chandan regardless of which mode his own reporting is in (§8).

No instant-alert rule for Ajay beyond the normal evening summary and weekly
verification.

## 8. Role 4 — Chandan (Facility Supervisor)

Designed now; built last, per the owner's original instruction — but with a twist
discovered during design: Chandan needs *some* bot presence well before the full
supervisor checklist is useful, because the huts don't have any crop in them yet.

### 8.1 Two modes, switched via settings — no new code for mode A

**Mode A — now, while huts are still under construction and no mushroom/compost has
been delivered:** Chandan submits **the exact same daily report as Ajay** (§7, in
full) — he's overseeing the same construction site as an independent second
observer. Because this reuses Role 3's flow exactly, **it requires no new code** —
Chandan is simply a second person assigned the civil-contractor question set in
settings, so this can go live as soon as Phase 2 (Ajay) is built.

- Chandan's weekly verification duty over Ajay's entries continues unaffected.
- Chandan's own Mode A entries are not separately verified by anyone — he's the
  senior person on site, and the owner sees everything in the reports regardless.

**Mode B — once mushroom/compost is delivered and the huts start actually growing
crop:** Chandan switches to the full supervisor checklist below. This is the part of
Role 4 that is genuinely new code, switched on only when the owner says so.

**Switching between modes** is a settings-file change (Chandan's assigned role for
reporting purposes), triggered by the **owner explicitly saying so** (e.g. "mushroom
delivered, switch Chandan now") — not a fixed calendar date, since delivery dates can
slip. The bot will gently check in with the owner around the 28-day mark ("has the
mushroom been delivered yet? should I switch Chandan now?") rather than switching
automatically.

### 8.2 Mode B — full supervisor checklist (daily at 7:00 pm)

Chandan chooses English or Hindi the first time he opens the bot; that choice is
saved and reused from then on.

Like Anuragh, this is a full daily sweep — **the bot walks him through every unit
automatically**, one after another.

Per unit:
1. Crop stage — buttons: *spawn run / case run / pinning / cropping / cleaning /
   empty.*
2. **Day of that stage** — tracked automatically from the date the stage was last
   changed. Shown to him as "Day N of [stage] — correct?" with a quick-fix option,
   rather than making him count and type it himself.
3. Lowest and highest temperature today (from the max/min thermometer), then a
   reminder to reset the thermometer.
4. Humidity now.
5. Fresh air: yes/no; if yes, minutes.
6. Problems seen — buttons, more than one allowed: *none / green mould / white
   cobweb growth / flies / dry patches / cracks in casing / brown spots / other.*
7. If the stage is "cropping": harvest weight in kg.
8. Photos of the beds, at least one per unit.
9. Anything unusual, typed or voice note.

**The watering/bucket-count question from the original brief has been deliberately
removed** — the owner already receives a separate update on watering every evening
at 7, so asking Chandan to re-report it here would be redundant.

Facility-wide, once per day after the per-unit sweep: staff present today, anything
needing the owner's decision, and (weekly) the verification step for Ajay's entries.

**CO2 reading** stays optional and off by default, switchable on per unit — intended
to switch on when the PUF panel room arrives (~January 2027).

**Target ranges** (stored in settings, explicitly marked "to be confirmed by your
grower/agronomist" — provisional, not final):
- Spawn run and case run: 22–25 °C
- Pinning and cropping: 14–18 °C, humidity 80–85%
- CO2 in pinning/cropping (once enabled): below 1000 ppm

**Instant alerts to the owner** (bypassing the evening summary): any
temperature/humidity/CO2 reading outside its target range, or picking "green mould,"
"white cobweb growth," or "brown spots" under problems.

## 9. Owner features

Single owner (Shashank), English, full access — no second/lighter owner tier.

1. **Evening summary, 9:00 pm, English** — every role that reported that day,
   problems first, with photos of any problem.
2. **Sunday weekly report** — bag condition by hut, hut work done, construction
   progress (running totals plus how much specifically happened that week), missed
   reports by anyone, anything awaiting weekly verification.
3. **On-demand commands, any time:** today's status; the last 7 days for any role or
   unit; the construction running total; "download everything as Excel" (produces an
   `.xlsx` file plus photos organized in matching folders).
4. The owner can post his own notes and photos into the bot at any time, outside the
   scheduled flows.
5. Two non-role, purely operational messages also go to the owner, described in §4:
   the 9 am "turn on the laptop" nudge and the 11:30 pm sleep-reminder loop. These
   keep the bot available; they are not farm-data features.

## 10. Data safety

1. Everything is stored in the single SQLite file on the laptop, with an automatic
   nightly backup to OneDrive (§4).
2. Only Telegram accounts the owner has explicitly approved can use the bot, each
   mapped to exactly one person/role. Anyone else is ignored, and the owner is told.
3. The bot's secret access token lives only in the settings file, never in code, and
   is never shared.
4. The bot starts itself on Windows startup, restarts itself if it crashes, and tells
   the owner if it was down (via the startup-confirmation mechanism in §4).
5. No paid AI service runs inside the bot — plain, reliable logic only. Any future
   Claude-based analysis is a separate later step that reads the stored data.
6. Stored data is never deleted or overwritten without the owner's explicit say-so.

## 11. Onboarding

- All four workers are currently on WhatsApp, not Telegram. The owner will send a
  short, plain-Hindi WhatsApp message asking each of them to install Telegram and
  then message the bot — drafted separately from this document, at onboarding time.
- Each person's numeric Telegram ID (a harmless public number, not a password) is
  collected during the BotFather walkthrough — the click-by-click process of creating
  the bot itself, done together with the owner — and entered into `settings.yaml`.
  No password or login is ever required from anyone.

## 12. Testing plan

Before each phase is handed to the owner to test on his own phone, and exercised by
the implementer as well:
- Wrong/impossible inputs (rejected politely, re-asked)
- Missing photos (entry cannot complete without the required photo(s))
- Skipped or out-of-order questions
- Corrections made after an entry is already locked (new linked entry, original
  untouched)
- Missed scheduled reports (reminder → reminder → tell owner escalation)
- Two people submitting at the same time
- The laptop/bot restarting mid-conversation

## 13. Build order and final deliverables

1. **Phase 1:** Anuragh and Nitish.
2. **Phase 2:** Ajay, including the opening balance and weekly verification. Chandan's
   Mode A (construction-mode, reusing Ajay's flow) can go live as soon as this phase
   is stable.
3. **Phase 3:** Chandan's Mode B (full supervisor checklist), switched on only when
   the owner says the mushroom/compost has been delivered.

At the end:
- One-page Hindi guide per worker role (Anuragh, Nitish, Ajay, Chandan), simple
  enough to read on a phone.
- One-page English guide for the owner: adding a person/unit/role, changing
  questions or target ranges, verifying contractor entries, downloading data, and
  what to do if the bot stops.

## 14. Open items carried into the build (not blocking, flagged for awareness)

- Exact Hindi phrasing for every worker-facing question will be drafted during the
  build and should be checked with each worker — especially Ajay, given his
  educational background — before that phase's on-phone testing.
- Target environmental ranges in §8.2 are provisional pending the owner's
  grower/agronomist confirming them.
- Ajay's "which wall" free-text answers are unstructured by design; a per-building
  breakdown of construction progress is read manually from these descriptions, not
  computed automatically.
