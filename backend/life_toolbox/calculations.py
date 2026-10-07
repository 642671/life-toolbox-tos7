"""Pure calculation functions used by the Life Toolbox backend."""

from __future__ import annotations

import secrets
import string
from datetime import date
from typing import Any, Iterable


class CalculationError(ValueError):
    """Raised when user input cannot be calculated."""


UNIT_FACTORS: dict[str, dict[str, float]] = {
    "length": {
        "m": 1.0,
        "km": 1000.0,
        "cm": 0.01,
        "in": 0.0254,
        "ft": 0.3048,
    },
    "weight": {
        "kg": 1.0,
        "g": 0.001,
        "lb": 0.45359237,
    },
}


def _number(value: Any, name: str, *, allow_zero: bool = False) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise CalculationError(f"{name} must be a number") from exc

    if number < 0 or (number == 0 and not allow_zero):
        qualifier = "zero or greater" if allow_zero else "greater than zero"
        raise CalculationError(f"{name} must be {qualifier}")
    return number


def _round(value: float, digits: int = 2) -> float:
    return round(value, digits)


def date_difference(start: Any, end: Any) -> dict[str, int | str]:
    """Return the signed and absolute number of days between two ISO dates."""
    try:
        start_date = date.fromisoformat(str(start))
        end_date = date.fromisoformat(str(end))
    except ValueError as exc:
        raise CalculationError("dates must use YYYY-MM-DD format") from exc

    days = (end_date - start_date).days
    return {
        "days": days,
        "absolute_days": abs(days),
        "direction": "forward" if days >= 0 else "backward",
    }


def convert_unit(value: Any, from_unit: str, to_unit: str) -> dict[str, float | str]:
    """Convert a value between supported length or weight units."""
    number = _number(value, "value", allow_zero=True)
    from_unit = str(from_unit)
    to_unit = str(to_unit)

    category = next(
        (
            name
            for name, factors in UNIT_FACTORS.items()
            if from_unit in factors and to_unit in factors
        ),
        None,
    )
    if category is None:
        raise CalculationError("units must belong to the same supported category")

    factors = UNIT_FACTORS[category]
    result = number * factors[from_unit] / factors[to_unit]
    return {
        "category": category,
        "value": _round(result, 6),
        "from": from_unit,
        "to": to_unit,
    }


def bmi(height_cm: Any, weight_kg: Any) -> dict[str, float | str]:
    """Calculate BMI and return a general category label."""
    height = _number(height_cm, "height_cm")
    weight = _number(weight_kg, "weight_kg")
    meters = height / 100.0
    value = weight / (meters * meters)
    if value < 18.5:
        category = "underweight"
    elif value < 25:
        category = "normal"
    elif value < 30:
        category = "overweight"
    else:
        category = "obesity"
    return {"bmi": _round(value), "category": category}


def discount(
    original_price: Any,
    discount_percent: Any,
    tax_percent: Any = 0,
) -> dict[str, float]:
    """Calculate discount savings and final price including optional tax."""
    price = _number(original_price, "original_price", allow_zero=True)
    discount_rate = _number(discount_percent, "discount_percent", allow_zero=True)
    tax_rate = _number(tax_percent, "tax_percent", allow_zero=True)
    if discount_rate > 100:
        raise CalculationError("discount_percent cannot exceed 100")

    discounted = price * (1 - discount_rate / 100)
    total = discounted * (1 + tax_rate / 100)
    return {
        "discounted_price": _round(discounted),
        "saved": _round(price - discounted),
        "tax": _round(total - discounted),
        "total": _round(total),
    }


def tip_split(bill: Any, tip_percent: Any, people: Any) -> dict[str, float | int]:
    """Calculate the total bill and per-person amount after tip."""
    amount = _number(bill, "bill", allow_zero=True)
    tip_rate = _number(tip_percent, "tip_percent", allow_zero=True)
    people_count = int(_number(people, "people"))
    total = amount * (1 + tip_rate / 100)
    return {
        "people": people_count,
        "tip": _round(total - amount),
        "total": _round(total),
        "per_person": _round(total / people_count),
    }


def fuel_cost(distance_km: Any, liters_per_100km: Any, price_per_liter: Any) -> dict[str, float]:
    """Estimate fuel volume and trip cost."""
    distance = _number(distance_km, "distance_km")
    consumption = _number(liters_per_100km, "liters_per_100km")
    price = _number(price_per_liter, "price_per_liter", allow_zero=True)
    liters = distance * consumption / 100.0
    return {"liters": _round(liters), "cost": _round(liters * price)}


def loan_payment(principal: Any, annual_rate_percent: Any, years: Any) -> dict[str, float | int]:
    """Estimate fixed-rate loan payments."""
    amount = _number(principal, "principal")
    annual_rate = _number(annual_rate_percent, "annual_rate_percent", allow_zero=True)
    loan_years = _number(years, "years")
    months = int(round(loan_years * 12))
    monthly_rate = annual_rate / 100.0 / 12.0

    if monthly_rate == 0:
        monthly = amount / months
    else:
        factor = (1 + monthly_rate) ** months
        monthly = amount * monthly_rate * factor / (factor - 1)

    return {
        "months": months,
        "monthly_payment": _round(monthly),
        "total_payment": _round(monthly * months),
        "total_interest": _round(monthly * months - amount),
    }


def pick_item(items: Iterable[Any]) -> dict[str, str]:
    """Choose one non-empty item using a cryptographically secure generator."""
    normalized = [str(item).strip() for item in items if str(item).strip()]
    if not normalized:
        raise CalculationError("at least one item is required")
    return {"picked": secrets.choice(normalized)}


def generate_password(length: Any, mode: str = "mixed") -> dict[str, int | str]:
    """Generate a random password without third-party dependencies."""
    size = int(_number(length, "length"))
    if size < 4 or size > 64:
        raise CalculationError("length must be between 4 and 64")

    alphabets = {
        "pin": string.digits,
        "simple": string.ascii_letters + string.digits,
        "mixed": string.ascii_letters + string.digits + "!@#$%&*+-_",
    }
    alphabet = alphabets.get(mode)
    if alphabet is None:
        raise CalculationError("mode must be pin, simple, or mixed")

    # Ensure the generated password contains at least one item from each group.
    if mode == "pin":
        groups = [string.digits]
    elif mode == "simple":
        groups = [string.ascii_lowercase, string.ascii_uppercase, string.digits]
    else:
        groups = [
            string.ascii_lowercase,
            string.ascii_uppercase,
            string.digits,
            "!@#$%&*+-_",
        ]

    password = [secrets.choice(group) for group in groups]
    password.extend(secrets.choice(alphabet) for _ in range(size - len(password)))
    secrets.SystemRandom().shuffle(password)
    return {"password": "".join(password), "length": size, "mode": mode}
