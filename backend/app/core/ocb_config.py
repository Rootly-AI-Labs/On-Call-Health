"""
On-Call Burnout (OCB) Configuration Module

This module implements the On-Call Burnout methodology for burnout assessment.
OCB is inspired by the Copenhagen Burnout Inventory (CBI) which is scientifically validated and more applicable to software engineers than the Maslach approach.

OCB uses two dimensions for software engineers:
1. Personal Burnout (6 items) - Physical and psychological fatigue/exhaustion
2. Work-Related Burnout (7 items) - Fatigue/exhaustion specifically tied to work

Client-Related Burnout is omitted as it's not applicable to software engineers.
"""

from typing import Dict, Tuple, Any, List
from dataclasses import dataclass
from enum import Enum


class OCBDimension(Enum):
    """OCB Burnout Dimensions"""
    PERSONAL = "personal_burnout"
    WORK_RELATED = "work_related_burnout"


@dataclass
class OCBConfig:
    """Copenhagen Burnout Inventory Configuration"""
    
    # OCB Dimension Weights (must sum to 1.0)
    # Based on OCB research - equal weighting for software engineers
    DIMENSION_WEIGHTS = {
        OCBDimension.PERSONAL: 0.50,        # Physical/psychological fatigue
        OCBDimension.WORK_RELATED: 0.50     # Work-specific fatigue
    }
    
    # Personal Burnout Factor Mappings
    # Maps current metrics to OCB Personal Burnout items (0-100 scale)
    PERSONAL_BURNOUT_FACTORS = {
        'work_hours_trend': {
            'weight': 0.20,
            'description': 'Physical fatigue from excessive work hours',
            'calculation': 'hours_over_45_per_week',
            'scale_max': 100
        },
        'weekend_work': {
            'weight': 0.20,
            'description': 'Work-life boundary erosion affecting recovery',
            'calculation': 'weekend_activity_percentage',
            'scale_max': 50  # >50% weekend work = 100 burnout
        },
        'after_hours_activity': {
            'weight': 0.20,
            'description': 'Recovery time interference',
            'calculation': 'after_hours_percentage',
            'scale_max': 40  # >40% after hours = 100 burnout
        },
        'vacation_usage': {
            'weight': 0.15,
            'description': 'Recovery opportunity utilization (inverted)',
            'calculation': 'unused_pto_percentage',
            'scale_max': 80  # 80%+ unused PTO = 100 burnout
        },
        'sleep_quality_proxy': {
            'weight': 0.25,
            'description': 'Energy level estimation from late night activity and incident stress',
            'calculation': 'late_night_commits_frequency_and_incident_stress',
            'scale_max': 30
        }
    }
    
    # Work-Related Burnout Factor Mappings
    # Maps current metrics to OCB Work-Related Burnout items (0-100 scale)
    WORK_RELATED_BURNOUT_FACTORS = {
        'sprint_completion': {
            'weight': 0.15,  # Restored to reasonable level
            'description': 'Work pressure from missed deadlines',
            'calculation': 'missed_deadline_percentage',
            'scale_max': 50  # >50% missed deadlines = 100 burnout
        },
        'code_review_speed': {
            'weight': 0.15,  # Restored to reasonable level
            'description': 'Workload sustainability pressure',
            'calculation': 'review_turnaround_stress',
            'scale_max': 120  # >120 hour avg turnaround = 100 burnout
        },
        'pr_frequency': {
            'weight': 0.10,  # Restored to reasonable level
            'description': 'Work intensity from PR volume',
            'calculation': 'pr_volume_stress_score',
            'scale_max': 100  # Excessive or insufficient PRs = stress
        },
        'deployment_frequency': {
            'weight': 0.15,  # Restored to reasonable level
            'description': 'Delivery pressure from deployment stress',
            'calculation': 'deployment_pressure_score',
            'scale_max': 100  # Failed deploys + high frequency = stress
        },
        'meeting_load': {
            'weight': 0.10,  # Restored to reasonable level
            'description': 'Context switching burden',
            'calculation': 'meeting_density_impact',
            'scale_max': 80  # >80% day in meetings = 100 burnout
        },
        'oncall_burden': {
            'weight': 0.35,  # BALANCED: Important but not overwhelming
            'description': 'Work-related stress from incident response (severity-weighted)',
            'calculation': 'incident_response_frequency_with_severity',
            'scale_max': 100  # >100 severity-weighted incidents/week = 100% baseline (handles extreme loads)
        }
    }
    
    # OCB Score Interpretation Ranges (0-100 scale, sum of Personal + Work-Related points capped at 100)
    OCB_SCORE_RANGES = {
        'low': (0, 25),           # Minimal burnout (0-25 total points)
        'mild': (25, 50),         # Some burnout symptoms (25-50 total points)
        'moderate': (50, 75),     # Significant burnout (50-75 total points)
        'high': (75, 100)         # Severe burnout (75-100 total points)
    }
    
    # Risk Level Mapping (for compatibility with existing system)
    RISK_LEVEL_MAPPING = {
        'low': 'low',           # 0-25 OCB -> low risk
        'mild': 'medium',       # 25-50 OCB -> medium risk  
        'moderate': 'high',     # 50-75 OCB -> high risk
        'high': 'critical'      # 75-100 OCB -> critical risk
    }


def calculate_personal_burnout(metrics: Dict[str, float], config: OCBConfig = None) -> Dict[str, Any]:
    """
    Calculate Personal Burnout score using OCB methodology.
    
    Args:
        metrics: Dict of metric values
        config: Optional config override
        
    Returns:
        Dict with score, components, and details
    """
    if config is None:
        config = OCBConfig()
    
    factors = config.PERSONAL_BURNOUT_FACTORS
    component_scores = {}
    weighted_sum = 0.0
    total_weight = 0.0
    
    for factor_name, factor_config in factors.items():
        if factor_name in metrics:
            raw_value = max(0.0, metrics[factor_name])  # Ensure non-negative
            
            # Calculate score with reasonable cap (allow 150% for extreme cases)
            normalized_score = min(150.0, (raw_value / factor_config['scale_max']) * 100.0)
            
            # Apply weight
            weighted_score = normalized_score * factor_config['weight']
            component_scores[factor_name] = {
                'raw_value': raw_value,
                'normalized_score': round(normalized_score, 2),
                'weighted_score': round(weighted_score, 2),
                'weight': factor_config['weight'],
                'description': factor_config['description']
            }
            
            weighted_sum += weighted_score
            total_weight += factor_config['weight']
    
    # Calculate final score
    if total_weight > 0:
        final_score = weighted_sum / total_weight
    else:
        final_score = 0.0
    
    return {
        'score': round(final_score, 2),
        'components': component_scores,
        'dimension': OCBDimension.PERSONAL.value,
        'interpretation': get_ocb_interpretation(final_score, config),
        'data_completeness': total_weight
    }


def calculate_work_related_burnout(metrics: Dict[str, float], config: OCBConfig = None) -> Dict[str, Any]:
    """
    Calculate Work-Related Burnout score using OCB methodology.
    
    Args:
        metrics: Dict of metric values
        config: Optional config override
        
    Returns:
        Dict with score, components, and details
    """
    if config is None:
        config = OCBConfig()
    
    factors = config.WORK_RELATED_BURNOUT_FACTORS
    component_scores = {}
    weighted_sum = 0.0
    total_weight = 0.0
    
    for factor_name, factor_config in factors.items():
        if factor_name in metrics:
            raw_value = max(0.0, metrics[factor_name])  # Ensure non-negative
            
            # Calculate score with reasonable cap (allow 150% for extreme cases)
            normalized_score = min(150.0, (raw_value / factor_config['scale_max']) * 100.0)
            
            # Apply weight
            weighted_score = normalized_score * factor_config['weight']
            component_scores[factor_name] = {
                'raw_value': raw_value,
                'normalized_score': round(normalized_score, 2),
                'weighted_score': round(weighted_score, 2),
                'weight': factor_config['weight'],
                'description': factor_config['description']
            }
            
            weighted_sum += weighted_score
            total_weight += factor_config['weight']
    
    # Calculate final score
    if total_weight > 0:
        final_score = weighted_sum / total_weight
    else:
        final_score = 0.0
    
    return {
        'score': round(final_score, 2),
        'components': component_scores,
        'dimension': OCBDimension.WORK_RELATED.value,
        'interpretation': get_ocb_interpretation(final_score, config),
        'data_completeness': total_weight
    }


def calculate_composite_ocb_score(personal_score: float, work_related_score: float, 
                                config: OCBConfig = None) -> Dict[str, Any]:
    """
    Calculate composite OCB score from dimension scores.
    
    Args:
        personal_score: Personal Burnout score (0-100)
        work_related_score: Work-Related Burnout score (0-100)
        config: Optional config override
        
    Returns:
        Dict with composite score and analysis
    """
    if config is None:
        config = OCBConfig()
    
    weights = config.DIMENSION_WEIGHTS
    
    # Calculate weighted average as per OCB methodology
    composite_score = (
        personal_score * weights[OCBDimension.PERSONAL] +
        work_related_score * weights[OCBDimension.WORK_RELATED]
    )
    
    interpretation = get_ocb_interpretation(composite_score, config)
    risk_level = config.RISK_LEVEL_MAPPING[interpretation]
    
    return {
        'composite_score': round(composite_score, 2),
        'personal_score': round(personal_score, 2),
        'work_related_score': round(work_related_score, 2),
        'interpretation': interpretation,
        'risk_level': risk_level,
        'dimension_weights': dict(weights),
        'score_breakdown': {
            'personal_contribution': round(personal_score * weights[OCBDimension.PERSONAL], 2),
            'work_related_contribution': round(work_related_score * weights[OCBDimension.WORK_RELATED], 2)
        }
    }


def get_ocb_interpretation(score: float, config: OCBConfig = None) -> str:
    """
    Get OCB score interpretation based on standard ranges.

    Args:
        score: OCB score (0-100)
        config: Optional config override
        
    Returns:
        Interpretation string: 'low', 'mild', 'moderate', or 'high'
    """
    if config is None:
        config = OCBConfig()
    
    ranges = config.OCB_SCORE_RANGES
    
    for level, (min_score, max_score) in ranges.items():
        if min_score <= score < max_score:
            return level
    
    # Handle edge case for score = 100
    if score >= 75:
        return 'high'
    
    return 'low'


def validate_ocb_config(config: OCBConfig = None) -> Dict[str, bool]:
    """
    Validate OCB configuration for mathematical consistency.
    
    Args:
        config: Config to validate
        
    Returns:
        Dict of validation results
    """
    if config is None:
        config = OCBConfig()
    
    results = {}
    
    # Check dimension weights sum to 1.0
    dimension_sum = sum(config.DIMENSION_WEIGHTS.values())
    results['dimension_weights_sum'] = abs(dimension_sum - 1.0) < 0.001
    
    # Check personal burnout factor weights sum to 1.0
    personal_sum = sum(factor['weight'] for factor in config.PERSONAL_BURNOUT_FACTORS.values())
    results['personal_factors_sum'] = abs(personal_sum - 1.0) < 0.001
    
    # Check work-related burnout factor weights sum to 1.0
    work_sum = sum(factor['weight'] for factor in config.WORK_RELATED_BURNOUT_FACTORS.values())
    results['work_related_factors_sum'] = abs(work_sum - 1.0) < 0.001
    
    # Check score ranges are properly ordered and cover 0-100
    ranges = config.OCB_SCORE_RANGES
    results['score_ranges_valid'] = (
        ranges['low'][0] == 0 and
        ranges['low'][1] == ranges['mild'][0] and
        ranges['mild'][1] == ranges['moderate'][0] and
        ranges['moderate'][1] == ranges['high'][0] and
        ranges['high'][1] == 100
    )
    
    # Check all scale_max values are positive
    personal_scales_valid = all(
        factor['scale_max'] > 0 
        for factor in config.PERSONAL_BURNOUT_FACTORS.values()
    )
    work_scales_valid = all(
        factor['scale_max'] > 0 
        for factor in config.WORK_RELATED_BURNOUT_FACTORS.values()
    )
    results['scale_max_positive'] = personal_scales_valid and work_scales_valid
    
    return results


def generate_ocb_score_reasoning(
    personal_result: Dict[str, Any], 
    work_result: Dict[str, Any], 
    composite_result: Dict[str, Any],
    raw_metrics: Dict[str, Any] = None
) -> List[str]:
    """
    Generate human-readable explanations for why someone has their OCB score.
    
    Args:
        personal_result: Personal burnout calculation result
        work_result: Work-related burnout calculation result
        composite_result: Composite OCB score result
        raw_metrics: Original metrics data for context
        
    Returns:
        List of reasoning strings explaining the score
    """
    reasons = []
    personal_score = personal_result['score']
    work_score = work_result['score']
    composite_score = composite_result['composite_score']
    
    # Overall score context
    if composite_score >= 75:
        reasons.append(f"Critical burnout risk (OCB: {composite_score:.0f}/100) - immediate attention needed")
    elif composite_score >= 50:
        reasons.append(f"High burnout risk (OCB: {composite_score:.0f}/100) - monitor closely")
    elif composite_score >= 25:
        reasons.append(f"Moderate stress levels (OCB: {composite_score:.0f}/100) - manageable with care")
    else:
        reasons.append(f"Low burnout risk (OCB: {composite_score:.0f}/100) - healthy stress levels")
    
    # Organize factors by dimension with clean separation and avoid redundancy
    personal_factors = []
    work_factors = []

    # Collect research-based insights to avoid duplication
    time_data = raw_metrics.get('time_impact_analysis', {}) if raw_metrics else {}
    recovery_data = raw_metrics.get('recovery_analysis', {}) if raw_metrics else {}
    trauma_data = raw_metrics.get('trauma_analysis', {}) if raw_metrics else {}
    severity_dist = raw_metrics.get('severity_distribution', {}) if raw_metrics else {}

    # Personal burnout contributors
    # Always show personal factors regardless of score
    personal_components = personal_result.get('components', {})
    if personal_components:
        top_personal = sorted(personal_components.items(), key=lambda x: x[1].get('weighted_score', 0), reverse=True)
        
        # Use the same total_weight that was used in the final score calculation
        # This is stored in data_completeness and represents the sum of weights for all factors with data
        total_weight = personal_result.get('data_completeness', 0)
        if total_weight == 0:
            # Fallback: calculate from components if data_completeness not available
            total_weight = sum(factor_data.get('weight', 0) for factor_data in personal_components.values())

        for factor_name, factor_data in top_personal:  # Show all contributors
            weighted_score = factor_data.get('weighted_score', 0)
            normalized_score = factor_data.get('normalized_score', 0)
            factor_weight = factor_data.get('weight', 0)
            if weighted_score > 0:  # Show all factors with any contribution
                # Calculate contribution to final score: weighted_score / total_weight
                # This ensures the sum of displayed contributions equals the final score
                if total_weight > 0:
                    contribution = weighted_score / total_weight
                    display_score = round(contribution, 1)
                else:
                    display_score = round(normalized_score, 1)
                if factor_name == 'sleep_quality_proxy':
                    personal_factors.append(f"Sleep quality impact from critical incidents ({display_score:.1f} points)")
                    # Add critical incident details
                    critical_count = trauma_data.get('critical_incidents', 0) if raw_metrics else 0
                    compound_factor = trauma_data.get('compound_factor', 1.0) if raw_metrics else 1.0
                    if critical_count > 0:
                        personal_factors.append(f"  • {critical_count} critical incidents (compound factor: {compound_factor:.2f}x)")
                    if critical_count >= 5:
                        personal_factors.append(f"  • Research insight: 5+ critical incidents create exponential psychological impact")

                elif factor_name == 'vacation_usage':
                    personal_factors.append(f"Recovery time between incidents ({display_score:.1f} points)")
                    # Add recovery pattern details
                    recovery_violations = recovery_data.get('recovery_violations', 0) if raw_metrics else 0
                    avg_recovery = recovery_data.get('avg_recovery_hours', 0) if raw_metrics else 0
                    if recovery_violations > 0:
                        personal_factors.append(f"  • Recovery periods <48 hours: {recovery_violations} occurrences")
                    if avg_recovery > 0 and avg_recovery < 168:
                        personal_factors.append(f"  • Average recovery time: {avg_recovery:.1f} hours")

                elif factor_name == 'work_hours_trend':
                    personal_factors.append(f"Extended work hours ({display_score:.1f} points)")
                    # Add time pattern details for extended work hours
                    after_hours_count = time_data.get('after_hours_incidents', 0) if raw_metrics else 0
                    if after_hours_count > 0:
                        personal_factors.append(f"  • After-hours incidents: {after_hours_count} incidents")

                elif factor_name == 'after_hours_activity':
                    personal_factors.append(f"Non-business hours incident activity ({display_score:.1f} points)")
                    # Add time pattern details
                    after_hours_count = time_data.get('after_hours_incidents', 0) if raw_metrics else 0
                    overnight_count = time_data.get('overnight_incidents', 0) if raw_metrics else 0
                    if after_hours_count > 0:
                        personal_factors.append(f"  • After-hours incidents: {after_hours_count} incidents")
                    if overnight_count > 0:
                        personal_factors.append(f"  • Overnight incidents: {overnight_count} incidents")

                elif factor_name == 'weekend_work':
                    personal_factors.append(f"Weekend incident activity ({display_score:.1f} points)")
                    # Add weekend pattern details
                    weekend_count = time_data.get('weekend_incidents', 0) if raw_metrics else 0
                    if weekend_count > 0:
                        personal_factors.append(f"  • Weekend incidents: {weekend_count} incidents")

    # Collect time pattern and recovery data for separate display
    time_patterns = []
    recovery_patterns = []
    trauma_patterns = []

    if raw_metrics:
        # Critical incidents insights
        critical_count = trauma_data.get('critical_incidents', 0)
        compound_factor = trauma_data.get('compound_factor', 1.0)
        if critical_count > 0:
            trauma_patterns.append(f"Multiple critical incidents: {critical_count} incidents (compound factor: {compound_factor:.2f}x)")

        # Time impact insights
        after_hours_count = time_data.get('after_hours_incidents', 0)
        weekend_count = time_data.get('weekend_incidents', 0)
        overnight_count = time_data.get('overnight_incidents', 0)

        if after_hours_count > 0:
            time_patterns.append(f"After-hours incidents: {after_hours_count} incidents")
        if weekend_count > 0:
            time_patterns.append(f"Weekend incidents: {weekend_count} incidents")
        if overnight_count > 0:
            time_patterns.append(f"Overnight incidents: {overnight_count} incidents")

        # Recovery insights
        recovery_violations = recovery_data.get('recovery_violations', 0)
        avg_recovery = recovery_data.get('avg_recovery_hours', 0)
        if recovery_violations > 0:
            recovery_patterns.append(f"Recovery periods <48 hours: {recovery_violations} occurrences")
        if avg_recovery > 0 and avg_recovery < 168:  # Less than 1 week
            recovery_patterns.append(f"Average recovery time: {avg_recovery:.1f} hours")
    
    # Work-related burnout contributors
    # Always show work-related factors regardless of score
    work_components = work_result.get('components', {})
    if work_components:
        top_work = sorted(work_components.items(), key=lambda x: x[1].get('weighted_score', 0), reverse=True)
        
        # Use the same total_weight that was used in the final score calculation
        # This is stored in data_completeness and represents the sum of weights for all factors with data
        total_weight = work_result.get('data_completeness', 0)
        if total_weight == 0:
            # Fallback: calculate from components if data_completeness not available
            total_weight = sum(factor_data.get('weight', 0) for factor_data in work_components.values())

        for factor_name, factor_data in top_work:  # Show all contributors
            weighted_score = factor_data.get('weighted_score', 0)
            normalized_score = factor_data.get('normalized_score', 0)
            factor_weight = factor_data.get('weight', 0)
            if weighted_score > 0:  # Show all factors with any contribution
                # Calculate contribution to final score: weighted_score / total_weight
                # This ensures the sum of displayed contributions equals the final score
                if total_weight > 0:
                    contribution = weighted_score / total_weight
                    display_score = round(contribution, 1)
                else:
                    display_score = round(normalized_score, 1)
                if factor_name == 'oncall_burden':
                    total_incidents = sum(severity_dist.values()) if severity_dist else 0
                    if total_incidents > 0:
                        work_factors.append(f"On-call responsibility load: {total_incidents} total incidents ({display_score:.1f} points)")
                    else:
                        work_factors.append(f"On-call responsibility load ({display_score:.1f} points)")

                elif factor_name == 'deployment_frequency':
                    # Include severity breakdown in critical production incident frequency
                    if severity_dist:
                        severity_breakdown = []
                        total_incidents = sum(severity_dist.values())
                        for severity, count in severity_dist.items():
                            if count > 0:
                                severity_breakdown.append(f"{count} {severity}")
                        if severity_breakdown:
                            severity_text = ", ".join(severity_breakdown)
                            work_factors.append(f"Critical production incident frequency: {severity_text} ({display_score:.1f} points total for {total_incidents} incidents)")
                        else:
                            work_factors.append(f"Critical production incident frequency ({display_score:.1f} points)")
                    else:
                        work_factors.append(f"Critical production incident frequency ({display_score:.1f} points)")
                    # Add critical incident compound factor details
                    critical_count = trauma_data.get('critical_incidents', 0) if raw_metrics else 0
                    compound_factor = trauma_data.get('compound_factor', 1.0) if raw_metrics else 1.0
                    if critical_count > 0 and compound_factor > 1.0:
                        work_factors.append(f"  • Compound trauma factor: {compound_factor:.2f}x psychological impact")

                elif factor_name == 'pr_frequency':
                    work_factors.append(f"Incident severity-weighted workload ({display_score:.1f} points)")
                    # Add severity distribution details
                    if severity_dist:
                        high_severity = severity_dist.get('SEV0', 0) + severity_dist.get('SEV1', 0)
                        if high_severity > 0:
                            work_factors.append(f"  • High-severity incidents (SEV0/SEV1): {high_severity} incidents")

                elif factor_name == 'sprint_completion':
                    work_factors.append(f"Response time requirements ({display_score:.1f} points)")

                elif factor_name == 'meeting_load':
                    work_factors.append(f"Incident response meeting load ({display_score:.1f} points)")
                
                elif factor_name == 'code_review_speed':
                    work_factors.append(f"Code review speed pressure ({display_score:.1f} points)")

    # Add work-related baseline information
    if raw_metrics:
        total_incidents = sum(severity_dist.values()) if severity_dist else 0
        if total_incidents > 0:
            work_factors.append(f"Total incident volume: {total_incidents} incidents handled")

    # Output organized factors with clear headers
    if personal_factors:
        reasons.append("PERSONAL:")
        for factor in personal_factors:
            reasons.append(f"• {factor}")

    if work_factors:
        reasons.append("WORK-RELATED:")
        for factor in work_factors:
            reasons.append(f"• {factor}")

    
    # Dimensional comparison
    if abs(personal_score - work_score) > 15:
        if personal_score > work_score:
            reasons.append("Personal stress significantly higher than work stress - focus on recovery and boundaries")
        else:
            reasons.append("Work stress significantly higher than personal stress - address workload and processes")
    
    return reasons


def get_ocb_recommendations(ocb_result: Dict[str, Any]) -> List[str]:
    """
    Generate actionable recommendations based on OCB scores.
    
    Args:
        ocb_result: Result from calculate_composite_ocb_score
        
    Returns:
        List of recommendation strings
    """
    recommendations = []
    composite_score = ocb_result['composite_score']
    personal_score = ocb_result['personal_score']
    work_related_score = ocb_result['work_related_score']
    
    # General recommendations based on composite score
    if composite_score >= 75:
        recommendations.append("Consider taking time off or reducing workload immediately")
        recommendations.append("Schedule a meeting with your manager about workload concerns")
    elif composite_score >= 50:
        recommendations.append("Monitor workload and stress levels closely")
        recommendations.append("Consider stress management techniques or counseling")
    elif composite_score >= 25:
        recommendations.append("Practice good work-life balance habits")
        recommendations.append("Regular exercise and adequate sleep are important")
    else:
        recommendations.append("Maintain current work-life balance habits")
        recommendations.append("Continue regular exercise and adequate sleep routines")
    
    # Specific recommendations based on dimension scores
    if personal_score > work_related_score + 15:
        recommendations.append("Focus on personal recovery: sleep, exercise, and downtime")
        recommendations.append("Consider if work hours are sustainable long-term")
    elif work_related_score > personal_score + 15:
        recommendations.append("Address work-specific stressors: deadlines, workload, or team dynamics")
        recommendations.append("Discuss work processes and expectations with your team")
    
    return recommendations


def validate_factor_consistency(personal_result: Dict, work_result: Dict, raw_metrics: Dict) -> Dict[str, Any]:
    """
    Validate that OCB factors don't double count underlying data sources.

    Args:
        personal_result: Personal burnout calculation result
        work_result: Work-related burnout calculation result
        raw_metrics: Raw metrics used in calculations

    Returns:
        Dict with validation results and warnings
    """
    warnings = []
    validation_passed = True

    # Check for potential double counting
    personal_components = personal_result.get('components', {})
    work_components = work_result.get('components', {})

    # Warning: If both personal and work factors reference incident data heavily
    incident_related_personal = sum([
        personal_components.get('sleep_quality_proxy', {}).get('weighted_score', 0),
        personal_components.get('after_hours_activity', {}).get('weighted_score', 0),
        personal_components.get('weekend_work', {}).get('weighted_score', 0)
    ])

    incident_related_work = sum([
        work_components.get('oncall_burden', {}).get('weighted_score', 0),
        work_components.get('pr_frequency', {}).get('weighted_score', 0),
        work_components.get('deployment_frequency', {}).get('weighted_score', 0)
    ])

    total_incident_attribution = incident_related_personal + incident_related_work

    if total_incident_attribution > 80:  # High threshold for concern
        warnings.append(f"High incident data attribution detected: {total_incident_attribution:.1f} points across both dimensions")
        warnings.append("Consider if factors are referencing overlapping incident impact")

    # Validation summary
    return {
        'validation_passed': validation_passed,
        'warnings': warnings,
        'incident_attribution': {
            'personal': incident_related_personal,
            'work': incident_related_work,
            'total': total_incident_attribution
        }
    }


# Global singleton instance
DEFAULT_OCB_CONFIG = OCBConfig()