import pytest

from app.core.frequency import normalize_frequency
from app.schemas.prescription import FrequencyNormalized

FREQUENCY_TEST_CASES = [
    # Latin abbreviations & English expressions
    ("OD", FrequencyNormalized(times_per_day=1, slots=["morning"], as_needed=False)),
    ("o.d.", FrequencyNormalized(times_per_day=1, slots=["morning"], as_needed=False)),
    ("QD", FrequencyNormalized(times_per_day=1, slots=["morning"], as_needed=False)),
    ("once daily", FrequencyNormalized(times_per_day=1, slots=["morning"], as_needed=False)),
    ("once a day", FrequencyNormalized(times_per_day=1, slots=["morning"], as_needed=False)),
    ("OD night", FrequencyNormalized(times_per_day=1, slots=["night"], as_needed=False)),
    ("BD", FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False)),
    ("b.d.", FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False)),
    ("BID", FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False)),
    (
        "twice daily",
        FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False),
    ),
    (
        "twice a day",
        FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False),
    ),
    (
        "2 times a day",
        FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False),
    ),
    (
        "TDS",
        FrequencyNormalized(times_per_day=3, slots=["morning", "noon", "night"], as_needed=False),
    ),
    (
        "t.d.s.",
        FrequencyNormalized(times_per_day=3, slots=["morning", "noon", "night"], as_needed=False),
    ),
    (
        "TID",
        FrequencyNormalized(times_per_day=3, slots=["morning", "noon", "night"], as_needed=False),
    ),
    (
        "thrice daily",
        FrequencyNormalized(times_per_day=3, slots=["morning", "noon", "night"], as_needed=False),
    ),
    (
        "three times a day",
        FrequencyNormalized(times_per_day=3, slots=["morning", "noon", "night"], as_needed=False),
    ),
    (
        "QID",
        FrequencyNormalized(
            times_per_day=4, slots=["morning", "noon", "evening", "night"], as_needed=False
        ),
    ),
    (
        "four times a day",
        FrequencyNormalized(
            times_per_day=4, slots=["morning", "noon", "evening", "night"], as_needed=False
        ),
    ),
    ("HS", FrequencyNormalized(times_per_day=1, slots=["night"], as_needed=False)),
    ("at bedtime", FrequencyNormalized(times_per_day=1, slots=["night"], as_needed=False)),
    ("bedtime", FrequencyNormalized(times_per_day=1, slots=["night"], as_needed=False)),
    ("SOS", FrequencyNormalized(times_per_day=None, slots=[], as_needed=True)),
    ("s.o.s.", FrequencyNormalized(times_per_day=None, slots=[], as_needed=True)),
    ("PRN", FrequencyNormalized(times_per_day=None, slots=[], as_needed=True)),
    ("as needed", FrequencyNormalized(times_per_day=None, slots=[], as_needed=True)),
    ("when required", FrequencyNormalized(times_per_day=None, slots=[], as_needed=True)),
    # Dash / slot numerical patterns (3-slot)
    ("1-0-1", FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False)),
    (
        "1-1-1",
        FrequencyNormalized(times_per_day=3, slots=["morning", "noon", "night"], as_needed=False),
    ),
    ("1-0-0", FrequencyNormalized(times_per_day=1, slots=["morning"], as_needed=False)),
    ("0-1-0", FrequencyNormalized(times_per_day=1, slots=["noon"], as_needed=False)),
    ("0-0-1", FrequencyNormalized(times_per_day=1, slots=["night"], as_needed=False)),
    ("1-1-0", FrequencyNormalized(times_per_day=2, slots=["morning", "noon"], as_needed=False)),
    ("0-1-1", FrequencyNormalized(times_per_day=2, slots=["noon", "night"], as_needed=False)),
    (
        "1/2-0-1/2",
        FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False),
    ),
    ("2-0-2", FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False)),
    # 4-slot numerical patterns
    (
        "1-1-1-1",
        FrequencyNormalized(
            times_per_day=4, slots=["morning", "noon", "evening", "night"], as_needed=False
        ),
    ),
    # Interval phrases
    (
        "every 6 hours",
        FrequencyNormalized(
            times_per_day=4, slots=["morning", "noon", "evening", "night"], as_needed=False
        ),
    ),
    (
        "every 8 hours",
        FrequencyNormalized(times_per_day=3, slots=["morning", "noon", "night"], as_needed=False),
    ),
    (
        "every 12 hours",
        FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False),
    ),
    # Tamil frequency phrases
    ("தினமும் ஒரு முறை", FrequencyNormalized(times_per_day=1, slots=["morning"], as_needed=False)),
    ("காலை இரவு", FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False)),
    (
        "காலை மதியம் இரவு",
        FrequencyNormalized(times_per_day=3, slots=["morning", "noon", "night"], as_needed=False),
    ),
    ("இரவு மட்டும்", FrequencyNormalized(times_per_day=1, slots=["night"], as_needed=False)),
    ("படுக்கும் முன்", FrequencyNormalized(times_per_day=1, slots=["night"], as_needed=False)),
    ("தேவைப்படும் போது", FrequencyNormalized(times_per_day=None, slots=[], as_needed=True)),
]


@pytest.mark.parametrize("raw_input,expected", FREQUENCY_TEST_CASES)
def test_normalize_frequency_table(raw_input: str, expected: FrequencyNormalized):
    result = normalize_frequency(raw_input)
    assert result is not None, f"Expected non-None result for '{raw_input}'"
    assert result.times_per_day == expected.times_per_day
    assert result.slots == expected.slots
    assert result.as_needed == expected.as_needed


def test_normalize_frequency_empty_and_unknown():
    assert normalize_frequency(None) is None
    assert normalize_frequency("") is None
    assert normalize_frequency("   ") is None
    assert normalize_frequency("unrecognized_gibberish_xyz") is None
