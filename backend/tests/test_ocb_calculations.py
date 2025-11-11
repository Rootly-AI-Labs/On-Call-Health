"""
Unit tests for On-Call Burnout (OCB) calculations.

Tests all OCB calculation functions, validation, and edge cases.
"""

import unittest
from unittest.mock import patch
import sys
import os

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from core.ocb_config import (
    ocbConfig,
    ocbDimension,
    calculate_personal_burnout,
    calculate_work_related_burnout,
    calculate_composite_ocb_score,
    get_ocb_interpretation,
    validate_ocb_config,
    get_ocb_recommendations,
    DEFAULT_ocb_CONFIG
)


class TestocbConfig(unittest.TestCase):
    """Test ocb configuration and validation."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.config = ocbConfig()
    
    def test_dimension_weights_sum_to_one(self):
        """Test that dimension weights sum to 1.0."""
        weights_sum = sum(self.config.DIMENSION_WEIGHTS.values())
        self.assertAlmostEqual(weights_sum, 1.0, places=3)
    
    def test_personal_burnout_factors_sum_to_one(self):
        """Test that personal burnout factor weights sum to 1.0."""
        factors_sum = sum(factor['weight'] for factor in self.config.PERSONAL_BURNOUT_FACTORS.values())
        self.assertAlmostEqual(factors_sum, 1.0, places=3)
    
    def test_work_related_factors_sum_to_one(self):
        """Test that work-related burnout factor weights sum to 1.0."""
        factors_sum = sum(factor['weight'] for factor in self.config.WORK_RELATED_BURNOUT_FACTORS.values())
        self.assertAlmostEqual(factors_sum, 1.0, places=3)
    
    def test_ocb_score_ranges_coverage(self):
        """Test that ocb score ranges cover 0-100 without gaps."""
        ranges = self.config.ocb_SCORE_RANGES
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


class TestPersonalBurnoutCalculation(unittest.TestCase):
    """Test personal burnout score calculation."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.config = ocbConfig()
    
    def test_calculate_personal_burnout_all_metrics(self):
        """Test personal burnout calculation with all metrics present."""
        metrics = {
            'work_hours_trend': 50.0,      # 50% over 45hr/week limit
            'weekend_work': 20.0,          # 20% weekend work
            'after_hours_activity': 25.0,  # 25% after hours
            'vacation_usage': 60.0,        # 60% unused vacation
            'sleep_quality_proxy': 15.0    # 15% late night commits
        }
        
        result = calculate_personal_burnout(metrics, self.config)
        
        self.assertIn('score', result)
        self.assertIn('components', result)
        self.assertIn('dimension', result)
        self.assertIn('interpretation', result)
        
        # Score should be between 0-100
        self.assertGreaterEqual(result['score'], 0)
        self.assertLessEqual(result['score'], 100)
        
        # Should have all components
        self.assertEqual(len(result['components']), 5)
        
        # Dimension should be correct
        self.assertEqual(result['dimension'], ocbDimension.PERSONAL.value)
    
    def test_calculate_personal_burnout_partial_metrics(self):
        """Test personal burnout calculation with only some metrics."""
        metrics = {
            'work_hours_trend': 60.0,      # High work hours
            'weekend_work': 30.0,          # High weekend work
        }
        
        result = calculate_personal_burnout(metrics, self.config)
        
        self.assertIn('score', result)
        self.assertIn('data_completeness', result)
        
        # Should have fewer components
        self.assertEqual(len(result['components']), 2)
        
        # Data completeness should be less than 1.0
        expected_completeness = 0.25 + 0.20  # Sum of weights for present metrics
        self.assertAlmostEqual(result['data_completeness'], expected_completeness, places=3)
    
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
            'work_hours_trend': 200.0,     # Extreme value
            'weekend_work': 100.0,         # Maximum weekend work
            'after_hours_activity': 80.0,  # High after hours
            'vacation_usage': 100.0,       # All vacation unused
            'sleep_quality_proxy': 50.0    # High late night activity
        }
        
        result = calculate_personal_burnout(metrics, self.config)
        
        # Score should still be capped at reasonable levels
        self.assertLessEqual(result['score'], 100)
        
        # Check that extreme values are normalized correctly
        work_hours_component = result['components']['work_hours_trend']
        self.assertEqual(work_hours_component['normalized_score'], 100.0)  # Capped at 100


class TestWorkRelatedBurnoutCalculation(unittest.TestCase):
    """Test work-related burnout score calculation."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.config = ocbConfig()
    
    def test_calculate_work_related_burnout_all_metrics(self):
        """Test work-related burnout calculation with all metrics present."""
        metrics = {
            'sprint_completion': 30.0,      # 30% missed deadlines
            'code_review_speed': 48.0,      # 48 hour avg turnaround
            'pr_frequency': 60.0,           # 60% stress score
            'deployment_frequency': 70.0,   # 70% pressure score
            'meeting_load': 50.0,           # 50% day in meetings
            'oncall_burden': 5.0            # 5 incidents/week
        }
        
        result = calculate_work_related_burnout(metrics, self.config)
        
        self.assertIn('score', result)
        self.assertIn('components', result)
        self.assertIn('dimension', result)
        self.assertIn('interpretation', result)
        
        # Score should be between 0-100
        self.assertGreaterEqual(result['score'], 0)
        self.assertLessEqual(result['score'], 100)
        
        # Should have all components
        self.assertEqual(len(result['components']), 6)
        
        # Dimension should be correct
        self.assertEqual(result['dimension'], ocbDimension.WORK_RELATED.value)
    
    def test_calculate_work_related_burnout_high_stress(self):
        """Test work-related burnout calculation with high stress indicators."""
        metrics = {
            'sprint_completion': 60.0,      # High missed deadlines
            'code_review_speed': 150.0,     # Very slow reviews
            'pr_frequency': 90.0,           # High PR stress
            'deployment_frequency': 100.0,  # Maximum deployment pressure
            'meeting_load': 90.0,           # Excessive meetings
            'oncall_burden': 12.0           # Excessive incidents
        }
        
        result = calculate_work_related_burnout(metrics, self.config)
        
        # Should indicate high burnout
        self.assertGreaterEqual(result['score'], 70)
        self.assertIn(result['interpretation'], ['moderate', 'high'])


class TestCompositeocbScore(unittest.TestCase):
    """Test composite ocb score calculation."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.config = ocbConfig()
    
    def test_calculate_composite_ocb_score(self):
        """Test composite ocb score calculation."""
        personal_score = 60.0
        work_related_score = 40.0
        
        result = calculate_composite_ocb_score(personal_score, work_related_score, self.config)
        
        self.assertIn('composite_score', result)
        self.assertIn('personal_score', result)
        self.assertIn('work_related_score', result)
        self.assertIn('interpretation', result)
        self.assertIn('risk_level', result)
        self.assertIn('score_breakdown', result)
        
        # Expected composite score with equal weights (0.5 each)
        expected_score = (personal_score * 0.5) + (work_related_score * 0.5)
        self.assertAlmostEqual(result['composite_score'], expected_score, places=2)
        
        # Check breakdown components
        self.assertAlmostEqual(
            result['score_breakdown']['personal_contribution'], 
            personal_score * 0.5, 
            places=2
        )
        self.assertAlmostEqual(
            result['score_breakdown']['work_related_contribution'], 
            work_related_score * 0.5, 
            places=2
        )
    
    def test_composite_score_interpretation_mapping(self):
        """Test that composite scores map to correct interpretations."""
        test_cases = [
            (10.0, 15.0, 'low'),      # Average: 12.5
            (30.0, 35.0, 'mild'),     # Average: 32.5
            (60.0, 65.0, 'moderate'), # Average: 62.5
            (80.0, 85.0, 'high'),     # Average: 82.5
        ]
        
        for personal, work_related, expected_interpretation in test_cases:
            result = calculate_composite_ocb_score(personal, work_related, self.config)
            self.assertEqual(result['interpretation'], expected_interpretation)


class TestocbInterpretation(unittest.TestCase):
    """Test ocb score interpretation functions."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.config = ocbConfig()
    
    def test_get_ocb_interpretation_ranges(self):
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
            result = get_ocb_interpretation(score, self.config)
            self.assertEqual(result, expected_interpretation, 
                           f"Score {score} should be '{expected_interpretation}', got '{result}'")


class TestocbValidation(unittest.TestCase):
    """Test ocb configuration validation."""
    
    def test_validate_default_config(self):
        """Test validation of default ocb configuration."""
        validation = validate_ocb_config()
        
        self.assertIn('dimension_weights_sum', validation)
        self.assertIn('personal_factors_sum', validation)
        self.assertIn('work_related_factors_sum', validation)
        self.assertIn('score_ranges_valid', validation)
        self.assertIn('scale_max_positive', validation)
        
        # All validations should pass
        for key, result in validation.items():
            self.assertTrue(result, f"Validation failed for {key}")
    
    def test_validate_custom_config(self):
        """Test validation of custom configuration."""
        config = ocbConfig()
        
        # Modify weights to create invalid configuration
        config.DIMENSION_WEIGHTS[ocbDimension.PERSONAL] = 0.6
        config.DIMENSION_WEIGHTS[ocbDimension.WORK_RELATED] = 0.5  # Sum > 1.0
        
        validation = validate_ocb_config(config)
        self.assertFalse(validation['dimension_weights_sum'])


class TestocbRecommendations(unittest.TestCase):
    """Test ocb-based recommendations."""
    
    def test_get_recommendations_high_composite(self):
        """Test recommendations for high composite score."""
        ocb_result = {
            'composite_score': 80.0,
            'personal_score': 75.0,
            'work_related_score': 85.0,
            'interpretation': 'high'
        }
        
        recommendations = get_ocb_recommendations(ocb_result)
        
        self.assertGreater(len(recommendations), 0)
        self.assertTrue(any('time off' in rec.lower() for rec in recommendations))
        self.assertTrue(any('manager' in rec.lower() for rec in recommendations))
    
    def test_get_recommendations_personal_dominant(self):
        """Test recommendations when personal burnout is dominant."""
        ocb_result = {
            'composite_score': 55.0,
            'personal_score': 70.0,  # 15+ points higher
            'work_related_score': 40.0,
            'interpretation': 'moderate'
        }
        
        recommendations = get_ocb_recommendations(ocb_result)
        
        self.assertTrue(any('personal recovery' in rec.lower() for rec in recommendations))
        self.assertTrue(any('sleep' in rec.lower() or 'exercise' in rec.lower() for rec in recommendations))
    
    def test_get_recommendations_work_dominant(self):
        """Test recommendations when work-related burnout is dominant."""
        ocb_result = {
            'composite_score': 55.0,
            'personal_score': 40.0,
            'work_related_score': 70.0,  # 30+ points higher
            'interpretation': 'moderate'
        }
        
        recommendations = get_ocb_recommendations(ocb_result)
        
        self.assertTrue(any('work-specific' in rec.lower() for rec in recommendations))
        self.assertTrue(any('team' in rec.lower() for rec in recommendations))
    
    def test_get_recommendations_low_score(self):
        """Test recommendations for low burnout score."""
        ocb_result = {
            'composite_score': 15.0,
            'personal_score': 12.0,
            'work_related_score': 18.0,
            'interpretation': 'low'
        }
        
        recommendations = get_ocb_recommendations(ocb_result)
        
        self.assertTrue(any('work-life balance' in rec.lower() for rec in recommendations))


class TestocbEdgeCases(unittest.TestCase):
    """Test ocb calculations with edge cases."""
    
    def test_zero_values(self):
        """Test ocb calculations with zero values."""
        metrics = {
            'work_hours_trend': 0.0,
            'weekend_work': 0.0,
            'after_hours_activity': 0.0,
            'vacation_usage': 0.0,
            'sleep_quality_proxy': 0.0
        }
        
        result = calculate_personal_burnout(metrics)
        self.assertEqual(result['score'], 0.0)
    
    def test_negative_values(self):
        """Test ocb calculations with negative values (should be treated as zero)."""
        metrics = {
            'work_hours_trend': -10.0,
            'weekend_work': -5.0,
        }
        
        result = calculate_personal_burnout(metrics)
        
        # Negative values should contribute 0 to the score
        self.assertGreaterEqual(result['score'], 0.0)
    
    def test_missing_config(self):
        """Test ocb calculations with None config (should use default)."""
        metrics = {
            'work_hours_trend': 50.0,
            'weekend_work': 20.0,
        }
        
        result = calculate_personal_burnout(metrics, None)
        self.assertIn('score', result)
        self.assertGreaterEqual(result['score'], 0.0)


if __name__ == '__main__':
    # Create a test suite
    test_suite = unittest.TestSuite()
    
    # Add test classes
    test_classes = [
        TestocbConfig,
        TestPersonalBurnoutCalculation,
        TestWorkRelatedBurnoutCalculation,
        TestCompositeocbScore,
        TestocbInterpretation,
        TestocbValidation,
        TestocbRecommendations,
        TestocbEdgeCases
    ]
    
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        test_suite.addTests(tests)
    
    # Run the tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    # Exit with error code if tests failed
    exit(0 if result.wasSuccessful() else 1)