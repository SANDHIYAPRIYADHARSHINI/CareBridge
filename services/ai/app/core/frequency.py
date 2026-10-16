"""Structured medication frequency normalizer for CareBridge AI.

Normalizes Latin abbreviations (OD, BD, TDS, QID, HS, SOS), numeric patterns
(1-0-1, 1-1-1, 0-0-1), English expressions ('twice a day'), and Tamil phrases
into a structured FrequencyNormalized model.
"""

from __future__ import annotations

import re

from app.schemas.prescription import FrequencyNormalized, FrequencySlot

# SOS / As needed keywords
SOS_PATTERN = re.compile(
    r"\b(sos|s\.o\.s|prn|p\.r\.n|as\s+needed|when\s+(?:required|needed))\b|"
    r"தேவைப்படும்\s*போது|தேவைக்கு\s*ஏற்ப",
    re.IGNORECASE,
)

# Numeric dash patterns: e.g. 1-0-1, 1/2-0-1/2, 1-1-1, 0-0-1
THREE_SLOT_PATTERN = re.compile(
    r"^\s*([0-9]+(?:/[0-9]+)?)\s*[-–/]\s*([0-9]+(?:/[0-9]+)?)\s*[-–/]\s*([0-9]+(?:/[0-9]+)?)\s*$"
)
FOUR_SLOT_PATTERN = re.compile(
    r"^\s*([0-9]+(?:/[0-9]+)?)\s*[-–/]\s*([0-9]+(?:/[0-9]+)?)\s*[-–/]\s*"
    r"([0-9]+(?:/[0-9]+)?)\s*[-–/]\s*([0-9]+(?:/[0-9]+)?)\s*$"
)

# Interval regex: e.g. every 6 hours, q6h, q8h, q12h
INTERVAL_PATTERN = re.compile(
    r"\b(?:every|q)\s*(\d{1,2})\s*(?:hours|hrs|h)\b",
    re.IGNORECASE,
)

# Latin and colloquial phrases
OD_PATTERN = re.compile(
    r"\b(od|o\.d|qd|q\.d|once\s+daily|once\s+a\s+day|1\s+time\s+a\s+day|daily)\b|"
    r"தினமும்\s*ஒரு\s*முறை|ஒரு\s*முறை",
    re.IGNORECASE,
)
BD_PATTERN = re.compile(
    r"\b(bd|b\.d|bid|b\.i\.d|twice\s+daily|twice\s+a\s+day|2\s+times\s+a\s+day)\b|"
    r"இரு\s*முறை|இரண்டு\s*முறை|காலை\s*இரவு",
    re.IGNORECASE,
)
TDS_PATTERN = re.compile(
    r"\b(tds|t\.d\.s|tid|t\.i\.d|thrice\s+daily|three\s+times\s+a\s+day|3\s+times\s+a\s+day)\b|"
    r"மூன்று\s*முறை|காலை\s*மதியம்\s*இரவு",
    re.IGNORECASE,
)
QID_PATTERN = re.compile(
    r"\b(qid|q\.i\.d|four\s+times\s+a\s+day|4\s+times\s+a\s+day)\b|நான்கு\s*முறை",
    re.IGNORECASE,
)
HS_PATTERN = re.compile(
    r"\b(hs|h\.s|at\s+bedtime|bedtime|night\s+only|at\s+night)\b|"
    r"இரவு\s*மட்டும்|படுக்கும்\s*முன்",
    re.IGNORECASE,
)


def _is_slot_active(val_str: str) -> bool:
    """Returns True if the slot value represents an active dose (greater than zero)."""
    val = val_str.strip()
    if val in ("0", "", "none"):
        return False
    try:
        if "/" in val:
            num, den = val.split("/", 1)
            return float(num) / float(den) > 0.0
        return float(val) > 0.0
    except ValueError:
        return True


def normalize_frequency(raw_freq: str | None) -> FrequencyNormalized | None:
    """Normalizes a raw frequency string into a structured FrequencyNormalized object.

    Handles numeric slot patterns (1-0-1), Latin abbreviations (OD, BD, TDS, QID, HS, SOS),
    interval patterns ('every 8 hours'), English phrases, and Tamil phrases.
    """
    if not raw_freq or not raw_freq.strip():
        return None

    cleaned = raw_freq.strip()

    # 1. Check SOS / PRN / As Needed
    if SOS_PATTERN.search(cleaned):
        return FrequencyNormalized(times_per_day=None, slots=[], as_needed=True)

    # 2. Check 3-slot pattern (Morning - Noon - Night)
    match_3 = THREE_SLOT_PATTERN.match(cleaned)
    if match_3:
        m_val, n_val, ni_val = match_3.groups()
        slots: list[FrequencySlot] = []
        if _is_slot_active(m_val):
            slots.append("morning")
        if _is_slot_active(n_val):
            slots.append("noon")
        if _is_slot_active(ni_val):
            slots.append("night")
        return FrequencyNormalized(
            times_per_day=len(slots),
            slots=slots,
            as_needed=False,
        )

    # 3. Check 4-slot pattern (Morning - Noon - Evening - Night)
    match_4 = FOUR_SLOT_PATTERN.match(cleaned)
    if match_4:
        m_val, n_val, e_val, ni_val = match_4.groups()
        slots_4: list[FrequencySlot] = []
        if _is_slot_active(m_val):
            slots_4.append("morning")
        if _is_slot_active(n_val):
            slots_4.append("noon")
        if _is_slot_active(e_val):
            slots_4.append("evening")
        if _is_slot_active(ni_val):
            slots_4.append("night")
        return FrequencyNormalized(
            times_per_day=len(slots_4),
            slots=slots_4,
            as_needed=False,
        )

    # 4. Check Interval (every X hours)
    match_interval = INTERVAL_PATTERN.search(cleaned)
    if match_interval:
        hours = int(match_interval.group(1))
        if 1 <= hours <= 24:
            times = max(1, 24 // hours)
            if times == 1:
                slots = ["morning"]
            elif times == 2:
                slots = ["morning", "night"]
            elif times == 3:
                slots = ["morning", "noon", "night"]
            else:
                slots = ["morning", "noon", "evening", "night"]
            return FrequencyNormalized(times_per_day=times, slots=slots, as_needed=False)

    # 5. Check Four times a day / QID
    if QID_PATTERN.search(cleaned):
        return FrequencyNormalized(
            times_per_day=4,
            slots=["morning", "noon", "evening", "night"],
            as_needed=False,
        )

    # 6. Check Three times a day / TDS / TID
    if TDS_PATTERN.search(cleaned):
        return FrequencyNormalized(
            times_per_day=3,
            slots=["morning", "noon", "night"],
            as_needed=False,
        )

    # 7. Check Twice a day / BD / BID
    if BD_PATTERN.search(cleaned):
        return FrequencyNormalized(
            times_per_day=2,
            slots=["morning", "night"],
            as_needed=False,
        )

    # 8. Check Bedtime / HS
    if HS_PATTERN.search(cleaned):
        return FrequencyNormalized(
            times_per_day=1,
            slots=["night"],
            as_needed=False,
        )

    # 9. Check Once a day / OD
    if OD_PATTERN.search(cleaned):
        # Determine slot if bedtime or morning mentioned
        lower = cleaned.lower()
        if "night" in lower or "bedtime" in lower or "இரவு" in lower:
            slot_list: list[FrequencySlot] = ["night"]
        else:
            slot_list = ["morning"]
        return FrequencyNormalized(
            times_per_day=1,
            slots=slot_list,
            as_needed=False,
        )

    return None
