"""
Cost Forecaster
===============
Projects future waste costs based on historical scan data using
simple linear regression (no external ML libraries needed — pure stdlib).

Requires at least 2 historical data points for meaningful projections.
"""
from __future__ import annotations

from typing import Any


def _linear_regression(x: list[float], y: list[float]) -> tuple[float, float]:
    """Compute (slope, intercept) for simple linear regression."""
    n = len(x)
    if n < 2:
        return 0.0, y[0] if y else 0.0
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xx = sum(xi * xi for xi in x)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    denom = n * sum_xx - sum_x * sum_x
    if denom == 0:
        return 0.0, sum_y / n
    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n
    return slope, intercept


def forecast_costs(scan_history: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Given a list of historical scan summaries (ordered oldest → newest),
    return cost projections for the next 30, 60, and 90 days.

    Each scan_history item should have:
      { "scan_index": int, "total_monthly_waste": float, "total_resources": int }

    Returns:
    {
      "data_points": int,
      "trend": "increasing" | "decreasing" | "stable",
      "current_monthly_waste": float,
      "forecast_30d": float,
      "forecast_60d": float,
      "forecast_90d": float,
      "potential_savings_if_actioned": float,
      "savings_percentage": float,
      "historical": [{"x": int, "waste": float}],
      "projection": [{"x": int, "waste": float}],
    }
    """
    if not scan_history:
        return _empty_forecast()

    # Use scan index as x-axis (ordinal position)
    x_vals = [float(i) for i in range(len(scan_history))]
    y_vals = [float(s.get("total_monthly_waste", 0)) for s in scan_history]

    slope, intercept = _linear_regression(x_vals, y_vals)
    n = len(scan_history)
    current = y_vals[-1] if y_vals else 0.0

    # Project 30/60/90 days as 1/2/3 scan periods ahead
    # If we know the avg scan interval we'd use it; default to 1 period = 30 days
    f30 = max(0, slope * (n) + intercept)
    f60 = max(0, slope * (n + 1) + intercept)
    f90 = max(0, slope * (n + 2) + intercept)

    # Trend determination
    if slope > current * 0.02:  # growing > 2% per scan
        trend = "increasing"
    elif slope < -current * 0.02:  # shrinking > 2% per scan
        trend = "decreasing"
    else:
        trend = "stable"

    # Potential savings = 60% of current waste (conservative: not everything can be fixed)
    potential_savings = round(current * 0.60, 2)
    savings_pct = 60.0

    historical = [{"x": i, "waste": round(y, 2)} for i, y in enumerate(y_vals)]
    projection = [
        {"x": n + 0, "waste": round(f30, 2)},
        {"x": n + 1, "waste": round(f60, 2)},
        {"x": n + 2, "waste": round(f90, 2)},
    ]

    return {
        "data_points": len(scan_history),
        "trend": trend,
        "slope_per_period": round(slope, 2),
        "current_monthly_waste": round(current, 2),
        "forecast_30d": round(f30, 2),
        "forecast_60d": round(f60, 2),
        "forecast_90d": round(f90, 2),
        "potential_savings_if_actioned": potential_savings,
        "savings_percentage": savings_pct,
        "historical": historical,
        "projection": projection,
    }


def _empty_forecast() -> dict[str, Any]:
    return {
        "data_points": 0,
        "trend": "stable",
        "slope_per_period": 0,
        "current_monthly_waste": 0,
        "forecast_30d": 0,
        "forecast_60d": 0,
        "forecast_90d": 0,
        "potential_savings_if_actioned": 0,
        "savings_percentage": 0,
        "historical": [],
        "projection": [],
    }
