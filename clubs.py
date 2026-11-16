import json
from pathlib import Path

"""Curated NIET club directory for TEIN.

The initial directory is sourced from NIET's public student-club and
department club pages. Events and recruitment remain separate fields so they
can later be managed as first-class records.
"""

CLUB_SOURCE_URL = "https://www.niet.co.in/students-life/student-clubs-societies"
BASE_DIR = Path(__file__).resolve().parent
CLUB_DATA_DIR = BASE_DIR / "data" / "clubs"
CLUBS_JSON_PATH = BASE_DIR / "data" / "clubs.json"
HANDBOOK_JSON_PATH = BASE_DIR / "data" / "club_handbook.json"


def _load_baseline_clubs():
    if CLUBS_JSON_PATH.exists():
        try:
            with open(CLUBS_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def _load_handbook():
    if HANDBOOK_JSON_PATH.exists():
        try:
            with open(HANDBOOK_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"context": {}, "details": {}}


CLUBS = tuple(_load_baseline_clubs())
_HANDBOOK_DATA = _load_handbook()
HANDBOOK_CLUB_CONTEXT = _HANDBOOK_DATA.get("context", {})
HANDBOOK_CLUB_DETAILS = _HANDBOOK_DATA.get("details", {})


def _load_club_overrides(slug):
    """Load optional human-editable curation data for one club."""
    legacy_path = CLUB_DATA_DIR / f"{slug}.json"
    profile_path = CLUB_DATA_DIR / slug / "profile.json"

    data = {}

    for path in (legacy_path, profile_path):
        if not path.exists():
            continue
        try:
            with path.open("r", encoding="utf-8") as handle:
                loaded = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(loaded, dict):
            data.update(loaded)

    return data


def _with_source(club):
    """Return a stable public club record with optional enrichment slots."""
    overrides = _load_club_overrides(club.get("slug", ""))
    handbook = HANDBOOK_CLUB_DETAILS.get(club.get("slug", ""), {})
    handbook_context = list(HANDBOOK_CLUB_CONTEXT.get("all", []))
    handbook_context.extend(HANDBOOK_CLUB_CONTEXT.get(handbook.get("department_note", ""), []))
    merged = {**handbook, **overrides, "handbook_context": handbook_context}

    if handbook.get("handbook_facts") and overrides.get("handbook_facts"):
        merged["handbook_facts"] = overrides["handbook_facts"]
    if handbook.get("sources") and overrides.get("sources"):
        merged["sources"] = overrides["sources"]
    if handbook.get("activities") and overrides.get("activities"):
        merged["activities"] = overrides["activities"]
    club = {**club, **merged}

    sources = list(club.get("sources", [])) or [
        {
            "type": "official",
            "label": "NIET student-club information",
            "url": CLUB_SOURCE_URL,
            "supports": ["identity", "category", "description"],
        }
    ]

    return {
        **club,
        "aliases": list(club.get("aliases", [])),
        "links": dict(club.get("links", {})),
        "activities": list(club.get("activities", [])),
        "events": list(club.get("events", [])),
        "images": list(club.get("images", [])),
        "achievements": list(club.get("achievements", [])),
        "historical_leadership": list(club.get("historical_leadership", [])),
        "historical_notes": list(club.get("historical_notes", [])),
        "recruitment": club.get("recruitment"),
        "sources": sources,
        "curation": {
            "status": club.get("curation_status", "baseline"),
            "last_reviewed": club.get("last_reviewed"),
        },
        "source_url": club.get("source_url", CLUB_SOURCE_URL),
        "assets": dict(club.get("assets", {})),
    }


def _discovered_clubs():
    """Return profile-backed clubs discovered outside the static baseline."""
    known = {club.get("slug") for club in CLUBS}
    discovered = []
    if not CLUB_DATA_DIR.exists():
        return discovered
    for profile_path in sorted(CLUB_DATA_DIR.glob("*/profile.json")):
        slug = profile_path.parent.name
        if slug in known:
            continue
        data = _load_club_overrides(slug)
        if not data.get("name"):
            continue
        discovered.append({
            "slug": slug,
            "name": data["name"],
            "category": data.get("category", data.get("scope", "Student Club").replace("_", " ").title()),
            "mark": data.get("mark", (data["name"][:1] or "C").upper()),
            "description": data.get("description", data.get("handbook_summary", "Officially documented NIET student community.")),
        })
    return discovered


def get_clubs():
    """Return the baseline directory plus profile-backed official discoveries."""
    return [_with_source(club) for club in [*CLUBS, *_discovered_clubs()]]


def get_club(slug):
    """Return a published club by slug, or None when it does not exist."""
    normalized = str(slug or "").strip().lower()
    club = next(
        (club for club in [*CLUBS, *_discovered_clubs()] if club.get("slug") == normalized),
        None,
    )
    return _with_source(club) if club else None
