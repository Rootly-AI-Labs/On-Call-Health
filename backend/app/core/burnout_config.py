"""
Centralized Burnout Analysis Configuration

This module provides a single source of truth for all burnout calculation parameters,
risk thresholds, scoring weights, and factor calculations. This ensures consistency
across all analyzers and components.

Based on the Maslach Burnout Inventory methodology and scientific validation.
"""
from typing import Dict, Tuple, Any
from dataclasses import dataclass


@dataclass
class BurnoutConfig:
    """Centralized configuration for burnout analysis."""
    
    # Risk Level Thresholds (0-10 scale where higher = more burnout)
    # Based on MBI percentile distributions and clinical research
    RISK_THRESHOLDS = {
        'low': (0.0, 3.0),        # 0-30% - Healthy work patterns
        'medium': (3.0, 5.5),     # 30-55% - Some stress signals 
        'high': (5.5, 7.5),       # 55-75% - Significant burnout risk
        'critical': (7.5, 10.0)   # 75-100% - Severe burnout indicators
    }
    
    # Copenhagen Burnout Inventory Dimension Weights (must sum to 1.0)
    # Based on OCB methodology - only 2 dimensions for software engineers
    OCB_WEIGHTS = {
        'personal_burnout': 0.50,        # Physical/psychological fatigue and exhaustion
        'work_related_burnout': 0.50     # Fatigue/exhaustion specifically tied to work
        # Note: client_related_burnout omitted - not applicable to software engineers
    }
    
    # Legacy Maslach weights (deprecated - will be removed in future version)
    MASLACH_WEIGHTS = {
        'emotional_exhaustion': 0.40,    # Maps to personal_burnout
        'depersonalization': 0.35,       # Maps to work_related_burnout  
        'personal_accomplishment': 0.25  # Removed - not in OCB framework
    }
    
    # Factor Calculation Weights
    EMOTIONAL_EXHAUSTION_FACTORS = {
        'workload': 0.50,         # Incident/task frequency
        'after_hours': 0.50       # Work-life balance
    }
    
    DEPERSONALIZATION_FACTORS = {
        'response_time': 0.50,    # Time pressure
        'workload': 0.30,         # Shared with exhaustion but lower weight
        'weekend_work': 0.20      # Boundary violations
    }
    
    PERSONAL_ACCOMPLISHMENT_FACTORS = {
        'response_time': 0.40,    # Effectiveness indicator (inverted)
        'workload': 0.60          # Ability to handle tasks (inverted)
    }
    
    # GitHub-Specific Thresholds
    GITHUB_ACTIVITY_THRESHOLDS = {
        'commits_per_week': {
            'moderate': 15,
            'high': 25,
            'excessive': 50
        },
        'after_hours_percentage': {
            'concerning': 0.15,   # >15%
            'excessive': 0.30     # >30%
        },
        'weekend_percentage': {
            'concerning': 0.10,   # >10%
            'excessive': 0.25     # >25%
        },
        'pr_size_lines': {
            'large': 500,
            'excessive': 1000
        },
        'review_participation_rate': {
            'low': 0.50,          # <50%
            'very_low': 0.25      # <25%
        }
    }
    
    # Slack Communication Thresholds
    SLACK_ACTIVITY_THRESHOLDS = {
        'messages_per_day': {
            'high': 50,
            'excessive': 100
        },
        'after_hours_percentage': {
            'concerning': 0.20,   # >20%
            'excessive': 0.40     # >40%
        },
        'sentiment_score': {
            'negative': -0.3,     # Below -0.3
            'very_negative': -0.6 # Below -0.6
        }
    }
    
    # Incident Analysis Thresholds
    INCIDENT_THRESHOLDS = {
        'incidents_per_week': {
            'moderate': 1.0,      # Even 1/week is notable workload
            'high': 2.0,          # 2+ incidents/week is high stress  
            'excessive': 3.5      # 3.5+ incidents/week is excessive
        },
        'response_time_minutes': {
            'acceptable': 15,     # <15 min
            'concerning': 60,     # 15-60 min
            'excessive': 120      # >120 min
        },
        'severity_weights': {
            'SEV0': 15.0,        # Life-defining events, PTSD risk, press attention (research-based)
            'SEV1': 12.0,        # Critical business impact, executive involvement (research-based)
            'SEV2': 6.0,         # Significant user impact, team-wide response
            'SEV3': 3.0,         # Moderate impact, standard response
            'SEV4': 1.5          # Minimal impact, routine handling
        }
    }
    
    # On-Call Burden Scoring (Research-based: 70% sleep disruption, anticipatory anxiety)
    ON_CALL_BURDEN = {
        'base_stress': {
            'weekly_rotation': 20.0,      # High frequency = higher anticipatory stress
            'bi_weekly_rotation': 15.0,   # Moderate frequency
            'monthly_rotation': 10.0      # Lower frequency rotation
        },
        'incident_overload_multipliers': {
            'manageable': 1.0,            # 0-2 incidents per shift (Google SRE guideline)
            'overwhelmed': 1.5,           # 3-5 incidents per shift (+50% stress)
            'critical_overload': 2.0      # 6+ incidents per shift (+100% stress)  
        },
        'team_size_modifiers': {
            'understaffed': 1.3,          # <5 people (SRE research: 8 for single-site)
            'minimal': 1.1,               # 5-7 people (approaching minimum)
            'adequate': 1.0               # 8+ people (meets guidelines)
        }
    }
    
    # Confidence Calculation Thresholds
    CONFIDENCE_THRESHOLDS = {
        'data_quality': {
            'high': 0.8,         # >=80%
            'medium': 0.6,       # 60-80%
            'low': 0.4           # <60%
        },
        'minimum_data_days': 30,     # Minimum days for reliable analysis
        'optimal_data_days': 90,     # Optimal analysis period
        'minimum_sample_size': 10    # Minimum data points needed
    }


def determine_risk_level(burnout_score: float, config: BurnoutConfig = None) -> str:
    """
    Determine risk level from burnout score using standardized thresholds.
    
    Args:
        burnout_score: Burnout score on 0-10 scale (higher = worse)
        config: Optional config override
        
    Returns:
        Risk level: 'low', 'medium', 'high', or 'critical'
    """
    if config is None:
        config = BurnoutConfig()
    
    thresholds = config.RISK_THRESHOLDS
    
    if burnout_score >= thresholds['critical'][0]:
        return 'critical'
    elif burnout_score >= thresholds['high'][0]:
        return 'high'
    elif burnout_score >= thresholds['medium'][0]:
        return 'medium'
    else:
        return 'low'


def get_risk_threshold_range(risk_level: str, config: BurnoutConfig = None) -> Tuple[float, float]:
    """
    Get the score range for a given risk level.
    
    Args:
        risk_level: 'low', 'medium', 'high', or 'critical'
        config: Optional config override
        
    Returns:
        Tuple of (min_score, max_score) for the risk level
    """
    if config is None:
        config = BurnoutConfig()
    
    return config.RISK_THRESHOLDS.get(risk_level, (0.0, 10.0))


def calculate_confidence_level(data_quality: float, data_days: int, sample_size: int, 
                             config: BurnoutConfig = None) -> Dict[str, Any]:
    """
    Calculate confidence level based on data quality metrics.
    
    Args:
        data_quality: Quality score 0-1
        data_days: Number of days of data
        sample_size: Number of data points
        config: Optional config override
        
    Returns:
        Dict with confidence level, score, and factors
    """
    if config is None:
        config = BurnoutConfig()
    
    thresholds = config.CONFIDENCE_THRESHOLDS
    
    # Calculate component scores
    quality_score = 1.0 if data_quality >= thresholds['data_quality']['high'] else \
                   0.7 if data_quality >= thresholds['data_quality']['medium'] else \
                   0.4
    
    days_score = 1.0 if data_days >= config.CONFIDENCE_THRESHOLDS['optimal_data_days'] else \
                0.7 if data_days >= config.CONFIDENCE_THRESHOLDS['minimum_data_days'] else \
                0.3
    
    sample_score = 1.0 if sample_size >= 50 else \
                  0.7 if sample_size >= 20 else \
                  0.4 if sample_size >= config.CONFIDENCE_THRESHOLDS['minimum_sample_size'] else \
                  0.1
    
    # Weighted average
    overall_score = (quality_score * 0.4 + days_score * 0.35 + sample_score * 0.25)
    
    # Determine level
    if overall_score >= thresholds['data_quality']['high']:
        level = 'high'
    elif overall_score >= thresholds['data_quality']['medium']:
        level = 'medium'
    else:
        level = 'low'
    
    return {
        'level': level,
        'score': round(overall_score, 2),
        'factors': {
            'data_quality': round(quality_score, 2),
            'temporal_coverage': round(days_score, 2),
            'sample_size': round(sample_score, 2)
        }
    }


def validate_config(config: BurnoutConfig = None) -> Dict[str, bool]:
    """
    Validate configuration for mathematical consistency.
    
    Args:
        config: Config to validate
        
    Returns:
        Dict of validation results
    """
    if config is None:
        config = BurnoutConfig()
    
    results = {}
    
    # Check OCB weights sum to 1.0
    ocb_sum = sum(config.OCB_WEIGHTS.values())
    results['ocb_weights_sum'] = abs(ocb_sum - 1.0) < 0.001
    
    # Check Maslach weights sum to 1.0 (legacy)
    maslach_sum = sum(config.MASLACH_WEIGHTS.values())
    results['maslach_weights_sum'] = abs(maslach_sum - 1.0) < 0.001
    
    # Check factor weights sum to 1.0 for each dimension
    ee_sum = sum(config.EMOTIONAL_EXHAUSTION_FACTORS.values())
    results['emotional_exhaustion_weights'] = abs(ee_sum - 1.0) < 0.001
    
    dp_sum = sum(config.DEPERSONALIZATION_FACTORS.values())
    results['depersonalization_weights'] = abs(dp_sum - 1.0) < 0.001
    
    pa_sum = sum(config.PERSONAL_ACCOMPLISHMENT_FACTORS.values())
    results['personal_accomplishment_weights'] = abs(pa_sum - 1.0) < 0.001
    
    # Check risk thresholds are properly ordered
    thresholds = config.RISK_THRESHOLDS
    results['risk_thresholds_ordered'] = (
        thresholds['low'][1] == thresholds['medium'][0] and
        thresholds['medium'][1] == thresholds['high'][0] and
        thresholds['high'][1] == thresholds['critical'][0]
    )
    
    return results


def convert_ocb_to_legacy_scale(ocb_score: float) -> float:
    """
    Convert OCB score (0-100) to legacy Maslach scale (0-10) for compatibility.
    
    Args:
        ocb_score: OCB score on 0-100 scale
        
    Returns:
        Equivalent score on 0-10 scale
    """
    return (ocb_score / 100.0) * 10.0


def convert_legacy_to_ocb_scale(legacy_score: float) -> float:
    """
    Convert legacy Maslach score (0-10) to OCB scale (0-100) for comparison.
    
    Args:
        legacy_score: Legacy score on 0-10 scale
        
    Returns:
        Equivalent score on 0-100 scale
    """
    return (legacy_score / 10.0) * 100.0


# Global singleton instance
DEFAULT_CONFIG = BurnoutConfig()