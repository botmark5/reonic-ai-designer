from pathlib import Path

import math
import pytest

from engine.label_rules.items import RAW_NUM_COLS, load_raw, make_items

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
needs_data = pytest.mark.skipif(not RAW_DIR.exists(), reason="raw Reonic data not present")


def test_make_items_defaults():
    items = make_items([{"name": "Battery 7kWh", "type": "BatteryStorage", "inverter_power_kw": 7000}])
    row = items.iloc[0]
    assert row.component_name == "Battery 7kWh"
    assert row.component_type == "BatteryStorage"
    assert row.quantity == 1.0
    assert row.technology == "solar"
    assert row.component_brand == ""
    assert math.isnan(row.module_watt_peak)
    assert row.inverter_power_kw == 7000.0


def test_make_items_has_all_raw_numeric_columns_as_float():
    items = make_items([{"name": "Install Wallbox", "type": "InstallationFee", "tech": "wallbox", "qty": 2}])
    for col in RAW_NUM_COLS:
        assert items[col].dtype == float, col
    assert items.iloc[0].technology == "wallbox"
    assert items.iloc[0].quantity == 2.0


@needs_data
def test_load_raw_blank_numeric_is_nan():
    parts, _ = load_raw(RAW_DIR)
    for col in RAW_NUM_COLS:
        assert parts[col].dtype == float, col
    assert parts.quantity.isna().sum() == 0
    assert (parts.component_brand == "").sum() > 0  # blanks are "", not NaN


@needs_data
def test_load_raw_counts():
    parts, sq = load_raw(RAW_DIR)
    assert parts.groupby("installer").size().to_dict() == {"23c108b7": 2395, "2a8ba8e2": 19257}
    assert sq.groupby("installer").size().to_dict() == {"23c108b7": 342, "2a8ba8e2": 1277}
