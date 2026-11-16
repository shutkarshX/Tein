"""First-class TEIN event records.

Verified events are separate from the collection pipeline. A record may come
from Instagram, WhatsApp, Telegram, a poster, word-of-mouth, or a trusted
submission without changing the public Events UI.
"""

EVENT_SOURCE_TYPES = (
    "instagram",
    "whatsapp",
    "telegram",
    "poster",
    "word_of_mouth",
    "club_submission",
    "student_submission",
    "department_submission",
)

# Keep this empty until TEIN has verified event records.
EVENTS = ()


def _with_defaults(event):
    return {
        "id": event.get("id"),
        "club_slug": event.get("club_slug"),
        "title": event.get("title", ""),
        "description": event.get("description", ""),
        "date": event.get("date"),
        "time": event.get("time"),
        "venue": event.get("venue"),
        "registration_link": event.get("registration_link"),
        "source": event.get("source"),
        "source_type": event.get("source_type"),
        "image_url": event.get("image_url"),
        "status": event.get("status", "upcoming"),
    }


def get_events():
    """Return verified/published TEIN event records."""
    return [
        _with_defaults(event)
        for event in EVENTS
        if event.get("status", "upcoming") == "upcoming"
    ]


def get_events_for_club(club_slug):
    """Return published events belonging to one club."""
    normalized = str(club_slug or "").strip().lower()
    return [
        event
        for event in get_events()
        if event.get("club_slug") == normalized
    ]
