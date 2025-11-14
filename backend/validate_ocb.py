#!/usr/bin/env python3
"""
Simple validation script for OCB calculations.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from core.ocb_config import (
    OCBConfig,
    calculate_personal_burnout,
    calculate_work_related_burnout,
    calculate_composite_ocb_score,
    validate_ocb_config
)

def main():
    print("=== OCB Configuration Validation ===")
    
    # Test configuration validation
    config = OCBConfig()
    validation = validate_ocb_config(config)
    
    print(f"Configuration validation results:")
    for key, result in validation.items():
        status = "✓" if result else "✗"
        print(f"  {status} {key}: {result}")
    
    all_passed = all(validation.values())
    print(f"\nAll validations passed: {all_passed}")
    
    if not all_passed:
        return 1
    
    print("\n=== OCB Calculation Tests ===")
    
    # Test personal burnout calculation
    personal_metrics = {
        'work_hours_trend': 50.0,
        'weekend_work': 20.0,
        'after_hours_activity': 25.0,
        'vacation_usage': 60.0,
        'sleep_quality_proxy': 15.0
    }
    
    personal_result = calculate_personal_burnout(personal_metrics)
    print(f"\nPersonal Burnout Test:")
    print(f"  Score: {personal_result['score']}")
    print(f"  Interpretation: {personal_result['interpretation']}")
    print(f"  Components: {len(personal_result['components'])}")
    
    # Test work-related burnout calculation
    work_metrics = {
        'sprint_completion': 30.0,
        'code_review_speed': 48.0,
        'pr_frequency': 60.0,
        'deployment_frequency': 70.0,
        'meeting_load': 50.0,
        'oncall_burden': 5.0
    }
    
    work_result = calculate_work_related_burnout(work_metrics)
    print(f"\nWork-Related Burnout Test:")
    print(f"  Score: {work_result['score']}")
    print(f"  Interpretation: {work_result['interpretation']}")
    print(f"  Components: {len(work_result['components'])}")
    
    # Test composite score calculation
    composite_result = calculate_composite_ocb_score(
        personal_result['score'], 
        work_result['score']
    )
    
    print(f"\nComposite OCB Score Test:")
    print(f"  Composite Score: {composite_result['composite_score']}")
    print(f"  Interpretation: {composite_result['interpretation']}")
    print(f"  Risk Level: {composite_result['risk_level']}")
    
    print("\n=== Edge Case Tests ===")
    
    # Test with negative values
    negative_metrics = {
        'work_hours_trend': -10.0,
        'weekend_work': -5.0,
    }
    
    negative_result = calculate_personal_burnout(negative_metrics)
    print(f"\nNegative Values Test:")
    print(f"  Score: {negative_result['score']} (should be >= 0)")
    
    # Test with no metrics
    empty_result = calculate_personal_burnout({})
    print(f"\nEmpty Metrics Test:")
    print(f"  Score: {empty_result['score']} (should be 0)")
    
    print("\n=== All OCB Tests Completed Successfully ===")
    return 0

if __name__ == '__main__':
    exit(main())