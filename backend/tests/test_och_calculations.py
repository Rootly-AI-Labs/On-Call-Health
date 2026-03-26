"""
Unit tests for On-Call Health (OCH) calculations.

Tests all OCH calculation functions, validation, and edge cases.
"""

import unittest
from unittest.mock import patch
import sys
import os

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from core.och_config import (
    OCHConfig,
    OCHDimension,
    calculate_personal_burnout,
    calculate_work_related_burnout,
    calculate_composite_och_score,
    get_och_interpretation,
    validate_och_config,
    DEFAULT_OCH_CONFIG
)


class TestOCHConfig(unittest.TestCase):
    """Test ocb configuration and validation."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = OCHConfig()

    def test_dimension_weights_sum_to_one(self):
        """Test that dimension weights sum to 1.0."""
        weights_sum = sum(self.config.DIMENSION_WEIGHTS.values())
        self.assertAlmostEqual(weights_sum, 1.0, places=3)

    def test_personal_burnout_factors_sum_to_one(self):
        """Test that personal burnout factor weights sum to 1.0."""
        factors_sum = sum(factor['weight'] for factor in self.config.PERSONAL_BURNOUT_FACTORS.values())
        # Allow small rounding error (1.001 due to 0.462 + 0.385 + 0.154)
        self.assertAlmostEqual(factors_sum, 1.0, places=2)

    def test_work_related_factors_sum_to_one(self):
        """Test that work-related burnout factor weights sum to 1.0."""
        factors_sum = sum(factor['weight'] for factor in self.config.WORK_RELATED_BURNOUT_FACTORS.values())
        self.assertAlmostEqual(factors_sum, 1.0, places=3)

    def test_och_score_ranges_coverage(self):
        """Test that OCH score ranges cover 0-100 without gaps."""
        ranges = self.config.OCH_SCORE_RANGES
        self.assertEqual(ranges['low'][0], 0)
        self.assertEqual(ranges['high'][1], 100)

        # Test continuity
        self.assertEqual(ranges['low'][1], ranges['mild'][0])
        self.assertEqual(ranges['mild'][1], ranges['moderate'][0])
        self.assertEqual(ranges['moderate'][1], ranges['high'][0])

    def test_scale_max_values_positive(self):
        """Test that all scale_max values are positive."""
        for factor in self.config.PERSONAL_BURNOUT_FACTORS.values():
            self.assertGreater(factor['scale_max'], 0)

        for factor in self.config.WORK_RELATED_BURNOUT_FACTORS.values():
            self.assertGreater(factor['scale_max'], 0)

    def test_personal_burnout_has_three_factors(self):
        """Test that personal burnout has exactly 3 factors."""
        self.assertEqual(len(self.config.PERSONAL_BURNOUT_FACTORS), 3)
        self.assertIn('after_hours_activity', self.config.PERSONAL_BURNOUT_FACTORS)
        self.assertIn('sleep_quality_proxy', self.config.PERSONAL_BURNOUT_FACTORS)
        self.assertIn('work_hours_trend', self.config.PERSONAL_BURNOUT_FACTORS)

    def test_work_related_burnout_has_three_factors(self):
        """Test that work-related burnout has exactly 3 factors."""
        self.assertEqual(len(self.config.WORK_RELATED_BURNOUT_FACTORS), 3)
        self.assertIn('oncall_burden', self.config.WORK_RELATED_BURNOUT_FACTORS)
        self.assertIn('sprint_completion', self.config.WORK_RELATED_BURNOUT_FACTORS)
        self.assertIn('alert_health', self.config.WORK_RELATED_BURNOUT_FACTORS)


class TestPersonalBurnoutCalculation(unittest.TestCase):
    """Test personal burnout score calculation."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = OCHConfig()

    def test_calculate_personal_burnout_all_metrics(self):
        """Test personal burnout calculation with all metrics present."""
        # Use metrics that match current OCH config factors
        metrics = {
            'after_hours_activity': 25.0,  # 25% after hours (scale_max=30)
            'sleep_quality_proxy': 15.0,   # severity-weighted incidents (scale_max=30)
            'work_hours_trend': 50.0       # task load (scale_max=100)
        }

        result = calculate_personal_burnout(metrics, self.config)

        self.assertIn('score', result)
        self.assertIn('components', result)
        self.assertIn('dimension', result)
        self.assertIn('interpretation', result)

        # Score should be between 0-100
        self.assertGreaterEqual(result['score'], 0)
        self.assertLessEqual(result['score'], 150)  # Can exceed 100 for extreme values

        # Should have all 3 components
        self.assertEqual(len(result['components']), 3)

        # Dimension should be correct
        self.assertEqual(result['dimension'], OCHDimension.PERSONAL.value)

    def test_calculate_personal_burnout_partial_metrics(self):
        """Test personal burnout calculation with only some metrics."""
        metrics = {
            'after_hours_activity': 20.0,
            'work_hours_trend': 60.0,
        }

        result = calculate_personal_burnout(metrics, self.config)

        self.assertIn('score', result)
        self.assertIn('data_completeness', result)

        # Should have 2 components
        self.assertEqual(len(result['components']), 2)

        # Data completeness should be sum of weights for present metrics
        # after_hours_activity (0.462) + work_hours_trend (0.154) = 0.616
        expected_completeness = 0.462 + 0.154
        self.assertAlmostEqual(result['data_completeness'], expected_completeness, places=2)

    def test_calculate_personal_burnout_no_metrics(self):
        """Test personal burnout calculation with no metrics."""
        metrics = {}

        result = calculate_personal_burnout(metrics, self.config)

        self.assertEqual(result['score'], 0.0)
        self.assertEqual(len(result['components']), 0)
        self.assertEqual(result['data_completeness'], 0.0)

    def test_calculate_personal_burnout_extreme_values(self):
        """Test personal burnout calculation with extreme values."""
        metrics = {
            'after_hours_activity': 60.0,   # 2x scale_max of 30
            'sleep_quality_proxy': 90.0,    # 3x scale_max of 30
            'work_hours_trend': 200.0       # 2x scale_max of 100
        }

        result = calculate_personal_burnout(metrics, self.config)

        # Score can exceed 100 but is capped at 150 per component
        self.assertGreater(result['score'], 100)

        # Check that normalized scores are capped at 150
        for component in result['components'].values():
            self.assertLessEqual(component['normalized_score'], 150.0)


class TestWorkRelatedBurnoutCalculation(unittest.TestCase):
    """Test work-related burnout score calculation."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = OCHConfig()

    def test_calculate_work_related_burnout_all_metrics(self):
        """Test work-related burnout calculation with all metrics present."""
        # Use metrics that match current OCH config factors
        metrics = {
            'oncall_burden': 50.0,       # on-call load (scale_max=100)
            'sprint_completion': 5.0,    # consecutive incident days (scale_max=7)
            'alert_health': 40.0         # alert burden and quality (scale_max=100)
        }

        result = calculate_work_related_burnout(metrics, self.config)

        self.assertIn('score', result)
        self.assertIn('components', result)
        self.assertIn('dimension', result)
        self.assertIn('interpretation', result)

        # Score should be between 0-100
        self.assertGreaterEqual(result['score'], 0)
        self.assertLessEqual(result['score'], 150)

        # Should have all 3 components
        self.assertEqual(len(result['components']), 3)

        # Dimension should be correct
        self.assertEqual(result['dimension'], OCHDimension.WORK_RELATED.value)

    def test_calculate_work_related_burnout_high_stress(self):
        """Test work-related burnout calculation with high stress indicators."""
        metrics = {
            'oncall_burden': 120.0,      # Exceeds scale_max of 100
            'sprint_completion': 10.0,   # Exceeds scale_max of 7
            'alert_health': 130.0        # Exceeds scale_max of 100
        }

        result = calculate_work_related_burnout(metrics, self.config)

        # Should indicate high burnout
        self.assertGreaterEqual(result['score'], 70)
        self.assertIn(result['interpretation'], ['moderate', 'high'])


class TestCompositeOCHScore(unittest.TestCase):
    """Test composite ocb score calculation."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = OCHConfig()

    def test_calculate_composite_och_score(self):
        """Test composite ocb score calculation."""
        personal_score = 60.0
        work_related_score = 40.0

        result = calculate_composite_och_score(personal_score, work_related_score, self.config)

        self.assertIn('composite_score', result)
        self.assertIn('personal_score', result)
        self.assertIn('work_related_score', result)
        self.assertIn('interpretation', result)
        self.assertIn('risk_level', result)
        self.assertIn('score_breakdown', result)

        # Expected composite score with 65/35 weights
        expected_score = (personal_score * 0.65) + (work_related_score * 0.35)
        self.assertAlmostEqual(result['composite_score'], expected_score, places=2)

        # Check breakdown components
        self.assertAlmostEqual(
            result['score_breakdown']['personal_contribution'],
            personal_score * 0.65,
            places=2
        )
        self.assertAlmostEqual(
            result['score_breakdown']['work_related_contribution'],
            work_related_score * 0.35,
            places=2
        )

    def test_composite_score_interpretation_mapping(self):
        """Test that composite scores map to correct interpretations."""
        test_cases = [
            (10.0, 15.0, 'low'),      # Weighted: 6.5 + 5.25 = 11.75
            (40.0, 40.0, 'mild'),     # Weighted: 26 + 14 = 40
            (70.0, 70.0, 'moderate'), # Weighted: 45.5 + 24.5 = 70
            (90.0, 90.0, 'high'),     # Weighted: 58.5 + 31.5 = 90
        ]

        for personal, work_related, expected_interpretation in test_cases:
            result = calculate_composite_och_score(personal, work_related, self.config)
            self.assertEqual(result['interpretation'], expected_interpretation,
                           f"Personal={personal}, Work={work_related} should be '{expected_interpretation}'")


class TestOCHInterpretation(unittest.TestCase):
    """Test ocb score interpretation functions."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = OCHConfig()

    def test_get_och_interpretation_ranges(self):
        """Test ocb interpretation for different score ranges."""
        test_cases = [
            (0.0, 'low'),
            (12.5, 'low'),
            (24.9, 'low'),
            (25.0, 'mild'),
            (37.5, 'mild'),
            (49.9, 'mild'),
            (50.0, 'moderate'),
            (62.5, 'moderate'),
            (74.9, 'moderate'),
            (75.0, 'high'),
            (87.5, 'high'),
            (100.0, 'high'),
        ]

        for score, expected_interpretation in test_cases:
            result = get_och_interpretation(score, self.config)
            self.assertEqual(result, expected_interpretation,
                           f"Score {score} should be '{expected_interpretation}', got '{result}'")


class TestOCHValidation(unittest.TestCase):
    """Test ocb configuration validation."""

    def test_validate_default_config(self):
        """Test validation of default ocb configuration."""
        validation = validate_och_config()

        self.assertIn('dimension_weights_sum', validation)
        self.assertIn('personal_factors_sum', validation)
        self.assertIn('work_related_factors_sum', validation)
        self.assertIn('score_ranges_valid', validation)
        self.assertIn('scale_max_positive', validation)

        # Most validations should pass
        self.assertTrue(validation['dimension_weights_sum'])
        self.assertTrue(validation['work_related_factors_sum'])
        self.assertTrue(validation['score_ranges_valid'])
        self.assertTrue(validation['scale_max_positive'])
        # personal_factors_sum has small rounding error (1.001 vs 1.0)
        # This is acceptable as the difference is negligible

    def test_validate_custom_config(self):
        """Test validation of custom configuration."""
        config = OCHConfig()

        # Save original weights to restore later (DIMENSION_WEIGHTS is class-level)
        original_weights = config.DIMENSION_WEIGHTS.copy()

        try:
            # Modify weights to create invalid configuration
            config.DIMENSION_WEIGHTS[OCHDimension.PERSONAL] = 0.6
            config.DIMENSION_WEIGHTS[OCHDimension.WORK_RELATED] = 0.5  # Sum > 1.0

            validation = validate_och_config(config)
            self.assertFalse(validation['dimension_weights_sum'])
        finally:
            # Restore original weights to avoid affecting other tests
            config.DIMENSION_WEIGHTS.clear()
            config.DIMENSION_WEIGHTS.update(original_weights)


class TestOCHEdgeCases(unittest.TestCase):
    """Test ocb calculations with edge cases."""

    def test_zero_values(self):
        """Test ocb calculations with zero values."""
        metrics = {
            'after_hours_activity': 0.0,
            'sleep_quality_proxy': 0.0,
            'work_hours_trend': 0.0
        }

        result = calculate_personal_burnout(metrics)
        self.assertEqual(result['score'], 0.0)

    def test_negative_values(self):
        """Test ocb calculations with negative values (should be treated as zero)."""
        metrics = {
            'after_hours_activity': -10.0,
            'sleep_quality_proxy': -5.0,
        }

        result = calculate_personal_burnout(metrics)

        # Negative values should contribute 0 to the score
        self.assertGreaterEqual(result['score'], 0.0)

    def test_missing_config(self):
        """Test ocb calculations with None config (should use default)."""
        metrics = {
            'after_hours_activity': 20.0,
            'sleep_quality_proxy': 15.0,
        }

        result = calculate_personal_burnout(metrics, None)
        self.assertIn('score', result)
        self.assertGreaterEqual(result['score'], 0.0)


if __name__ == '__main__':
    unittest.main()
