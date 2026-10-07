# Infrastructure & Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running, always-available Telegram bot shell — project scaffolding, settings, database, access control, photo storage, shared conversation helpers, and the laptop-availability infrastructure (auto-start, backups, morning nudge, night sleep reminder) — with no farm-data roles yet. This is the foundation the next plan (Anuragh and Nitish's actual question flows) builds on.

**Architecture:** A single Python process using `python-telegram-bot` (async, v21) polling Telegram's servers, backed by one SQLite file. Settings (who's allowed in, units, schedules) live in a YAML file, never in code. Every piece is a small, independently-testable module under `bot/`, wired together in `bot/main.py`.

**Tech Stack:** Python 3.11+, python-telegram-bot 21.6, PyYAML, SQLite (via the standard `sqlite3` module), pytest + pytest-asyncio, PowerShell (Windows Task Scheduler + power settings), GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-10-07-telegram-mushroom-farm-bot-design.md](../specs/2026-10-07-telegram-mushroom-farm-bot-design.md) — this plan implements §3 (core technical architecture), §4 (infrastructure), §10 (data safety), and §11 (onboarding, partially — the BotFather walkthrough itself is NOT a task in this plan; see the note under Task 1).

## Global Constraints

- All scheduling and timestamps use **Asia/Kolkata** (IST). (Spec §1, rule 9)
- **Entries are immutable.** The database layer must never `UPDATE` or `DELETE` a row in `entry`; corrections are new rows with `corrects_entry_id` pointing at the original. (Spec §1 rule 6, §3.6)
- **Photos are kept exactly as received**, organized by role/person/date, never compressed or altered. (Spec §1 rule 7, §3.4)
- The bot's access token and all secrets live **only** in `config/settings.yaml`, which is gitignored. Nothing secret is ever committed or hardcoded. (Spec §3.5, §10.3)
- Only Telegram accounts explicitly listed in `settings.yaml` may use the bot. Anyone else is silently told the bot is private, and the owner is alerted. (Spec §3.5, §10.2)
- The live bot and its database live at `D:\MushroomFarmBot`, deliberately **outside** the OneDrive-synced folder (`D:\OneDrive`), to avoid OneDrive syncing a file the bot is actively writing. Nightly backups are copied **into** `D:\OneDrive\MushroomFarmBot-Backups`. (Spec §4)
- This project is entirely separate from the current repository (the JavaScript mandi-price tracker) **except** for one GitHub Actions workflow file, which intentionally lives in *this* repository because it already has Actions configured. (Spec §4, Task 9 below)

---

### Before Task 1: the BotFather walkthrough (not a plan task)

Getting a real bot token requires the owner to interact live with Telegram on his own phone — no subagent or automated test can do this. **This must happen with the owner directly, in conversation, before Task 6's manual verification step and before Task 7 can be meaningfully tested.** It is not one of the numbered tasks below because it produces no code and has no automated test cycle. All automated tests in this plan use a fake token (e.g. `"123:ABC"`) and never contact Telegram's real servers.

---

### Task 1: Project scaffolding and settings loader

**Files:**
- Create: `D:\MushroomFarmBot\requirements.txt`
- Create: `D:\MushroomFarmBot\.gitignore`
- Create: `D:\MushroomFarmBot\pytest.ini`
- Create: `D:\MushroomFarmBot\config\settings.example.yaml`
- Create: `D:\MushroomFarmBot\bot\__init__.py`
- Create: `D:\MushroomFarmBot\bot\config.py`
- Create: `D:\MushroomFarmBot\scripts\__init__.py`
- Test: `D:\MushroomFarmBot\tests\test_config.py`

**Interfaces:**
- Produces: `bot.config.Settings` (dataclass: `bot_token: str`, `timezone: str`, `owner: Person`, `people: list[Person]`, `units: list[Unit]`, method `person_by_telegram_id(telegram_id: int) -> Person | None`), `bot.config.Person` (dataclass: `telegram_id: int`, `name: str`, `role: str`, `language: str`, `active: bool = True`), `bot.config.Unit` (dataclass: `id: str`, `name: str`, `co2_enabled: bool = False`), `bot.config.load_settings(path: Path) -> Settings`, `bot.config.SettingsError`. Every later task imports these.

- [ ] **Step 1: Create the project folders and initialize git**

```bash
mkdir -p "D:/MushroomFarmBot/bot" "D:/MushroomFarmBot/config" "D:/MushroomFarmBot/scripts" "D:/MushroomFarmBot/tests" "D:/MushroomFarmBot/data" "D:/MushroomFarmBot/photos"
cd "D:/MushroomFarmBot"
git init
```

- [ ] **Step 2: Write the requirements, gitignore, and pytest config**

`requirements.txt`:
```
python-telegram-bot==21.6
PyYAML==6.0.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

`.gitignore`:
```
config/settings.yaml
data/
photos/
__pycache__/
*.pyc
.pytest_cache/
```

`pytest.ini`:
```ini
[pytest]
pythonpath = .
```

- [ ] **Step 3: Install dependencies**

```bash
pip install -r requirements.txt
```

- [ ] **Step 4: Write the failing test for the settings loader**

`tests/test_config.py`:
```python
import textwrap
import pytest
from bot.config import load_settings, SettingsError


def write_settings(tmp_path, content):
    path = tmp_path / "settings.yaml"
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


VALID_SETTINGS = """
bot:
  token: "123:ABC"
  timezone: "Asia/Kolkata"
owner:
  telegram_id: 111
  name: "Shashank"
  language: "en"
people:
  - telegram_id: 222
    name: "Anuragh"
    role: "compost_supplier"
    language: "hi"
units:
  - id: "hut1"
    name: "Hut 1"
"""


def test_loads_valid_settings(tmp_path):
    path = write_settings(tmp_path, VALID_SETTINGS)
    settings = load_settings(path)
    assert settings.bot_token == "123:ABC"
    assert settings.owner.telegram_id == 111
    assert settings.people[0].name == "Anuragh"
    assert settings.units[0].id == "hut1"


def test_person_by_telegram_id_finds_owner(tmp_path):
    path = write_settings(tmp_path, VALID_SETTINGS)
    settings = load_settings(path)
    found = settings.person_by_telegram_id(111)
    assert found is not None
    assert found.role == "owner"


def test_person_by_telegram_id_finds_worker(tmp_path):
    path = write_settings(tmp_path, VALID_SETTINGS)
    settings = load_settings(path)
    found = settings.person_by_telegram_id(222)
    assert found is not None
    assert found.name == "Anuragh"


def test_person_by_telegram_id_returns_none_for_unknown(tmp_path):
    path = write_settings(tmp_path, VALID_SETTINGS)
    settings = load_settings(path)
    assert settings.person_by_telegram_id(999) is None


def test_missing_token_raises(tmp_path):
    content = VALID_SETTINGS.replace('token: "123:ABC"', 'token: ""')
    path = write_settings(tmp_path, content)
    with pytest.raises(SettingsError):
        load_settings(path)


def test_missing_top_level_key_raises(tmp_path):
    path = write_settings(tmp_path, "bot:\n  token: \"x\"\n")
    with pytest.raises(SettingsError):
        load_settings(path)
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bot.config'` (or similar import error).

- [ ] **Step 6: Write the settings loader**

`bot/__init__.py`: (empty file)

`bot/config.py`:
```python
from __future__ import annotations
import dataclasses
from pathlib import Path
import yaml


class SettingsError(Exception):
    """Raised when settings.yaml is missing required fields."""


@dataclasses.dataclass
class Person:
    telegram_id: int
    name: str
    role: str
    language: str
    active: bool = True


@dataclasses.dataclass
class Unit:
    id: str
    name: str
    co2_enabled: bool = False


@dataclasses.dataclass
class Settings:
    bot_token: str
    timezone: str
    owner: Person
    people: list[Person]
    units: list[Unit]

    def person_by_telegram_id(self, telegram_id: int) -> Person | None:
        if self.owner.telegram_id == telegram_id:
            return self.owner
        for person in self.people:
            if person.telegram_id == telegram_id:
                return person
        return None


REQUIRED_TOP_LEVEL_KEYS = ("bot", "owner", "people", "units")


def load_settings(path: Path) -> Settings:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    if raw is None:
        raise SettingsError(f"{path} is empty")

    missing = [key for key in REQUIRED_TOP_LEVEL_KEYS if key not in raw]
    if missing:
        raise SettingsError(f"{path} is missing required keys: {missing}")

    bot_section = raw["bot"]
    if not bot_section.get("token"):
        raise SettingsError("bot.token is required in settings.yaml")

    owner_raw = raw["owner"]
    owner = Person(
        telegram_id=int(owner_raw["telegram_id"]),
        name=owner_raw["name"],
        role="owner",
        language=owner_raw.get("language", "en"),
    )

    people = [
        Person(
            telegram_id=int(p["telegram_id"]),
            name=p["name"],
            role=p["role"],
            language=p["language"],
            active=bool(p.get("active", True)),
        )
        for p in raw["people"]
    ]

    units = [
        Unit(
            id=u["id"],
            name=u["name"],
            co2_enabled=bool(u.get("co2_enabled", False)),
        )
        for u in raw["units"]
    ]

    return Settings(
        bot_token=bot_section["token"],
        timezone=bot_section.get("timezone", "Asia/Kolkata"),
        owner=owner,
        people=people,
        units=units,
    )
```

`scripts/__init__.py`: (empty file)

`config/settings.example.yaml`:
```yaml
bot:
  token: "PASTE_YOUR_BOTFATHER_TOKEN_HERE"
  timezone: "Asia/Kolkata"

owner:
  telegram_id: 0
  name: "Shashank"
  language: "en"

people:
  - telegram_id: 0
    name: "Anuragh"
    role: "compost_supplier"
    language: "hi"
    active: true
  - telegram_id: 0
    name: "Nitish"
    role: "hut_maker"
    language: "hi"
    active: true

units:
  - id: "hut1"
    name: "Hut 1"
    co2_enabled: false
  - id: "hut2"
    name: "Hut 2"
    co2_enabled: false
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pytest tests/test_config.py -v`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: add project scaffolding and settings loader"
```

---

### Task 2: Database schema and repository layer

**Files:**
- Create: `D:\MushroomFarmBot\bot\db.py`
- Test: `D:\MushroomFarmBot\tests\test_db.py`

**Interfaces:**
- Consumes: nothing from Task 1 directly (this module is standalone).
- Produces: `bot.db.connect(db_path: Path) -> sqlite3.Connection`, `bot.db.save_entry(conn, person_id: int, role: str, payload: dict, unit_id: str | None = None, photo_paths: list[str] | None = None, corrects_entry_id: int | None = None) -> int`, `bot.db.get_entry(conn, entry_id: int) -> sqlite3.Row | None`, `bot.db.entries_for_role_on_date(conn, role: str, date_str: str) -> list[sqlite3.Row]`, `bot.db.entries_for_person_since(conn, person_id: int, since_iso: str) -> list[sqlite3.Row]`. All later tasks that persist data use these.

- [ ] **Step 1: Write the failing tests**

`tests/test_db.py`:
```python
import json
from bot import db


def test_connect_creates_tables(tmp_path):
    conn = db.connect(tmp_path / "farm.db")
    tables = {
        row["name"]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert {"person", "unit", "entry", "verification", "owner_note", "reminder_state"} <= tables


def test_save_and_get_entry(tmp_path):
    conn = db.connect(tmp_path / "farm.db")
    entry_id = db.save_entry(
        conn,
        person_id=222,
        role="compost_supplier",
        payload={"bags": 1050},
        unit_id="hut1",
        photo_paths=["photos/anuragh/2026-10-07/1.jpg"],
    )
    row = db.get_entry(conn, entry_id)
    assert row["person_id"] == 222
    assert json.loads(row["payload"])["bags"] == 1050
    assert row["corrects_entry_id"] is None


def test_correction_links_to_original_without_altering_it(tmp_path):
    conn = db.connect(tmp_path / "farm.db")
    original_id = db.save_entry(conn, person_id=222, role="compost_supplier", payload={"bags": 1050})
    correction_id = db.save_entry(
        conn, person_id=222, role="compost_supplier", payload={"bags": 1000},
        corrects_entry_id=original_id,
    )
    corrected_row = db.get_entry(conn, correction_id)
    assert corrected_row["corrects_entry_id"] == original_id
    original_row = db.get_entry(conn, original_id)
    assert json.loads(original_row["payload"])["bags"] == 1050


def test_entries_for_role_on_date_filters_correctly(tmp_path):
    conn = db.connect(tmp_path / "farm.db")
    entry_id = db.save_entry(conn, person_id=222, role="compost_supplier", payload={"bags": 1050})
    row = db.get_entry(conn, entry_id)
    date_str = row["received_at"][:10]
    results = db.entries_for_role_on_date(conn, "compost_supplier", date_str)
    assert len(results) == 1
    assert results[0]["entry_id"] == entry_id
    assert db.entries_for_role_on_date(conn, "hut_maker", date_str) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bot.db'`

- [ ] **Step 3: Write the database module**

`bot/db.py`:
```python
from __future__ import annotations
import sqlite3
import json
import datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS person (
    telegram_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    language TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS unit (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    co2_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entry (
    entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    unit_id TEXT,
    role TEXT NOT NULL,
    received_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    photo_paths TEXT NOT NULL DEFAULT '[]',
    corrects_entry_id INTEGER
);

CREATE TABLE IF NOT EXISTS verification (
    verification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    verified_by INTEGER NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS owner_note (
    note_id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL,
    text TEXT,
    photo_paths TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS reminder_state (
    person_id INTEGER NOT NULL,
    schedule_name TEXT NOT NULL,
    last_reminded_at TEXT,
    escalation_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (person_id, schedule_name)
);
"""


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def utc_now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save_entry(
    conn: sqlite3.Connection,
    person_id: int,
    role: str,
    payload: dict,
    unit_id: str | None = None,
    photo_paths: list[str] | None = None,
    corrects_entry_id: int | None = None,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO entry (person_id, unit_id, role, received_at, payload, photo_paths, corrects_entry_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            person_id,
            unit_id,
            role,
            utc_now_iso(),
            json.dumps(payload),
            json.dumps(photo_paths or []),
            corrects_entry_id,
        ),
    )
    conn.commit()
    return cur.lastrowid


def get_entry(conn: sqlite3.Connection, entry_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM entry WHERE entry_id = ?", (entry_id,)).fetchone()


def entries_for_role_on_date(conn: sqlite3.Connection, role: str, date_str: str) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM entry WHERE role = ? AND received_at LIKE ? ORDER BY received_at",
        (role, f"{date_str}%"),
    ).fetchall()


def entries_for_person_since(conn: sqlite3.Connection, person_id: int, since_iso: str) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM entry WHERE person_id = ? AND received_at >= ? ORDER BY received_at",
        (person_id, since_iso),
    ).fetchall()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_db.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add bot/db.py tests/test_db.py
git commit -m "feat: add SQLite schema and append-only entry repository"
```

---

### Task 3: Access control

**Files:**
- Create: `D:\MushroomFarmBot\bot\access_control.py`
- Test: `D:\MushroomFarmBot\tests\test_access_control.py`

**Interfaces:**
- Consumes: `bot.config.Settings`, `bot.config.Person` (Task 1).
- Produces: `bot.access_control.authorize(settings: Settings, telegram_id: int, username: str | None = None) -> Person` (raises `AccessDenied`), `bot.access_control.AccessDenied` (has `.telegram_id`, `.username`), `bot.access_control.format_unknown_sender_alert(telegram_id: int, username: str | None) -> str`. Task 6 (bot entry point) uses both.

- [ ] **Step 1: Write the failing tests**

`tests/test_access_control.py`:
```python
import pytest
from bot.config import Settings, Person, Unit
from bot.access_control import authorize, AccessDenied, format_unknown_sender_alert


def make_settings():
    return Settings(
        bot_token="x",
        timezone="Asia/Kolkata",
        owner=Person(telegram_id=111, name="Shashank", role="owner", language="en"),
        people=[
            Person(telegram_id=222, name="Anuragh", role="compost_supplier", language="hi"),
            Person(telegram_id=333, name="Retired", role="hut_maker", language="hi", active=False),
        ],
        units=[Unit(id="hut1", name="Hut 1")],
    )


def test_authorize_allows_known_active_person():
    settings = make_settings()
    person = authorize(settings, 222)
    assert person.name == "Anuragh"


def test_authorize_allows_owner():
    settings = make_settings()
    person = authorize(settings, 111)
    assert person.role == "owner"


def test_authorize_rejects_unknown_id():
    settings = make_settings()
    with pytest.raises(AccessDenied):
        authorize(settings, 999)


def test_authorize_rejects_inactive_person():
    settings = make_settings()
    with pytest.raises(AccessDenied):
        authorize(settings, 333)


def test_format_unknown_sender_alert_includes_id_and_username():
    message = format_unknown_sender_alert(999, "randomuser")
    assert "999" in message
    assert "randomuser" in message


def test_format_unknown_sender_alert_handles_missing_username():
    message = format_unknown_sender_alert(999, None)
    assert "no username" in message
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_access_control.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bot.access_control'`

- [ ] **Step 3: Write the access control module**

`bot/access_control.py`:
```python
from __future__ import annotations
from bot.config import Settings, Person


class AccessDenied(Exception):
    def __init__(self, telegram_id: int, username: str | None):
        self.telegram_id = telegram_id
        self.username = username
        super().__init__(f"Unknown Telegram account: {telegram_id} ({username})")


def authorize(settings: Settings, telegram_id: int, username: str | None = None) -> Person:
    person = settings.person_by_telegram_id(telegram_id)
    if person is None or not person.active:
        raise AccessDenied(telegram_id, username)
    return person


def format_unknown_sender_alert(telegram_id: int, username: str | None) -> str:
    who = f"@{username}" if username else "no username"
    return (
        "⚠️ Someone not on your approved list just tried to use the bot.\n"
        f"Telegram ID: {telegram_id} ({who})"
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_access_control.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add bot/access_control.py tests/test_access_control.py
git commit -m "feat: add Telegram allow-list access control"
```

---

### Task 4: Photo storage helper

**Files:**
- Create: `D:\MushroomFarmBot\bot\photos.py`
- Test: `D:\MushroomFarmBot\tests\test_photos.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `bot.photos.photo_directory(root: Path, role: str, person_name: str, when: datetime.datetime) -> Path`, `bot.photos.next_photo_filename(existing_count: int, when: datetime.datetime) -> str`, `async bot.photos.save_telegram_photo(bot, file_id: str, destination: Path) -> Path`. The role-flow tasks in the next plan use all three.

- [ ] **Step 1: Write the failing tests**

`tests/test_photos.py`:
```python
import datetime
from unittest.mock import AsyncMock
import pytest
from bot.photos import photo_directory, next_photo_filename, save_telegram_photo


def test_photo_directory_builds_role_person_date_path(tmp_path):
    when = datetime.datetime(2026, 10, 7, 14, 30, 0)
    result = photo_directory(tmp_path, "compost_supplier", "Anuragh", when)
    assert result == tmp_path / "compost_supplier" / "Anuragh" / "2026-10-07"


def test_next_photo_filename_increments_and_uses_time():
    when = datetime.datetime(2026, 10, 7, 14, 30, 5)
    assert next_photo_filename(0, when) == "143005_1.jpg"
    assert next_photo_filename(2, when) == "143005_3.jpg"


@pytest.mark.asyncio
async def test_save_telegram_photo_downloads_to_destination(tmp_path):
    fake_file = AsyncMock()
    fake_bot = AsyncMock()
    fake_bot.get_file.return_value = fake_file
    destination = tmp_path / "compost_supplier" / "Anuragh" / "2026-10-07" / "143005_1.jpg"

    result = await save_telegram_photo(fake_bot, "FILE123", destination)

    fake_bot.get_file.assert_awaited_once_with("FILE123")
    fake_file.download_to_drive.assert_awaited_once_with(custom_path=str(destination))
    assert result == destination
    assert destination.parent.exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_photos.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bot.photos'`

- [ ] **Step 3: Write the photo storage module**

`bot/photos.py`:
```python
from __future__ import annotations
import datetime
from pathlib import Path


def photo_directory(root: Path, role: str, person_name: str, when: datetime.datetime) -> Path:
    date_str = when.strftime("%Y-%m-%d")
    return root / role / person_name / date_str


def next_photo_filename(existing_count: int, when: datetime.datetime) -> str:
    timestamp = when.strftime("%H%M%S")
    return f"{timestamp}_{existing_count + 1}.jpg"


async def save_telegram_photo(bot, file_id: str, destination: Path) -> Path:
    """Downloads a Telegram photo (by file_id) to `destination`, unchanged."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    telegram_file = await bot.get_file(file_id)
    await telegram_file.download_to_drive(custom_path=str(destination))
    return destination
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_photos.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add bot/photos.py tests/test_photos.py
git commit -m "feat: add photo storage helper"
```

---

### Task 5: Shared conversation helpers

**Files:**
- Create: `D:\MushroomFarmBot\bot\conversation_helpers.py`
- Test: `D:\MushroomFarmBot\tests\test_conversation_helpers.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `bot.conversation_helpers.build_keyboard(options: list[str], multi_select: bool = False, selected: set[str] | None = None) -> InlineKeyboardMarkup`, `bot.conversation_helpers.parse_decimal(text: str) -> float` (raises `InvalidNumber`), `bot.conversation_helpers.parse_positive_int(text: str) -> int` (raises `InvalidNumber`), `bot.conversation_helpers.format_summary(lines: list[tuple[str, str]]) -> str`, `bot.conversation_helpers.InvalidNumber`. The role-flow tasks in the next plan use all of these for every button menu, number entry, and confirm-before-save step (spec §1 rules 3–5).

- [ ] **Step 1: Write the failing tests**

`tests/test_conversation_helpers.py`:
```python
import pytest
from bot.conversation_helpers import (
    build_keyboard, parse_decimal, parse_positive_int, format_summary, InvalidNumber,
)


def test_build_keyboard_single_select_has_plain_labels():
    markup = build_keyboard(["Yes", "No"])
    labels = [button.text for row in markup.inline_keyboard for button in row]
    assert labels == ["Yes", "No"]


def test_build_keyboard_multi_select_marks_selected_and_adds_done():
    markup = build_keyboard(["A", "B", "C"], multi_select=True, selected={"B"})
    labels = [button.text for row in markup.inline_keyboard for button in row]
    assert labels == ["A", "✅ B", "C", "Done ➡️"]


def test_parse_decimal_accepts_dot():
    assert parse_decimal("3.5") == 3.5


def test_parse_decimal_accepts_comma():
    assert parse_decimal("3,5") == 3.5


def test_parse_decimal_rejects_negative():
    with pytest.raises(InvalidNumber):
        parse_decimal("-1")


def test_parse_decimal_rejects_garbage():
    with pytest.raises(InvalidNumber):
        parse_decimal("abc")


def test_parse_positive_int_accepts_whole_number():
    assert parse_positive_int("1050") == 1050


def test_parse_positive_int_rejects_zero():
    with pytest.raises(InvalidNumber):
        parse_positive_int("0")


def test_parse_positive_int_rejects_decimal():
    with pytest.raises(InvalidNumber):
        parse_positive_int("10.5")


def test_format_summary_lists_each_answer():
    summary = format_summary([("Hut", "Hut 1"), ("Bags", "1050")])
    assert "Hut: Hut 1" in summary
    assert "Bags: 1050" in summary
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_conversation_helpers.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bot.conversation_helpers'`

- [ ] **Step 3: Write the conversation helpers module**

`bot/conversation_helpers.py`:
```python
from __future__ import annotations
from telegram import InlineKeyboardButton, InlineKeyboardMarkup


class InvalidNumber(Exception):
    pass


def build_keyboard(options: list[str], multi_select: bool = False, selected: set[str] | None = None) -> InlineKeyboardMarkup:
    selected = selected or set()
    rows = []
    for option in options:
        label = f"✅ {option}" if multi_select and option in selected else option
        rows.append([InlineKeyboardButton(label, callback_data=option)])
    if multi_select:
        rows.append([InlineKeyboardButton("Done ➡️", callback_data="__done__")])
    return InlineKeyboardMarkup(rows)


def parse_decimal(text: str) -> float:
    cleaned = text.strip().replace(",", ".")
    try:
        value = float(cleaned)
    except ValueError:
        raise InvalidNumber(f"'{text}' is not a number")
    if value < 0:
        raise InvalidNumber(f"'{text}' cannot be negative")
    return value


def parse_positive_int(text: str) -> int:
    cleaned = text.strip()
    if not cleaned.isdigit():
        raise InvalidNumber(f"'{text}' is not a whole number")
    value = int(cleaned)
    if value <= 0:
        raise InvalidNumber(f"'{text}' must be more than zero")
    return value


def format_summary(lines: list[tuple[str, str]]) -> str:
    """lines: list of (question, answer) pairs."""
    body = "\n".join(f"{q}: {a}" for q, a in lines)
    return f"Please check before I save this:\n\n{body}\n\nIs this correct?"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_conversation_helpers.py -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add bot/conversation_helpers.py tests/test_conversation_helpers.py
git commit -m "feat: add shared button, number-parsing, and summary helpers"
```

---

### Task 6: Bot entry point and startup confirmation

**Files:**
- Create: `D:\MushroomFarmBot\bot\main.py`
- Test: `D:\MushroomFarmBot\tests\test_main.py`

**Interfaces:**
- Consumes: `bot.config.load_settings` (Task 1), `bot.access_control.authorize`, `bot.access_control.AccessDenied`, `bot.access_control.format_unknown_sender_alert` (Task 3), `bot.db.connect` (Task 2).
- Produces: `bot.main.start(update, context)` (the `/start` handler), `bot.main.notify_owner_started(application)`, `bot.main.build_application() -> Application`, `bot.main.main()`. Task 9 (startup confirmation) and Task 10 (night reminder registration) both modify this file.

- [ ] **Step 1: Write the failing tests**

`tests/test_main.py`:
```python
from unittest.mock import AsyncMock, MagicMock
import pytest
from bot.config import Settings, Person, Unit
from bot.main import start


def make_settings():
    return Settings(
        bot_token="x",
        timezone="Asia/Kolkata",
        owner=Person(telegram_id=111, name="Shashank", role="owner", language="en"),
        people=[Person(telegram_id=222, name="Anuragh", role="compost_supplier", language="hi")],
        units=[Unit(id="hut1", name="Hut 1")],
    )


def make_update(telegram_id: int, username: str | None = "someuser"):
    update = MagicMock()
    update.effective_user.id = telegram_id
    update.effective_user.username = username
    update.message.reply_text = AsyncMock()
    return update


def make_context(settings):
    context = MagicMock()
    context.bot_data = {"settings": settings}
    context.bot.send_message = AsyncMock()
    return context


@pytest.mark.asyncio
async def test_start_greets_known_person():
    settings = make_settings()
    update = make_update(222)
    context = make_context(settings)

    await start(update, context)

    update.message.reply_text.assert_awaited_once()
    (text,), _ = update.message.reply_text.call_args
    assert "Anuragh" in text


@pytest.mark.asyncio
async def test_start_rejects_unknown_person_and_alerts_owner():
    settings = make_settings()
    update = make_update(999, username="stranger")
    context = make_context(settings)

    await start(update, context)

    update.message.reply_text.assert_awaited_once()
    context.bot.send_message.assert_awaited_once()
    kwargs = context.bot.send_message.call_args.kwargs
    assert kwargs["chat_id"] == 111
    assert "999" in kwargs["text"]
    assert "stranger" in kwargs["text"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_main.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bot.main'`

- [ ] **Step 3: Write the bot entry point**

`bot/main.py`:
```python
from __future__ import annotations
import logging
from pathlib import Path

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

from bot.config import load_settings
from bot.access_control import authorize, AccessDenied, format_unknown_sender_alert
from bot import db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = PROJECT_ROOT / "config" / "settings.yaml"
DB_PATH = PROJECT_ROOT / "data" / "farm.db"


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    settings = context.bot_data["settings"]
    telegram_id = update.effective_user.id
    try:
        person = authorize(settings, telegram_id, update.effective_user.username)
    except AccessDenied:
        await update.message.reply_text(
            "Sorry, this bot is private and your account isn't on the approved list."
        )
        owner = settings.owner
        alert = format_unknown_sender_alert(telegram_id, update.effective_user.username)
        await context.bot.send_message(chat_id=owner.telegram_id, text=alert)
        return

    await update.message.reply_text(f"Hello {person.name}, the bot is working.")


async def notify_owner_started(application: Application) -> None:
    settings = application.bot_data["settings"]
    await application.bot.send_message(
        chat_id=settings.owner.telegram_id,
        text="✅ I'm up and running.",
    )


def build_application() -> Application:
    settings = load_settings(SETTINGS_PATH)
    application = Application.builder().token(settings.bot_token).post_init(notify_owner_started).build()
    application.bot_data["settings"] = settings
    application.bot_data["db"] = db.connect(DB_PATH)
    application.add_handler(CommandHandler("start", start))
    return application


def main() -> None:
    application = build_application()
    logger.info("Bot starting...")
    application.run_polling()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_main.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add bot/main.py tests/test_main.py
git commit -m "feat: add bot entry point with /start handler"
```

- [ ] **Step 6: Manual verification with the owner (requires a real BotFather token)**

This step cannot be automated — it needs the owner's real phone and the token from the BotFather walkthrough (see the note before Task 1).

1. Copy `config/settings.example.yaml` to `config/settings.yaml` and fill in the real `bot.token`, the owner's real Telegram ID, and Anuragh's real Telegram ID.
2. Run `python -m bot.main` from `D:\MushroomFarmBot`.
3. From the owner's Telegram account, send `/start` to the bot — confirm it replies "Hello Shashank, the bot is working." *(Note: the current `start` handler greets by whatever name is in settings — the owner will see his own name once his real ID is in `settings.yaml`.)*
4. Confirm the owner also receives "✅ I'm up and running." shortly after the bot starts.
5. From a different, unlisted Telegram account, send `/start` — confirm that account gets the "this bot is private" message, and the owner receives the unknown-sender alert with the correct ID.

---

### Task 7: Windows Task Scheduler automation and power plan

**Files:**
- Create: `D:\MushroomFarmBot\scripts\register_task_scheduler.ps1`

**Interfaces:**
- Consumes: nothing (standalone PowerShell script).
- Produces: a registered Windows Scheduled Task named `MushroomFarmBot`, and a changed AC power plan (no auto-sleep). No Python interface — nothing else in this plan imports this script.

This task changes real operating-system state, so it has no `pytest` cycle. Its "test" is the manual verification checklist in Step 2.

- [ ] **Step 1: Write the registration script**

`scripts/register_task_scheduler.ps1`:
```powershell
# Run this once, from an elevated PowerShell prompt, to make the bot start
# automatically at logon and restart itself if it ever crashes.

$taskName = "MushroomFarmBot"
$pythonExe = (Get-Command python).Source
$workingDirectory = "D:\MushroomFarmBot"

$action = New-ScheduledTaskAction -Execute $pythonExe -Argument "-m bot.main" -WorkingDirectory $workingDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force

# Stop the laptop sleeping on its own while plugged in, so the bot stays reachable.
# It will still sleep when the owner deliberately puts it to sleep.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Write-Host "Task '$taskName' registered. Bot will auto-start at logon and restart on crash."
```

- [ ] **Step 2: Manual verification checklist**

1. Run the script from an elevated PowerShell prompt: `powershell -ExecutionPolicy Bypass -File scripts\register_task_scheduler.ps1`
2. Run `Get-ScheduledTask -TaskName MushroomFarmBot` — confirm it exists and `State` is `Ready`.
3. Log off and log back on — confirm a `python` process running `bot.main` appears (`Get-Process python`).
4. Run `Stop-Process` on that process and confirm Task Scheduler restarts it within about a minute.
5. Run `powercfg /query` and confirm the AC standby and hibernate timeouts now show `0` (never).

- [ ] **Step 3: Commit**

```bash
git add scripts/register_task_scheduler.ps1
git commit -m "feat: add Windows Task Scheduler auto-start/restart script"
```

---

### Task 8: Nightly backup to OneDrive

**Files:**
- Create: `D:\MushroomFarmBot\scripts\backup.py`
- Test: `D:\MushroomFarmBot\tests\test_backup.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (operates on plain file paths).
- Produces: `scripts.backup.backup_database(db_path: Path, backup_root: Path, when: datetime.datetime) -> Path`, `scripts.backup.backup_new_photos(photos_path: Path, backup_root: Path, when: datetime.datetime) -> int`, `scripts.backup.run_backup() -> None`. Nothing else in this plan imports these; Task Scheduler calls `run_backup()` nightly per Step 4 below.

- [ ] **Step 1: Write the failing tests**

`tests/test_backup.py`:
```python
import datetime
from scripts.backup import backup_database, backup_new_photos


def test_backup_database_copies_file_into_dated_folder(tmp_path):
    source_db = tmp_path / "source" / "farm.db"
    source_db.parent.mkdir(parents=True)
    source_db.write_text("fake db contents")
    backup_root = tmp_path / "backups"
    when = datetime.datetime(2026, 10, 7)

    destination = backup_database(source_db, backup_root, when)

    assert destination == backup_root / "2026-10-07" / "farm.db"
    assert destination.read_text() == "fake db contents"


def test_backup_new_photos_copies_only_new_files(tmp_path):
    photos_root = tmp_path / "photos"
    (photos_root / "compost_supplier" / "Anuragh" / "2026-10-07").mkdir(parents=True)
    photo_file = photos_root / "compost_supplier" / "Anuragh" / "2026-10-07" / "143005_1.jpg"
    photo_file.write_bytes(b"fake jpeg bytes")
    backup_root = tmp_path / "backups"
    when = datetime.datetime(2026, 10, 7)

    copied_count = backup_new_photos(photos_root, backup_root, when)
    assert copied_count == 1

    copied_again = backup_new_photos(photos_root, backup_root, when)
    assert copied_again == 0


def test_backup_new_photos_handles_missing_photos_folder(tmp_path):
    copied = backup_new_photos(tmp_path / "does-not-exist", tmp_path / "backups", datetime.datetime(2026, 10, 7))
    assert copied == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_backup.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.backup'`

- [ ] **Step 3: Write the backup script**

`scripts/backup.py`:
```python
from __future__ import annotations
import shutil
import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "farm.db"
PHOTOS_PATH = PROJECT_ROOT / "photos"
BACKUP_ROOT = Path(r"D:\OneDrive\MushroomFarmBot-Backups")


def backup_database(db_path: Path, backup_root: Path, when: datetime.datetime) -> Path:
    date_str = when.strftime("%Y-%m-%d")
    destination_dir = backup_root / date_str
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / "farm.db"
    shutil.copy2(db_path, destination)
    return destination


def backup_new_photos(photos_path: Path, backup_root: Path, when: datetime.datetime) -> int:
    date_str = when.strftime("%Y-%m-%d")
    destination_root = backup_root / date_str / "photos"
    copied = 0
    if not photos_path.exists():
        return copied
    for source_file in photos_path.rglob("*"):
        if source_file.is_file():
            relative = source_file.relative_to(photos_path)
            destination = destination_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists():
                shutil.copy2(source_file, destination)
                copied += 1
    return copied


def run_backup() -> None:
    now = datetime.datetime.now()
    backup_database(DB_PATH, BACKUP_ROOT, now)
    backup_new_photos(PHOTOS_PATH, BACKUP_ROOT, now)


if __name__ == "__main__":
    run_backup()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_backup.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Register the nightly backup in Task Scheduler and commit**

Add a second task via PowerShell (run once, elevated):
```powershell
$backupAction = New-ScheduledTaskAction -Execute (Get-Command python).Source -Argument "-m scripts.backup" -WorkingDirectory "D:\MushroomFarmBot"
$backupTrigger = New-ScheduledTaskTrigger -Daily -At 2:00am
Register-ScheduledTask -TaskName "MushroomFarmBotBackup" -Action $backupAction -Trigger $backupTrigger -Force
```

```bash
git add scripts/backup.py tests/test_backup.py
git commit -m "feat: add nightly database and photo backup script"
```

---

### Task 9: Morning laptop nudge (GitHub Actions)

**Files:**
- Create (in the **current repository**, `mushroom-tracker`, not `D:\MushroomFarmBot`): `.github/workflows/morning-nudge.yml`

**Interfaces:**
- Consumes: nothing from this plan's Python code — this is a standalone GitHub Actions workflow that calls the Telegram HTTP API directly with `curl`.
- Produces: a scheduled GitHub Actions job. Nothing else in this plan depends on it. (The other half of this feature — the bot's own "I'm up and running" startup message — was already built in Task 6.)

**Scope note, flagged per the spec's §4 (read before implementing):** the spec describes an escalation where, if the bot's "I'm up and running" confirmation hasn't been seen within ~90 minutes, the nudge fires again and then alerts the owner directly. Building that reliably requires a piece of shared state GitHub Actions (running in the cloud) can check against the laptop (on a home network) — there's no simple, free way to do this without extra infrastructure (e.g. a small hosted status endpoint) disproportionate to the benefit. **This task implements the simple version only: one nudge at 9:00 am.** The owner will notice himself if "I'm up and running" doesn't arrive by mid-morning. Revisit with real infrastructure only if this turns out to be a frequent problem in practice.

- [ ] **Step 1: Write the workflow file**

`.github/workflows/morning-nudge.yml` (in the `mushroom-tracker` repository root):
```yaml
name: Morning laptop nudge

on:
  schedule:
    - cron: "30 3 * * *"  # 09:00 Asia/Kolkata = 03:30 UTC
  workflow_dispatch: {}

jobs:
  nudge:
    runs-on: ubuntu-latest
    steps:
      - name: Send Telegram reminder
        env:
          BOT_TOKEN: ${{ secrets.FARM_BOT_TOKEN }}
          OWNER_CHAT_ID: ${{ secrets.FARM_BOT_OWNER_CHAT_ID }}
        run: |
          curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
            -d chat_id="${OWNER_CHAT_ID}" \
            -d text="☀️ Good morning! Please turn on the laptop so the farm bot can start."
```

- [ ] **Step 2: Register the GitHub Actions secrets (manual, in the GitHub web UI)**

1. In the `mushroom-tracker` repository: Settings → Secrets and variables → Actions → New repository secret.
2. Add `FARM_BOT_TOKEN` with the real bot token from BotFather.
3. Add `FARM_BOT_OWNER_CHAT_ID` with the owner's real numeric Telegram ID.

- [ ] **Step 3: Manual verification**

1. In the repository's Actions tab, select "Morning laptop nudge" → "Run workflow" (uses the `workflow_dispatch` trigger) to fire it immediately rather than waiting for 9 am.
2. Confirm the owner's Telegram receives "☀️ Good morning! Please turn on the laptop so the farm bot can start."

- [ ] **Step 4: Commit (in the `mushroom-tracker` repository, not `D:\MushroomFarmBot`)**

```bash
git add .github/workflows/morning-nudge.yml
git commit -m "ci: add morning Telegram nudge for the farm bot laptop"
```

---

### Task 10: Night sleep-reminder loop

**Files:**
- Create: `D:\MushroomFarmBot\bot\night_reminder.py`
- Modify: `D:\MushroomFarmBot\bot\main.py` (register the new handler and daily job; add a timezone-aware `Defaults` to the `Application` builder)
- Test: `D:\MushroomFarmBot\tests\test_night_reminder.py`

**Interfaces:**
- Consumes: `bot.config.Settings` (Task 1).
- Produces: `bot.night_reminder.send_sleep_check(application)`, `bot.night_reminder.handle_night_callback(update, context)`, `bot.night_reminder.register(application)`, plus the callback-data constants `CALLBACK_SLEPT_YES`, `CALLBACK_SLEPT_NO`, `CALLBACK_OUT_YES`, `CALLBACK_OUT_NO`, `CALLBACK_DURATION_PREFIX`. Nothing later in this plan depends on these, but the next plan's owner-features work may reuse `bot.night_reminder.register` as a pattern for other scheduled conversations.

**Important — timezone correctness:** `python-telegram-bot`'s `JobQueue` runs on APScheduler, which defaults to UTC. `run_daily(time=datetime.time(hour=23, minute=30))` will fire at 23:30 **UTC** (= 5:00 am IST) unless the `Application` has a timezone-aware default. Step 5 below fixes this by passing `Defaults(tzinfo=...)` when building the `Application` — do not skip it.

**Known limitation, flagged honestly:** whether tonight's reminder has already been confirmed is held in `application.bot_data` (in memory), not in the database. If the bot restarts between 11:30 pm and the owner confirming, it will ask once more after restarting. This is a deliberate simplification — the alternative (persisting to the `reminder_state` table from Task 2) is straightforward to add later if this turns out to matter in practice, but isn't worth the extra complexity now for a rare edge case with a low-stakes consequence (one extra question).

- [ ] **Step 1: Write the failing tests**

`tests/test_night_reminder.py`:
```python
import datetime
from unittest.mock import AsyncMock, MagicMock
import pytest
from bot.night_reminder import (
    handle_night_callback, send_sleep_check,
    CALLBACK_SLEPT_YES, CALLBACK_SLEPT_NO, CALLBACK_OUT_YES, CALLBACK_OUT_NO,
)
from bot.config import Settings, Person


def make_settings():
    return Settings(
        bot_token="x", timezone="Asia/Kolkata",
        owner=Person(telegram_id=111, name="Shashank", role="owner", language="en"),
        people=[], units=[],
    )


def make_application():
    application = MagicMock()
    application.bot_data = {"settings": make_settings()}
    application.bot.send_message = AsyncMock()
    return application


def make_update(callback_data):
    update = MagicMock()
    update.callback_query.answer = AsyncMock()
    update.callback_query.edit_message_text = AsyncMock()
    update.callback_query.data = callback_data
    return update


def make_context(application):
    context = MagicMock()
    context.application = application
    context.job_queue.run_once = MagicMock()
    return context


@pytest.mark.asyncio
async def test_send_sleep_check_sends_question_when_not_confirmed():
    application = make_application()
    await send_sleep_check(application)
    application.bot.send_message.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_sleep_check_skips_when_already_confirmed_today():
    application = make_application()
    application.bot_data["night_reminder_confirmed_date"] = datetime.date.today().isoformat()
    await send_sleep_check(application)
    application.bot.send_message.assert_not_awaited()


@pytest.mark.asyncio
async def test_yes_marks_confirmed_and_stops():
    application = make_application()
    update = make_update(CALLBACK_SLEPT_YES)
    context = make_context(application)

    await handle_night_callback(update, context)

    assert application.bot_data["night_reminder_confirmed_date"] == datetime.date.today().isoformat()
    update.callback_query.edit_message_text.assert_awaited_once()


@pytest.mark.asyncio
async def test_no_asks_if_out():
    application = make_application()
    update = make_update(CALLBACK_SLEPT_NO)
    context = make_context(application)

    await handle_night_callback(update, context)

    update.callback_query.edit_message_text.assert_awaited_once()
    args, kwargs = update.callback_query.edit_message_text.call_args
    assert "out" in args[0].lower()


@pytest.mark.asyncio
async def test_not_out_schedules_recheck_in_ten_minutes():
    application = make_application()
    update = make_update(CALLBACK_OUT_NO)
    context = make_context(application)

    await handle_night_callback(update, context)

    context.job_queue.run_once.assert_called_once()
    _, kwargs = context.job_queue.run_once.call_args
    assert kwargs["when"] == 600


@pytest.mark.asyncio
async def test_out_yes_shows_duration_choices():
    application = make_application()
    update = make_update(CALLBACK_OUT_YES)
    context = make_context(application)

    await handle_night_callback(update, context)

    update.callback_query.edit_message_text.assert_awaited_once()
    args, kwargs = update.callback_query.edit_message_text.call_args
    assert "reply_markup" in kwargs
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_night_reminder.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bot.night_reminder'`

- [ ] **Step 3: Write the night reminder module**

`bot/night_reminder.py`:
```python
from __future__ import annotations
import datetime
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes, CallbackQueryHandler, Application

CALLBACK_SLEPT_YES = "night_slept_yes"
CALLBACK_SLEPT_NO = "night_slept_no"
CALLBACK_OUT_YES = "night_out_yes"
CALLBACK_OUT_NO = "night_out_no"
CALLBACK_DURATION_PREFIX = "night_duration_"

ASK_SLEPT_TEXT = "Have you put the laptop to sleep?"
ASK_OUT_TEXT = "Are you out right now?"
DURATION_OPTIONS = [("30 min", 30), ("1 hr", 60), ("2 hr", 120)]
RECHECK_SECONDS = 600


def sleep_question_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("Yes", callback_data=CALLBACK_SLEPT_YES),
        InlineKeyboardButton("No", callback_data=CALLBACK_SLEPT_NO),
    ]])


def out_question_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("Yes", callback_data=CALLBACK_OUT_YES),
        InlineKeyboardButton("No", callback_data=CALLBACK_OUT_NO),
    ]])


def duration_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        InlineKeyboardButton(label, callback_data=f"{CALLBACK_DURATION_PREFIX}{minutes}")
        for label, minutes in DURATION_OPTIONS
    ]
    return InlineKeyboardMarkup([buttons])


async def send_sleep_check(application: Application) -> None:
    settings = application.bot_data["settings"]
    if application.bot_data.get("night_reminder_confirmed_date") == datetime.date.today().isoformat():
        return
    await application.bot.send_message(
        chat_id=settings.owner.telegram_id,
        text=ASK_SLEPT_TEXT,
        reply_markup=sleep_question_keyboard(),
    )


async def handle_night_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    data = query.data

    if data == CALLBACK_SLEPT_YES:
        context.application.bot_data["night_reminder_confirmed_date"] = datetime.date.today().isoformat()
        await query.edit_message_text("Good night! 🌙")
        return

    if data == CALLBACK_SLEPT_NO:
        await query.edit_message_text(ASK_OUT_TEXT, reply_markup=out_question_keyboard())
        return

    if data == CALLBACK_OUT_YES:
        await query.edit_message_text("How much longer will you be out?", reply_markup=duration_keyboard())
        return

    if data == CALLBACK_OUT_NO:
        await query.edit_message_text("Okay — I'll check back in 10 minutes.")
        context.job_queue.run_once(
            lambda ctx: send_sleep_check(ctx.application), when=RECHECK_SECONDS,
        )
        return

    if data.startswith(CALLBACK_DURATION_PREFIX):
        minutes = int(data[len(CALLBACK_DURATION_PREFIX):])
        await query.edit_message_text(f"Okay — I'll check back in about {minutes} minutes.")
        context.job_queue.run_once(
            lambda ctx: send_sleep_check(ctx.application), when=minutes * 60,
        )
        return


def register(application: Application) -> None:
    application.add_handler(CallbackQueryHandler(
        handle_night_callback,
        pattern=f"^({CALLBACK_SLEPT_YES}|{CALLBACK_SLEPT_NO}|{CALLBACK_OUT_YES}|{CALLBACK_OUT_NO}|{CALLBACK_DURATION_PREFIX})",
    ))
    application.job_queue.run_daily(
        lambda ctx: send_sleep_check(ctx.application),
        time=datetime.time(hour=23, minute=30),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_night_reminder.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Wire the night reminder into the bot entry point, with a timezone-aware scheduler**

In `bot/main.py`, add the imports:

```python
import zoneinfo
from telegram.ext import Defaults
from bot import night_reminder
```

And update `build_application()` so the daily job actually fires at 11:30 pm **IST**, not UTC:

```python
def build_application() -> Application:
    settings = load_settings(SETTINGS_PATH)
    defaults = Defaults(tzinfo=zoneinfo.ZoneInfo(settings.timezone))
    application = (
        Application.builder()
        .token(settings.bot_token)
        .defaults(defaults)
        .post_init(notify_owner_started)
        .build()
    )
    application.bot_data["settings"] = settings
    application.bot_data["db"] = db.connect(DB_PATH)
    application.add_handler(CommandHandler("start", start))
    night_reminder.register(application)
    return application
```

- [ ] **Step 6: Run the full test suite to verify nothing broke**

Run: `pytest -v`
Expected: PASS (all tests across every task so far)

- [ ] **Step 7: Manual verification of the timezone fix**

Temporarily change `time=datetime.time(hour=23, minute=30)` in `night_reminder.register` to a time one minute in the future (in IST), run `python -m bot.main`, and confirm the sleep-check message arrives at that IST time, not shifted by 5.5 hours. Revert the temporary time change afterward.

- [ ] **Step 8: Commit**

```bash
git add bot/night_reminder.py bot/main.py tests/test_night_reminder.py
git commit -m "feat: add 11:30pm sleep reminder with 10-minute escalation loop"
```

---

## Self-Review Notes

**Spec coverage:** §3.1 (framework) → Task 6/10. §3.2 (database) → Task 2. §3.3 (settings) → Task 1. §3.4 (photos) → Task 4. §3.5 (access control) → Task 3. §3.6 (correction/locking model) → Task 2 (`corrects_entry_id`, no update/delete methods exist). §4 (all infrastructure bullets) → Tasks 6–10. §10 (data safety) → covered across Tasks 2–9 (no secrets in code, allow-list, auto-start/restart, backups). §11 (onboarding) → BotFather walkthrough called out explicitly as outside this plan's task list; the WhatsApp message draft is deferred to onboarding time per the spec, not part of this foundation plan. §1 rules 3–5 (buttons, one question at a time, confirm-before-save, number validation) → Task 5's helpers, to be used by the role flows in the next plan. §1 rule 9 (Asia/Kolkata) → fixed explicitly in Task 10 Step 5 after being caught during self-review (see below).

**Placeholder scan:** no TBD/TODO strings; the two deliberate scope-narrowings (Task 9's simplified single nudge, Task 10's in-memory confirmation flag) are explicitly explained, not left vague.

**Type consistency:** `Settings`, `Person`, `Unit` (Task 1) are used identically in Tasks 3, 6, and 10. `db.save_entry`'s parameter names match across its own definition and every test. `night_reminder` callback constants are imported by name (not restated) in its own test file.

**Caught during review and fixed inline:** the first draft of Task 10 scheduled `run_daily` without a timezone-aware `Application`, which would have fired the sleep reminder at 5:00 am IST instead of 11:30 pm (APScheduler defaults to UTC). Fixed by adding `Defaults(tzinfo=...)` in Task 10 Step 5, with a manual verification step added specifically to catch this class of bug before it ships.

**Scope check:** this plan is self-contained — it produces a bot that starts itself, stays available, and privately greets approved users, provable end-to-end before any farm-data question exists. Role-specific flows (Anuragh, Nitish) are deliberately a separate plan.
