"""
On-Call Health (OCH) Configuration Module

This module implements the On-Call Health methodology for burnout assessment.
OCH is scientifically informed and specifically adapted for software engineers and on-call work.

OCH uses two dimensions for software engineers:
1. Personal Burnout (6 items) - Physical and psychological fatigue/exhaustion
2. Work-Related Burnout (7 items) - Fatigue/exhaustion specifically tied to work

Client-Related Burnout is omitted as it's not applicable to software engineers.
"""

from typing import Dict, Tuple, Any, List
from dataclasses import dataclass
from enum import Enum


class OCHDimension(Enum):
    """OCH Burnout Dimensions"""
    PERSONAL = "personal_burnout"
    WORK_RELATED = "work_related_burnout"


@dataclass
class OCHConfig:
    """On-Call Health Configuration"""

    # Alert Health Score Multiplier
    # Adjust the weight/impact of alert metrics on OCH score.
    # Set to 5.0 intentionally: alert_health raw scores tend to be low (10-20/100)
    # because the formula averages weighted percentages across 6 factors.
    # The multiplier amplifies these signals to a meaningful range before blending.
    # < 1.0: reduce impact (e.g., 0.5 = 50% weight)
    # > 1.0: increase impact (e.g., 2.0 = double, 5.0 = 5x amplification)
    ALERT_HEALTH_MULTIPLIER = 5.0

    # OCH Dimension Weights (must sum to 1.0)
    # Research-informed: Personal factors (work-life balance) contribute more to burnout
    DIMENSION_WEIGHTS = {
        OCHDimension.PERSONAL: 0.65,        # Physical/psychological fatigue (65%)
        OCHDimension.WORK_RELATED: 0.35     # Work-specific fatigue (35%)
    }

    # Personal Burnout Factor Mappings
    # Maps current metrics to OCH Personal Burnout items (0-100 scale)
    # Research-informed weighting: Work-life balance factors (after-hours, severity, task load)
    # Weights must sum to 1.0 within this dimension
    PERSONAL_BURNOUT_FACTORS = {
        'after_hours_activity': {
            'weight': 0.462,  # 0.462 * 0.65 = 30% of total (strongest burnout predictor)
            'description': 'Recovery time interference and work-life boundary erosion (includes weekend work)',
            'calculation': 'after_hours_percentage_with_time_multiplier',
            'scale_max': 30  # >30% after hours = 100 burnout
        },
        'sleep_quality_proxy': {
            'weight': 0.385,  # 0.385 * 0.65 = 25% of total (high-severity incident stress)
            'description': 'Psychological impact from high-severity incidents',
            'calculation': 'high_severity_incident_impact',
            'scale_max': 30  # Severity-weighted incidents
        },
        'work_hours_trend': {
            'weight': 0.154,  # 0.154 * 0.65 = 10% of total (task load from JIRA/Linear)
            'description': 'Physical fatigue from task workload',
            'calculation': 'jira_linear_task_load',
            'scale_max': 100
        }
    }  # Total Personal Burnout: 30 + 25 + 10 = 65 points

    # Work-Related Burnout Factor Mappings
    # Maps current metrics to OCH Work-Related Burnout items (0-100 scale)
    # Research-informed weighting: On-call burden, sustained stress, and alert health
    # Weights must sum to 1.0 within this dimension
    WORK_RELATED_BURNOUT_FACTORS = {
        'oncall_burden': {
            'weight': 0.357,  # 0.357 * 0.35 = 12.5% of total (on-call responsibility load)
            'description': 'Work-related stress from on-call incident response (severity-weighted)',
            'calculation': 'incident_response_frequency_with_severity',
            'scale_max': 100  # >100 severity-weighted incidents/week = 100% baseline
        },
        'sprint_completion': {
            'weight': 0.215,  # 0.215 * 0.35 = 7.5% of total (consecutive incident days)
            'description': 'Sustained stress from consecutive incident days without recovery',
            'calculation': 'consecutive_incident_days',
            'scale_max': 7  # 7+ consecutive days = 100 burnout
        },
        'alert_health': {
            'weight': 0.428,  # 0.428 * 0.35 = 15% of total (alert quality and burden)
            'description': 'Alert burden and quality impact: night-time disruption, escalation rate, retriggered issues',
            'calculation': 'alert_health_score_normalized',
            'scale_max': 100  # 0-100 normalized alert health score
        }
    }  # Total Work-Related Burnout: 12.5 + 7.5 + 15 = 35 points

    # OCH Score Interpretation Ranges (0-100 scale, sum of Personal + Work-Related points capped at 100)
    OCH_SCORE_RANGES = {
        'low': (0, 25),           # Minimal burnout (0-25 total points)
        'mild': (25, 50),         # Some burnout symptoms (25-50 total points)
        'moderate': (50, 75),     # Significant burnout (50-75 total points)
        'high': (75, 100)         # Severe burnout (75-100 total points)
    }

    # Risk Level Mapping (for compatibility with existing system)
    RISK_LEVEL_MAPPING = {
        'low': 'low',           # 0-25 OCH -> low risk
        'mild': 'medium',       # 25-50 OCH -> medium risk
        'moderate': 'high',     # 50-75 OCH -> high risk
        'high': 'critical'      # 75-100 OCH -> critical risk
    }


def calculate_personal_burnout(metrics: Dict[str, float], config: OCHConfig = None) -> Dict[str, Any]:
    """
    Calculate Personal Burnout score using OCH methodology.

    Args:
        metrics: Dict of metric values
        config: Optional config override

    Returns:
        Dict with score, components, and details
    """
    if config is None:
        config = OCHConfig()

    return _calculate_dimension_score(
        metrics=metrics,
        factors=config.PERSONAL_BURNOUT_FACTORS,
        dimension=OCHDimension.PERSONAL,
        config=config,
    )


def calculate_work_related_burnout(metrics: Dict[str, float], config: OCHConfig = None) -> Dict[str, Any]:
    """
    Calculate Work-Related Burnout score using OCH methodology.

    Args:
        metrics: Dict of metric values
        config: Optional config override

    Returns:
        Dict with score, components, and details
    """
    if config is None:
        config = OCHConfig()

    return _calculate_dimension_score(
        metrics=metrics,
        factors=config.WORK_RELATED_BURNOUT_FACTORS,
        dimension=OCHDimension.WORK_RELATED,
        config=config,
    )


def _calculate_dimension_score(
    metrics: Dict[str, float],
    factors: Dict[str, Dict[str, Any]],
    dimension: OCHDimension,
    config: OCHConfig,
) -> Dict[str, Any]:
    """Shared scorer for personal and work-related OCH dimensions."""
    component_scores = {}
    weighted_sum = 0.0
    total_weight = 0.0

    for factor_name, factor_config in factors.items():
        if factor_name not in metrics:
            continue

        raw_value = max(0.0, metrics[factor_name])
        normalized_score = min(150.0, (raw_value / factor_config['scale_max']) * 100.0)
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

    final_score = (weighted_sum / total_weight) if total_weight > 0 else 0.0

    return {
        'score': round(final_score, 2),
        'components': component_scores,
        'dimension': dimension.value,
        'interpretation': get_och_interpretation(final_score, config),
        'data_completeness': total_weight
    }


def apply_alert_health_to_och(member: dict, alert_health_score: float) -> dict:
    """
    Post-process: blend alert health score into an already-computed OCH result.

    Called after alert data is attached to members (analyses.py), since alert
    data is not available at the time _analyze_member_burnout runs.

    The work-related score was originally calculated with only oncall_burden (0.357)
    and sprint_completion (0.215), totalling weight 0.572. We now re-normalize
    by including alert_health (0.428) to get total weight 1.0.

    Args:
        member: Member dict with existing och_score, och_breakdown, risk_level
        alert_health_score: Normalized 0-100 alert health score (already multiplied)

    Returns:
        Updated member dict with recalculated och_score, risk_level, och_breakdown
    """
    config = OCHConfig()

    # Weights without alert_health (what was used when the analyzer ran)
    existing_weight = sum(
        v['weight'] for k, v in config.WORK_RELATED_BURNOUT_FACTORS.items()
        if k != 'alert_health'
    )  # 0.357 + 0.215 = 0.572
    alert_weight = config.WORK_RELATED_BURNOUT_FACTORS['alert_health']['weight']  # 0.428
    work_dim_weight = config.DIMENSION_WEIGHTS[OCHDimension.WORK_RELATED]         # 0.35
    personal_dim_weight = config.DIMENSION_WEIGHTS[OCHDimension.PERSONAL]         # 0.65

    existing_work = member.get('och_breakdown', {}).get('work_related', 0.0)
    existing_personal = member.get('och_breakdown', {}).get('personal', 0.0)

    # Reconstruct weighted sum from existing score, then add alert contribution:
    # existing_work = weighted_sum / existing_weight
    # new_work_score = (existing_work * existing_weight + alert_health_score * alert_weight) / 1.0
    normalized_alert = min(150.0, alert_health_score)
    new_work_score = (existing_work * existing_weight) + (normalized_alert * alert_weight)

    # Recalculate composite
    new_composite = (existing_personal * personal_dim_weight) + (new_work_score * work_dim_weight)
    new_composite_capped = round(min(100.0, new_composite), 2)

    # Recalculate interpretation and risk level
    interpretation = get_och_interpretation(new_composite_capped)
    risk_level = config.RISK_LEVEL_MAPPING[interpretation]

    member['och_score'] = new_composite_capped
    member['risk_level'] = risk_level
    member['och_breakdown'] = {
        **member.get('och_breakdown', {}),
        'work_related': round(new_work_score, 2),
        'interpretation': interpretation
    }
    return member


def calculate_composite_och_score(personal_score: float, work_related_score: float,
                                config: OCHConfig = None) -> Dict[str, Any]:
    """
    Calculate composite OCH score from dimension scores.

    Args:
        personal_score: Personal Burnout score (0-100)
        work_related_score: Work-Related Burnout score (0-100)
        config: Optional config override

    Returns:
        Dict with composite score and analysis
    """
    if config is None:
        config = OCHConfig()

    weights = config.DIMENSION_WEIGHTS

    # Calculate weighted average as per OCH methodology
    composite_score = (
        personal_score * weights[OCHDimension.PERSONAL] +
        work_related_score * weights[OCHDimension.WORK_RELATED]
    )

    interpretation = get_och_interpretation(composite_score, config)
    risk_level = config.RISK_LEVEL_MAPPING[interpretation]

    return {
        'composite_score': round(composite_score, 2),
        'personal_score': round(personal_score, 2),
        'work_related_score': round(work_related_score, 2),
        'interpretation': interpretation,
        'risk_level': risk_level,
        'dimension_weights': dict(weights),
        'score_breakdown': {
            'personal_contribution': round(personal_score * weights[OCHDimension.PERSONAL], 2),
            'work_related_contribution': round(work_related_score * weights[OCHDimension.WORK_RELATED], 2)
        }
    }


def get_och_interpretation(score: float, config: OCHConfig = None) -> str:
    """
    Get OCH score interpretation based on standard ranges.

    Args:
        score: OCH score (0-100)
        config: Optional config override

    Returns:
        Interpretation string: 'low', 'mild', 'moderate', or 'high'
    """
    if config is None:
        config = OCHConfig()

    ranges = config.OCH_SCORE_RANGES

    for level, (min_score, max_score) in ranges.items():
        if min_score <= score < max_score:
            return level

    # Handle edge case for score = 100
    if score >= 75:
        return 'high'

    return 'low'


def validate_och_config(config: OCHConfig = None) -> Dict[str, bool]:
    """
    Validate OCH configuration for mathematical consistency.

    Args:
        config: Config to validate

    Returns:
        Dict of validation results
    """
    if config is None:
        config = OCHConfig()

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
    ranges = config.OCH_SCORE_RANGES
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


def generate_och_score_reasoning(
    personal_result: Dict[str, Any],
    work_result: Dict[str, Any],
    composite_result: Dict[str, Any],
    raw_metrics: Dict[str, Any] = None
) -> List[str]:
    """
    Generate human-readable explanations for why someone has their OCH score.

    Args:
        personal_result: Personal burnout calculation result
        work_result: Work-related burnout calculation result
        composite_result: Composite OCH score result
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
        reasons.append(f"Critical burnout risk (OCH: {composite_score:.0f}/100) - immediate attention needed")
    elif composite_score >= 50:
        reasons.append(f"High burnout risk (OCH: {composite_score:.0f}/100) - monitor closely")
    elif composite_score >= 25:
        reasons.append(f"Moderate stress levels (OCH: {composite_score:.0f}/100) - manageable with care")
    else:
        reasons.append(f"Low burnout risk (OCH: {composite_score:.0f}/100) - healthy stress levels")

    # Organize factors by dimension with clean separation and avoid redundancy
    personal_factors = []
    work_factors = []

    # Get severity distribution for work-related factors
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
                    personal_factors.append(f"High-severity incident stress ({display_score:.1f} points)")

                elif factor_name == 'work_hours_trend':
                    personal_factors.append(f"High task load ({display_score:.1f} points)")

                elif factor_name == 'after_hours_activity':
                    personal_factors.append(f"Non-business hours incident activity ({display_score:.1f} points)")

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

                elif factor_name == 'sprint_completion':
                    work_factors.append(f"Consecutive days with incidents ({display_score:.1f} points)")

                elif factor_name == 'alert_health':
                    work_factors.append(f"Alert health score - night-time, escalations, retriggered issues ({display_score:.1f} points)")


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


def get_structured_och_factors(
    personal_result: Dict[str, Any],
    work_result: Dict[str, Any],
    composite_score: float
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Generate structured factor data with percentages for frontend display.

    Args:
        personal_result: Personal burnout calculation result
        work_result: Work-related burnout calculation result
        composite_score: Total OCH composite score

    Returns:
        Dict with 'personal' and 'work_related' lists of factor objects
    """
    # Human-readable names for factors
    factor_display_names = {
        'sleep_quality_proxy': 'High-severity incidents',
        'work_hours_trend': 'Task load',
        'after_hours_activity': 'After-hours activity',
        'oncall_burden': 'On-call load',
        'alert_health': 'Alert health & burden',
        'sprint_completion': 'Consecutive incident days',
    }

    def extract_factors(result: Dict[str, Any], dimension: str) -> List[Dict[str, Any]]:
        """Extract and format factors from a dimension result."""
        factors = []
        components = result.get('components', {})
        total_weight = result.get('data_completeness', 0)
        config = OCHConfig()
        dimension_weight = (
            config.DIMENSION_WEIGHTS[OCHDimension.PERSONAL]
            if dimension == 'personal'
            else config.DIMENSION_WEIGHTS[OCHDimension.WORK_RELATED]
        )

        if total_weight == 0:
            total_weight = sum(c.get('weight', 0) for c in components.values())

        for factor_name, factor_data in components.items():
            weighted_score = factor_data.get('weighted_score', 0)
            if weighted_score > 0:
                # Calculate contribution to the dimension score
                contribution = weighted_score / total_weight if total_weight > 0 else 0

                percentage = (
                    (contribution * dimension_weight) / composite_score * 100
                    if composite_score > 0
                    else 0
                )

                factors.append({
                    'key': factor_name,
                    'name': factor_display_names.get(factor_name, factor_name),
                    'points': round(contribution, 1),
                    'percentage': round(percentage, 1),
                    'dimension': dimension
                })

        # Sort by percentage contribution (highest first)
        factors.sort(key=lambda x: x['percentage'], reverse=True)
        return factors

    personal_factors = extract_factors(personal_result, 'personal')
    work_factors = extract_factors(work_result, 'work_related')

    # Also create a combined list sorted by percentage
    all_factors = personal_factors + work_factors
    all_factors.sort(key=lambda x: x['percentage'], reverse=True)

    return {
        'personal': personal_factors,
        'work_related': work_factors,
        'all': all_factors
    }


def validate_factor_consistency(personal_result: Dict, work_result: Dict, raw_metrics: Dict) -> Dict[str, Any]:
    """
    Validate that OCH factors don't double count underlying data sources.

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
        personal_components.get('after_hours_activity', {}).get('weighted_score', 0)
    ])

    incident_related_work = sum([
        work_components.get('oncall_burden', {}).get('weighted_score', 0),
        work_components.get('sprint_completion', {}).get('weighted_score', 0),
        work_components.get('alert_health', {}).get('weighted_score', 0)
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
DEFAULT_OCH_CONFIG = OCHConfig()
