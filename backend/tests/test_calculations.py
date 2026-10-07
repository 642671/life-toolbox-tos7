from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from life_toolbox import calculations  # noqa: E402


class CalculationTests(unittest.TestCase):
    def test_date_difference(self) -> None:
        result = calculations.date_difference("2026-01-01", "2026-01-11")
        self.assertEqual(result["days"], 10)
        self.assertEqual(result["direction"], "forward")

    def test_unit_conversion(self) -> None:
        result = calculations.convert_unit(1, "km", "m")
        self.assertEqual(result["category"], "length")
        self.assertEqual(result["value"], 1000.0)

    def test_bmi(self) -> None:
        result = calculations.bmi(170, 65)
        self.assertEqual(result["bmi"], 22.49)
        self.assertEqual(result["category"], "normal")

    def test_discount(self) -> None:
        result = calculations.discount(100, 20, 5)
        self.assertEqual(result["saved"], 20.0)
        self.assertEqual(result["total"], 84.0)

    def test_tip_split(self) -> None:
        result = calculations.tip_split(100, 15, 4)
        self.assertEqual(result["per_person"], 28.75)

    def test_fuel_cost(self) -> None:
        result = calculations.fuel_cost(100, 7.5, 8)
        self.assertEqual(result["liters"], 7.5)
        self.assertEqual(result["cost"], 60.0)

    def test_loan_payment(self) -> None:
        result = calculations.loan_payment(100000, 4.5, 10)
        self.assertEqual(result["months"], 120)
        self.assertAlmostEqual(float(result["monthly_payment"]), 1036.38, places=2)

    def test_password_contains_required_groups(self) -> None:
        result = calculations.generate_password(16, "mixed")
        password = str(result["password"])
        self.assertEqual(len(password), 16)
        self.assertTrue(any(character.islower() for character in password))
        self.assertTrue(any(character.isupper() for character in password))
        self.assertTrue(any(character.isdigit() for character in password))

    def test_picker_rejects_empty_items(self) -> None:
        with self.assertRaises(calculations.CalculationError):
            calculations.pick_item(["", "   "])


if __name__ == "__main__":
    unittest.main()
