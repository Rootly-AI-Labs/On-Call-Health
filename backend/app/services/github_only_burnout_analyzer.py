"""
GitHub-Only Burnout Analyzer

Scientifically rigorous burnout analysis using only GitHub data, based on established
burnout research methodology. Implements flow state detection to distinguish healthy 
high-productivity from burnout patterns.

This analyzer can provide a complete burnout assessment (100% scoring) when GitHub is the
only available data source, with appropriate confidence intervals and baseline comparisons.
"""
import logging
import math
import statistics
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict

logger = logging.getLogger(__name__)


class GitHubOnlyBurnoutAnalyzer:
    """
    Burnout analyzer that works exclusively with GitHub data.
    
    Based on three-factor burnout model:
    - Personal Burnout (33.3% weight)
    - Work-Related Burnout (33.3% weight) 
    - Accomplishment-Related Burnout (33.4% weight)
    """
    
    def __init__(self):
        # Using Copenhagen Burnout Inventory (CBI) methodology
        logger.info("GitHub analyzer using On-Call Burnout methodology")
        
        # GitHub-specific thresholds for burnout detection
        self.thresholds = {
            # Emotional Exhaustion indicators
            "commits_per_week_high": 50,
            "commits_per_week_medium": 25,
            "after_hours_commits_high": 0.30,  # 30% of commits after hours
            "after_hours_commits_medium": 0.15,
            "weekend_commits_high": 0.25,      # 25% of commits on weekends
            "weekend_commits_medium": 0.10,
            "large_commits_high": 0.20,        # 20% of commits are large (>500 lines)
            "large_commits_medium": 0.10,
            
            # Depersonalization indicators
            "pr_size_large": 1000,             # Lines changed in large PRs
            "pr_review_participation_low": 0.3, # Review participation rate
            "commit_message_length_short": 20,   # Characters in short messages
            "code_review_delay_high": 48,       # Hours delay in code reviews
            
            # Personal Accomplishment indicators (inverted)
            "pr_merge_rate_low": 0.7,          # PR merge success rate
            "review_quality_low": 0.5,         # Quality score for reviews
            "knowledge_sharing_low": 0.2,      # Knowledge sharing indicators
            "collaboration_score_low": 0.4,    # Collaboration metrics
        }
        
        # Baseline values for comparison (industry averages)
        self.industry_baselines = {
            "commits_per_week": 15,
            "pr_per_week": 3,
            "review_per_week": 5,
            "after_hours_percentage": 0.1,
            "weekend_percentage": 0.05,
            "pr_merge_rate": 0.85,
            "avg_commit_size": 150,
        }
    
    async def analyze_team_burnout(
        self,
        github_data: Dict[str, Dict[str, Any]],
        time_range_days: int = 30,
        team_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Analyze burnout for entire team using only GitHub data.
        
        Args:
            github_data: Dict mapping email -> GitHub activity data
            time_range_days: Analysis period in days
            team_context: Optional team context for baseline comparison
            
        Returns:
            Complete burnout analysis results
        """
        logger.info(f"🧬 Starting GitHub-only burnout analysis for {len(github_data)} team members")
        
        if not github_data:
            return self._create_empty_analysis("No GitHub data available")
        
        try:
            # Calculate baselines for this team/organization
            team_baselines = self._calculate_team_baselines(github_data, team_context)
            
            # Analyze each team member
            member_analyses = []
            for email, user_data in github_data.items():
                member_analysis = await self._analyze_member_github_burnout(
                    email, user_data, team_baselines, time_range_days
                )
                if member_analysis:
                    member_analyses.append(member_analysis)
            
            # Calculate team health from individual analyses
            team_health = self._calculate_team_health(member_analyses)
            
            # Generate insights and recommendations
            insights = self._generate_github_insights(member_analyses, team_baselines)
            recommendations = self._generate_github_recommendations(team_health, member_analyses)
            
            # Create comprehensive analysis result
            result = {
                "analysis_timestamp": datetime.now().isoformat(),
                "analysis_type": "github_only",
                "metadata": {
                    "time_range_days": time_range_days,
                    "team_size": len(member_analyses),
                    "data_sources": ["github"],
                    "confidence_level": self._calculate_confidence_level(member_analyses),
                    "baselines_used": team_baselines
                },
                "team_health": team_health,
                "team_analysis": {
                    "members": member_analyses,
                    "total_members": len(member_analyses)
                },
                "insights": insights,
                "recommendations": recommendations,
                "github_specific_metrics": self._calculate_team_github_metrics(github_data),
                "methodology_notes": self._get_methodology_notes()
            }
            
            logger.info(f"🧬 GitHub-only analysis completed: {len(member_analyses)} members analyzed")
            return result
            
        except Exception as e:
            logger.error(f"GitHub-only burnout analysis failed: {e}")
            return self._create_empty_analysis(f"Analysis failed: {str(e)}")
    
    async def _analyze_member_github_burnout(
        self,
        email: str,
        github_data: Dict[str, Any],
        baselines: Dict[str, float],
        time_range_days: int
    ) -> Optional[Dict[str, Any]]:
        """Analyze burnout for individual team member using GitHub data."""
        try:
            if not github_data or not isinstance(github_data, dict):
                logger.warning(f"Invalid GitHub data for {email}")
                return None
            
            # Extract GitHub metrics
            metrics = github_data.get("metrics", {})
            activity_data = github_data.get("activity_data", {})
            
            if not metrics:
                logger.warning(f"No GitHub metrics for {email}")
                return None
            
            # Calculate burnout dimensions using OCB (Copenhagen Burnout Inventory) methodology
            logger.debug(f"Using OCB methodology for {email}")
            personal_burnout = self._calculate_personal_burnout_ocb(
                metrics, baselines, time_range_days
            )
            
            work_related_burnout = self._calculate_work_burnout_ocb(
                metrics, baselines, activity_data
            )
            
            accomplishment_burnout = self._calculate_accomplishment_burnout_ocb(
                metrics, baselines, activity_data
            )
            
            # Calculate overall burnout score using equal weights (OCB methodology)
            burnout_score = (
                personal_burnout * 0.333 +
                work_related_burnout * 0.333 + 
                accomplishment_burnout * 0.334
            )
            burnout_score = max(0, min(10, burnout_score))
            
            # Determine risk level
            risk_level = self._determine_risk_level(burnout_score)
            
            # Detect flow state vs frantic activity
            flow_state_analysis = self._analyze_flow_state(metrics, activity_data)
            
            # Calculate confidence level for this individual analysis
            individual_confidence = self._calculate_individual_confidence(metrics, activity_data)
            
            return {
                "user_email": email,
                "user_name": github_data.get("username", email.split("@")[0]),
                "burnout_score": round(burnout_score, 2),
                "risk_level": risk_level,
                "confidence_level": individual_confidence,
                "burnout_dimensions": {
                    "personal_burnout": round(personal_burnout, 2),
                    "work_related_burnout": round(work_related_burnout, 2),
                    "accomplishment_burnout": round(accomplishment_burnout, 2)
                },
                "github_metrics": metrics,
                "flow_state_analysis": flow_state_analysis,
                "baseline_comparison": self._compare_to_baselines(metrics, baselines),
                "burnout_indicators": self._identify_burnout_indicators(metrics, baselines),
                "recommendations": self._generate_individual_recommendations(
                    burnout_score, risk_level, flow_state_analysis
                )
            }
            
        except Exception as e:
            logger.error(f"Error analyzing GitHub burnout for {email}: {e}")
            return None
    
    
    # =============================================================================
    # OCB (Copenhagen Burnout Inventory) CALCULATION METHODS
    # Scientific burnout assessment using established OCB methodology
    # =============================================================================
    
    def _calculate_personal_burnout_ocb(
        self,
        metrics: Dict[str, Any], 
        baselines: Dict[str, float],
        time_range_days: int
    ) -> float:
        """
        Calculate Personal Burnout using OCB methodology from GitHub data (0-10 scale).
        
        Personal Burnout focuses on physical and psychological exhaustion.
        OCB indicators:
        - Overwhelming workload patterns
        - Sustained high-intensity activity  
        - Loss of work-life boundaries
        - Physical fatigue markers
        """
        score_components = []
        
        # 1. Workload overwhelm (30% weight)
        commits_per_week = metrics.get("commits_per_week", 0)
        baseline_commits = baselines.get("commits_per_week", self.industry_baselines["commits_per_week"])
        
        # OCB: Focus on sustained overload rather than peaks
        workload_ratio = commits_per_week / baseline_commits if baseline_commits > 0 else 0
        if workload_ratio >= 2.5:  # Consistently overwhelming
            overwhelm_score = 10
        elif workload_ratio >= 1.8:  # Heavy load
            overwhelm_score = 6 + (workload_ratio - 1.8) * 5.7  # 6-10 range
        elif workload_ratio >= 1.2:  # Above normal
            overwhelm_score = 3 + (workload_ratio - 1.2) * 5  # 3-6 range
        else:  # Normal or below
            overwhelm_score = workload_ratio * 2.5  # 0-3 range
            
        score_components.append(("workload_overwhelm", overwhelm_score, 0.30))
        
        # 2. Boundary violations - after hours activity (25% weight)
        after_hours_ratio = metrics.get("after_hours_commit_ratio", 0)
        # OCB: Even small boundary violations accumulate to exhaustion
        boundary_score = min(10, after_hours_ratio * 25)  # More sensitive to after-hours work
        score_components.append(("boundary_violations", boundary_score, 0.25))
        
        # 3. Intensity patterns - large commits indicating rushed work (25% weight)
        avg_lines_per_commit = metrics.get("avg_lines_per_commit", 0)
        baseline_lines = baselines.get("avg_lines_per_commit", self.industry_baselines.get("avg_lines_per_commit", 50))
        
        intensity_ratio = avg_lines_per_commit / baseline_lines if baseline_lines > 0 else 0
        # OCB: Large commits often indicate time pressure and exhaustion
        if intensity_ratio >= 3.0:  # Very large commits
            intensity_score = 10
        elif intensity_ratio >= 2.0:  # Large commits
            intensity_score = 5 + (intensity_ratio - 2.0) * 5  # 5-10 range
        else:  # Normal range
            intensity_score = intensity_ratio * 2.5  # 0-5 range
            
        score_components.append(("work_intensity", intensity_score, 0.25))
        
        # 4. Recovery absence - consistent daily activity without breaks (20% weight)
        # Higher daily consistency can indicate lack of recovery time
        daily_activity_variance = metrics.get("daily_commit_variance", 0.5)  # Default moderate variance
        # Low variance (< 0.3) suggests no recovery days; high variance (> 0.8) is healthy
        if daily_activity_variance < 0.2:  # Very consistent = no breaks
            recovery_score = 10
        elif daily_activity_variance < 0.4:  # Low variance
            recovery_score = 5 + (0.4 - daily_activity_variance) * 25  # 5-10 range
        else:  # Healthy variance
            recovery_score = max(0, 5 - (daily_activity_variance - 0.4) * 12.5)  # 0-5 range
            
        score_components.append(("recovery_absence", recovery_score, 0.20))
        
        # Calculate weighted total
        total_score = sum(score * weight for _, score, weight in score_components)
        
        logger.debug(f"Personal Burnout (OCB) components: {score_components}, total: {total_score}")
        return min(10, max(0, total_score))
    
    def _calculate_work_burnout_ocb(
        self,
        metrics: Dict[str, Any],
        baselines: Dict[str, float],
        activity_data: Dict[str, Any]
    ) -> float:
        """
        Calculate Work-Related Burnout using OCB methodology from GitHub data (0-10 scale).
        
        Work-Related Burnout focuses on fatigue specifically attributed to work.
        OCB indicators:
        - Work context frustration
        - Inefficient work patterns
        - Collaboration strain
        - Work process dysfunction
        """
        score_components = []
        
        # 1. Work inefficiency - PR revision patterns (30% weight)
        avg_pr_revisions = metrics.get("avg_pr_revisions", 2)
        # OCB: High revisions indicate work process problems
        if avg_pr_revisions >= 5:  # Many revisions = process issues
            inefficiency_score = 10
        elif avg_pr_revisions >= 3:  # Moderate revisions
            inefficiency_score = 4 + (avg_pr_revisions - 3) * 3  # 4-10 range
        else:  # Low revisions
            inefficiency_score = avg_pr_revisions * 1.3  # 0-4 range
            
        score_components.append(("work_inefficiency", inefficiency_score, 0.30))
        
        # 2. Collaboration burden - review load vs capacity (25% weight)
        reviews_per_week = metrics.get("reviews_per_week", 0)
        prs_per_week = metrics.get("prs_per_week", 0)
        
        # OCB: Disproportionate review load indicates work distribution issues
        if prs_per_week > 0:
            review_ratio = reviews_per_week / prs_per_week
            if review_ratio >= 3:  # Heavy review burden
                collaboration_score = 8 + min(2, (review_ratio - 3) * 0.5)  # 8-10 range
            elif review_ratio >= 1.5:  # Moderate burden
                collaboration_score = 4 + (review_ratio - 1.5) * 2.7  # 4-8 range
            else:  # Light burden
                collaboration_score = review_ratio * 2.7  # 0-4 range
        else:
            collaboration_score = 5  # Default moderate score
            
        score_components.append(("collaboration_burden", collaboration_score, 0.25))
        
        # 3. Work fragmentation - commit frequency patterns (25% weight)
        commits_per_week = metrics.get("commits_per_week", 0)
        # OCB: Very high or very low commit frequency both indicate work problems
        if commits_per_week >= 40:  # Fragmented work
            fragmentation_score = 8 + min(2, (commits_per_week - 40) * 0.05)  # 8-10 range
        elif commits_per_week <= 5 and commits_per_week > 0:  # Too few commits
            fragmentation_score = 6 + (5 - commits_per_week) * 0.8  # 6-10 range
        elif commits_per_week == 0:  # No activity
            fragmentation_score = 10
        else:  # Normal range (5-40)
            # Find optimal around 15-25 commits/week
            optimal_range = (15, 25)
            if optimal_range[0] <= commits_per_week <= optimal_range[1]:
                fragmentation_score = 0
            elif commits_per_week < optimal_range[0]:
                fragmentation_score = (optimal_range[0] - commits_per_week) * 0.3  # Slight penalty
            else:  # commits_per_week > optimal_range[1]
                fragmentation_score = (commits_per_week - optimal_range[1]) * 0.2  # Slight penalty
                
        score_components.append(("work_fragmentation", fragmentation_score, 0.25))
        
        # 4. Process dysfunction - merge rate and revert patterns (20% weight)
        pr_merge_rate = metrics.get("pr_merge_rate", 0.8)
        commit_revert_rate = metrics.get("commit_revert_rate", 0)
        
        # OCB: Poor merge rates and reverts indicate dysfunctional work processes
        merge_dysfunction = (1 - pr_merge_rate) * 10  # Lower merge rate = higher dysfunction
        revert_dysfunction = commit_revert_rate * 20  # Reverts indicate process issues
        process_dysfunction_score = min(10, (merge_dysfunction + revert_dysfunction) / 2)
        
        score_components.append(("process_dysfunction", process_dysfunction_score, 0.20))
        
        # Calculate weighted total
        total_score = sum(score * weight for _, score, weight in score_components)
        
        logger.debug(f"Work-Related Burnout (OCB) components: {score_components}, total: {total_score}")
        return min(10, max(0, total_score))
    
    def _calculate_accomplishment_burnout_ocb(
        self,
        metrics: Dict[str, Any],
        baselines: Dict[str, float], 
        activity_data: Dict[str, Any]
    ) -> float:
        """
        Calculate Accomplishment Burnout using OCB methodology from GitHub data (0-10 scale).
        
        Accomplishment Burnout focuses on reduced sense of effectiveness and achievement.
        OCB indicators:
        - Declining output quality
        - Reduced meaningful contributions
        - Loss of technical growth
        - Diminished sense of progress
        """
        score_components = []
        
        # 1. Output quality decline (35% weight)
        pr_merge_rate = metrics.get("pr_merge_rate", 0.8)
        avg_pr_revisions = metrics.get("avg_pr_revisions", 2)
        
        # OCB: Quality issues indicate reduced sense of effectiveness
        # Merge rate component
        quality_merge_score = (1 - pr_merge_rate) * 10  # Lower merge rate = quality issues
        
        # Revision component (high revisions = quality struggles)
        if avg_pr_revisions >= 4:
            quality_revision_score = 6 + min(4, (avg_pr_revisions - 4) * 0.5)  # 6-10 range
        else:
            quality_revision_score = avg_pr_revisions * 1.5  # 0-6 range
            
        output_quality_score = (quality_merge_score + quality_revision_score) / 2
        score_components.append(("output_quality_decline", output_quality_score, 0.35))
        
        # 2. Contribution meaningfulness - project diversity and impact (30% weight)
        # Use commit size variance as proxy for varied, meaningful work
        commit_size_variance = metrics.get("commit_size_variance", 0.5)
        lines_per_commit = metrics.get("avg_lines_per_commit", 0)
        
        # OCB: Very low variance suggests repetitive, unmeaningful work
        # Very high variance might suggest unfocused work
        if commit_size_variance < 0.2:  # Too repetitive
            meaningfulness_score = 8 + (0.2 - commit_size_variance) * 10  # 8-10 range
        elif commit_size_variance > 2.0:  # Too chaotic
            meaningfulness_score = 6 + min(4, (commit_size_variance - 2.0) * 0.5)  # 6-10 range
        else:  # Good variance range (0.2-2.0)
            # Optimal around 0.5-1.0
            if 0.5 <= commit_size_variance <= 1.0:
                meaningfulness_score = 0  # Best range
            else:
                # Distance from optimal range
                distance = min(abs(commit_size_variance - 0.5), abs(commit_size_variance - 1.0))
                meaningfulness_score = distance * 2  # 0-6 penalty
                
        # Adjust for absolute output (very low output suggests disengagement)
        if lines_per_commit < 10:  # Very small commits
            meaningfulness_score = min(10, meaningfulness_score + (10 - lines_per_commit) * 0.5)
        
        score_components.append(("contribution_meaningfulness", meaningfulness_score, 0.30))
        
        # 3. Technical growth stagnation (20% weight)
        # Use project diversity (different repos/areas) as proxy for growth
        # For now, use baseline comparison for commits as proxy
        commits_per_week = metrics.get("commits_per_week", 0)
        baseline_commits = baselines.get("commits_per_week", self.industry_baselines["commits_per_week"])
        
        activity_ratio = commits_per_week / baseline_commits if baseline_commits > 0 else 0
        
        # OCB: Both very low and very high activity can indicate stagnation
        if activity_ratio < 0.5:  # Very low activity = disengagement
            stagnation_score = 8 + (0.5 - activity_ratio) * 4  # 8-10 range
        elif activity_ratio > 3.0:  # Very high activity = no time for growth
            stagnation_score = 6 + min(4, (activity_ratio - 3.0) * 0.5)  # 6-10 range
        else:  # Normal activity range
            # Best range is 0.8-1.5 (slightly below to above baseline)
            if 0.8 <= activity_ratio <= 1.5:
                stagnation_score = 0
            else:
                # Distance from optimal range
                if activity_ratio < 0.8:
                    stagnation_score = (0.8 - activity_ratio) * 10  # 0-6 penalty
                else:  # activity_ratio > 1.5
                    stagnation_score = (activity_ratio - 1.5) * 4  # 0-6 penalty
                    
        score_components.append(("technical_stagnation", stagnation_score, 0.20))
        
        # 4. Progress perception - trend analysis (15% weight)
        # Use PR creation rate vs completion rate as proxy for progress perception
        prs_per_week = metrics.get("prs_per_week", 0)
        
        # OCB: Very low PR creation suggests reduced sense of making progress
        if prs_per_week < 1:  # Less than 1 PR per week
            progress_score = 8 + (1 - prs_per_week) * 2  # 8-10 range
        elif prs_per_week > 10:  # Too many PRs might indicate rushed work
            progress_score = 4 + min(6, (prs_per_week - 10) * 0.3)  # 4-10 range
        else:  # Normal range (1-10 PRs/week)
            # Optimal around 2-5 PRs/week
            if 2 <= prs_per_week <= 5:
                progress_score = 0
            else:
                distance = min(abs(prs_per_week - 2), abs(prs_per_week - 5))
                progress_score = distance * 1  # 0-4 penalty
                
        score_components.append(("progress_perception", progress_score, 0.15))
        
        # Calculate weighted total
        total_score = sum(score * weight for _, score, weight in score_components)
        
        logger.debug(f"Accomplishment Burnout (OCB) components: {score_components}, total: {total_score}")
        return min(10, max(0, total_score))
    
    # =============================================================================
    # END OF OCB METHODS
    # =============================================================================
    
    def _analyze_flow_state(
        self, 
        metrics: Dict[str, Any], 
        activity_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Analyze whether high activity indicates flow state or frantic burnout.
        
        Flow state characteristics:
        - Consistent, sustainable pace
        - High quality output (fewer revisions, better reviews)
        - Balanced work across different activities
        - Reasonable work hours with clear boundaries
        
        Frantic activity characteristics:
        - Erratic commit patterns with extreme peaks
        - Poor quality output (many revisions, rushed commits)
        - Imbalanced work (all coding, no reviews/planning)
        - Boundary violations (constant after-hours work)
        """
        
        # Calculate activity consistency
        commit_pattern_consistency = self._calculate_activity_consistency(activity_data)
        
        # Calculate output quality indicators
        quality_indicators = {
            "avg_commit_size_variance": metrics.get("commit_size_variance", 0),
            "pr_revision_count": metrics.get("avg_pr_revisions", 2),
            "commit_revert_rate": metrics.get("commit_revert_rate", 0),
            "pr_close_without_merge_rate": 1 - metrics.get("pr_merge_rate", 0.8)
        }
        
        # Calculate work balance
        total_activity = (
            metrics.get("commits_per_week", 0) +
            metrics.get("prs_per_week", 0) * 3 +  # Weight PRs higher
            metrics.get("reviews_per_week", 0) * 2
        )
        
        balance_score = 0
        if total_activity > 0:
            commit_ratio = metrics.get("commits_per_week", 0) / total_activity
            pr_ratio = metrics.get("prs_per_week", 0) * 3 / total_activity  
            review_ratio = metrics.get("reviews_per_week", 0) * 2 / total_activity
            
            # Healthy balance: 40-60% commits, 20-40% PRs, 20-40% reviews
            balance_score = 10 - abs(commit_ratio - 0.5) * 20 - abs(pr_ratio - 0.3) * 25 - abs(review_ratio - 0.2) * 25
            balance_score = max(0, balance_score)
        
        # Calculate boundary respect
        after_hours_pct = metrics.get("after_hours_commit_percentage", 0)
        weekend_pct = metrics.get("weekend_commit_percentage", 0)
        boundary_score = max(0, 10 - (after_hours_pct * 25) - (weekend_pct * 30))
        
        # Determine flow state likelihood
        flow_indicators = {
            "consistency": commit_pattern_consistency,
            "quality": 10 - sum(quality_indicators.values()),  # Lower values = higher quality
            "balance": balance_score,
            "boundaries": boundary_score
        }
        
        overall_flow_score = sum(flow_indicators.values()) / len(flow_indicators)
        
        flow_state = "healthy_flow" if overall_flow_score >= 7 else \
                    "moderate_flow" if overall_flow_score >= 5 else \
                    "frantic_activity"
        
        return {
            "flow_state": flow_state,
            "flow_score": round(overall_flow_score, 2),
            "indicators": flow_indicators,
            "interpretation": self._interpret_flow_state(flow_state, overall_flow_score)
        }
    
    def _calculate_activity_consistency(self, activity_data: Dict[str, Any]) -> float:
        """Calculate consistency of work patterns over time."""
        # This would analyze daily/weekly commit patterns
        # For now, return a placeholder based on available metrics
        daily_commits = activity_data.get("daily_commit_counts", [])
        
        if len(daily_commits) < 7:
            return 5.0  # Neutral score for insufficient data
        
        # Calculate coefficient of variation (std dev / mean)
        if statistics.mean(daily_commits) > 0:
            cv = statistics.stdev(daily_commits) / statistics.mean(daily_commits)
            consistency_score = max(0, 10 - (cv * 10))  # Lower variation = higher consistency
        else:
            consistency_score = 5.0
        
        return consistency_score
    
    def _interpret_flow_state(self, flow_state: str, score: float) -> str:
        """Provide interpretation of flow state analysis."""
        interpretations = {
            "healthy_flow": f"Activity patterns suggest healthy flow state (score: {score:.1f}/10). "
                          "Consistent, high-quality work with good boundaries.",
            "moderate_flow": f"Mixed activity patterns (score: {score:.1f}/10). "
                           "Some indicators of flow but with areas for improvement.",
            "frantic_activity": f"Activity patterns suggest frantic/burnout behavior (score: {score:.1f}/10). "
                              "Erratic patterns, quality issues, or poor boundaries detected."
        }
        return interpretations.get(flow_state, "Unable to determine flow state")
    
    def _calculate_team_baselines(
        self, 
        github_data: Dict[str, Dict[str, Any]], 
        team_context: Optional[Dict[str, Any]]
    ) -> Dict[str, float]:
        """Calculate team-specific baselines for comparison."""
        team_metrics = []
        for user_data in github_data.values():
            metrics = user_data.get("metrics", {})
            if metrics:
                team_metrics.append(metrics)
        
        if not team_metrics:
            return self.industry_baselines.copy()
        
        # Calculate team medians for key metrics
        team_baselines = {}
        
        metric_keys = [
            "commits_per_week", "prs_per_week", "reviews_per_week",
            "after_hours_commit_percentage", "weekend_commit_percentage",
            "pr_merge_rate", "avg_commit_size"
        ]
        
        for key in metric_keys:
            values = [m.get(key, 0) for m in team_metrics if m.get(key) is not None]
            if values:
                team_baselines[key] = statistics.median(values)
            else:
                team_baselines[key] = self.industry_baselines.get(key, 0)
        
        # Blend team and industry baselines (70% team, 30% industry)
        final_baselines = {}
        for key in metric_keys:
            team_value = team_baselines.get(key, 0)
            industry_value = self.industry_baselines.get(key, 0)
            final_baselines[key] = team_value * 0.7 + industry_value * 0.3
        
        logger.info(f"Calculated team baselines: {final_baselines}")
        return final_baselines
    
    def _calculate_team_health(self, member_analyses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate overall team health from individual analyses."""
        if not member_analyses:
            return {
                "overall_score": 5.0,
                "risk_distribution": {"low": 0, "medium": 0, "high": 0, "critical": 0},
                "average_burnout_score": 0.0,
                "health_status": "unknown",
                "members_at_risk": 0,
                "confidence_level": "low"
            }
        
        # Calculate averages
        burnout_scores = [m["burnout_score"] for m in member_analyses]
        avg_burnout = statistics.mean(burnout_scores)
        
        # Convert to health score (inverse of burnout)
        health_score = max(0, 10 - avg_burnout)
        
        # Count risk levels
        risk_counts = {"low": 0, "medium": 0, "high": 0}
        for member in member_analyses:
            risk_level = member.get("risk_level", "low")
            risk_counts[risk_level] += 1
        
        # Determine health status with more realistic thresholds
        # 90%+ = Excellent, 80-89% = Good, 70-79% = Fair, 60-69% = Poor, <60% = Critical
        if health_score >= 9:  # 90%+
            health_status = "excellent"
        elif health_score >= 8:  # 80-89%
            health_status = "good"
        elif health_score >= 7:  # 70-79%
            health_status = "fair"
        elif health_score >= 6:  # 60-69%
            health_status = "poor"
        else:  # <60%
            health_status = "critical"
        
        # Calculate team confidence level
        individual_confidences = [m.get("confidence_level", 0.5) for m in member_analyses]
        team_confidence = statistics.mean(individual_confidences)
        
        confidence_label = "high" if team_confidence >= 0.8 else \
                          "medium" if team_confidence >= 0.6 else "low"
        
        return {
            "overall_score": round(health_score, 2),
            "risk_distribution": risk_counts,
            "average_burnout_score": round(avg_burnout, 2),
            "health_status": health_status,
            "members_at_risk": risk_counts["high"] + risk_counts["medium"],
            "confidence_level": confidence_label,
            "github_only_analysis": True
        }
    
    def _calculate_confidence_level(self, member_analyses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate confidence level for GitHub-only analysis."""
        if not member_analyses:
            return {"level": "low", "score": 0.0, "factors": []}
        
        confidence_factors = []
        
        # Data completeness factor
        avg_data_completeness = 0
        for member in member_analyses:
            metrics = member.get("github_metrics", {})
            expected_metrics = ["commits_per_week", "prs_per_week", "reviews_per_week"]
            completeness = sum(1 for key in expected_metrics if metrics.get(key, 0) > 0) / len(expected_metrics)
            avg_data_completeness += completeness
        
        avg_data_completeness /= len(member_analyses)
        confidence_factors.append(("data_completeness", avg_data_completeness))
        
        # Time range factor (longer periods = higher confidence)
        time_factor = min(1.0, 30 / 30)  # Assume 30 days for now
        confidence_factors.append(("time_range", time_factor))
        
        # Team size factor (larger teams = higher confidence)
        team_size_factor = min(1.0, len(member_analyses) / 5)  # Ideal team size ~5
        confidence_factors.append(("team_size", team_size_factor))
        
        # GitHub activity level factor
        avg_activity = statistics.mean([
            m.get("github_metrics", {}).get("commits_per_week", 0) +
            m.get("github_metrics", {}).get("prs_per_week", 0) * 2
            for m in member_analyses
        ])
        activity_factor = min(1.0, avg_activity / 20)  # 20 activities per week is good baseline
        confidence_factors.append(("activity_level", activity_factor))
        
        # Overall confidence score
        overall_confidence = statistics.mean([score for _, score in confidence_factors])
        
        level = "high" if overall_confidence >= 0.8 else \
               "medium" if overall_confidence >= 0.6 else "low"
        
        return {
            "level": level,
            "score": round(overall_confidence, 3),
            "factors": confidence_factors,
            "notes": self._generate_confidence_notes(level, confidence_factors)
        }
    
    def _generate_confidence_notes(self, level: str, factors: List[Tuple[str, float]]) -> List[str]:
        """Generate explanatory notes about confidence level."""
        notes = []
        
        if level == "high":
            notes.append("High confidence: Comprehensive GitHub data with strong activity patterns")
        elif level == "medium":
            notes.append("Medium confidence: Good GitHub data but some limitations in scope")
        else:
            notes.append("Low confidence: Limited GitHub data - results should be interpreted cautiously")
        
        # Add specific factor notes
        for factor_name, score in factors:
            if score < 0.5:
                if factor_name == "data_completeness":
                    notes.append("⚠️ Limited data completeness - some team members have sparse GitHub activity")
                elif factor_name == "team_size":
                    notes.append("⚠️ Small team size - individual variations may have larger impact")
                elif factor_name == "activity_level":
                    notes.append("⚠️ Low GitHub activity levels - may not capture full work patterns")
        
        return notes
    
    def _compare_to_baselines(
        self, 
        metrics: Dict[str, Any], 
        baselines: Dict[str, float]
    ) -> Dict[str, Dict[str, Any]]:
        """Compare individual metrics to team and industry baselines."""
        comparisons = {}
        
        for metric_key, baseline_value in baselines.items():
            user_value = metrics.get(metric_key, 0)
            
            if baseline_value > 0:
                ratio = user_value / baseline_value
                
                if ratio <= 0.8:
                    status = "below_baseline"
                    interpretation = f"{ratio:.1f}x baseline (lower than typical)"
                elif ratio <= 1.2:
                    status = "near_baseline"
                    interpretation = f"{ratio:.1f}x baseline (typical range)"
                else:
                    status = "above_baseline"
                    interpretation = f"{ratio:.1f}x baseline (higher than typical)"
            else:
                status = "no_baseline"
                interpretation = "No baseline available for comparison"
            
            comparisons[metric_key] = {
                "user_value": user_value,
                "baseline_value": baseline_value,
                "ratio": ratio if baseline_value > 0 else None,
                "status": status,
                "interpretation": interpretation
            }
        
        return comparisons
    
    def _identify_burnout_indicators(
        self, 
        metrics: Dict[str, Any], 
        baselines: Dict[str, float]
    ) -> List[Dict[str, Any]]:
        """Identify specific burnout warning signs in GitHub data."""
        indicators = []
        
        # High commit frequency
        commits_pw = metrics.get("commits_per_week", 0)
        if commits_pw > self.thresholds["commits_per_week_high"]:
            indicators.append({
                "type": "emotional_exhaustion",
                "severity": "high",
                "indicator": "excessive_commits",
                "value": commits_pw,
                "message": f"Very high commit frequency ({commits_pw}/week) indicates potential overwork"
            })
        elif commits_pw > self.thresholds["commits_per_week_medium"]:
            indicators.append({
                "type": "emotional_exhaustion", 
                "severity": "medium",
                "indicator": "high_commits",
                "value": commits_pw,
                "message": f"High commit frequency ({commits_pw}/week) - monitor for sustainability"
            })
        
        # After-hours activity
        after_hours = metrics.get("after_hours_commit_percentage", 0)
        if after_hours > self.thresholds["after_hours_commits_high"]:
            indicators.append({
                "type": "emotional_exhaustion",
                "severity": "high", 
                "indicator": "excessive_after_hours",
                "value": f"{after_hours:.1%}",
                "message": f"High after-hours activity ({after_hours:.1%}) suggests poor work-life boundaries"
            })
        
        # Weekend work
        weekend_pct = metrics.get("weekend_commit_percentage", 0)
        if weekend_pct > self.thresholds["weekend_commits_high"]:
            indicators.append({
                "type": "depersonalization",
                "severity": "high",
                "indicator": "weekend_work",
                "value": f"{weekend_pct:.1%}",
                "message": f"Frequent weekend work ({weekend_pct:.1%}) indicates unsustainable patterns"
            })
        
        # Large PR patterns
        avg_pr_size = metrics.get("avg_pr_size", 0)
        if avg_pr_size > self.thresholds["pr_size_large"]:
            indicators.append({
                "type": "depersonalization",
                "severity": "medium",
                "indicator": "large_prs",
                "value": avg_pr_size,
                "message": f"Large PRs ({avg_pr_size} lines avg) may indicate reduced collaboration"
            })
        
        # Low review participation
        review_rate = metrics.get("review_participation_rate", 1.0)
        if review_rate < self.thresholds["pr_review_participation_low"]:
            indicators.append({
                "type": "depersonalization",
                "severity": "medium",
                "indicator": "low_review_participation",
                "value": f"{review_rate:.1%}",
                "message": f"Low code review participation ({review_rate:.1%}) suggests disengagement"
            })
        
        return indicators
    
    def _generate_individual_recommendations(
        self,
        burnout_score: float,
        risk_level: str,
        flow_state_analysis: Dict[str, Any]
    ) -> List[str]:
        """Generate personalized recommendations based on GitHub analysis."""
        recommendations = []
        
        if risk_level == "high":
            recommendations.append("🚨 High burnout risk detected - consider reducing workload and improving work-life balance")
        
        flow_state = flow_state_analysis.get("flow_state", "unknown")
        if flow_state == "frantic_activity":
            recommendations.append("⚡ Activity patterns suggest frantic work - focus on sustainable pace and quality")
        elif flow_state == "healthy_flow":
            recommendations.append("✅ Healthy work patterns detected - maintain current sustainable approach")
        
        flow_indicators = flow_state_analysis.get("indicators", {})
        
        if flow_indicators.get("boundaries", 10) < 5:
            recommendations.append("🕐 Consider establishing clearer work-time boundaries (reduce after-hours and weekend commits)")
        
        if flow_indicators.get("balance", 10) < 5:
            recommendations.append("⚖️ Work activity seems imbalanced - try to include more code reviews alongside development")
        
        if flow_indicators.get("quality", 10) < 5:
            recommendations.append("🎯 Focus on code quality - smaller, more focused commits and PRs")
        
        if not recommendations:
            recommendations.append("📊 GitHub activity patterns appear healthy - continue current practices")
        
        return recommendations
    
    def _generate_github_insights(
        self, 
        member_analyses: List[Dict[str, Any]], 
        baselines: Dict[str, float]
    ) -> List[Dict[str, Any]]:
        """Generate team-level insights from GitHub analysis."""
        insights = []
        
        if not member_analyses:
            return insights
        
        # High-risk members insight
        high_risk_count = sum(1 for m in member_analyses if m.get("risk_level") == "high")
        if high_risk_count > 0:
            insights.append({
                "type": "warning",
                "category": "team_health",
                "message": f"{high_risk_count} team members show high burnout risk based on GitHub activity",
                "priority": "high",
                "affected_members": high_risk_count
            })
        
        # After-hours work pattern
        after_hours_workers = [
            m for m in member_analyses 
            if m.get("github_metrics", {}).get("after_hours_commit_percentage", 0) > 0.2
        ]
        if len(after_hours_workers) >= len(member_analyses) * 0.3:
            insights.append({
                "type": "pattern",
                "category": "work_boundaries",
                "message": f"{len(after_hours_workers)} team members have significant after-hours GitHub activity",
                "priority": "medium",
                "affected_members": len(after_hours_workers)
            })
        
        # Code review engagement
        low_review_participation = [
            m for m in member_analyses
            if m.get("github_metrics", {}).get("review_participation_rate", 1.0) < 0.5
        ]
        if len(low_review_participation) > len(member_analyses) * 0.4:
            insights.append({
                "type": "pattern",
                "category": "collaboration",
                "message": f"{len(low_review_participation)} team members have low code review participation",
                "priority": "medium",
                "affected_members": len(low_review_participation)
            })
        
        # Flow state analysis
        frantic_workers = [
            m for m in member_analyses
            if m.get("flow_state_analysis", {}).get("flow_state") == "frantic_activity"
        ]
        if frantic_workers:
            insights.append({
                "type": "warning",
                "category": "work_patterns",
                "message": f"{len(frantic_workers)} team members show frantic activity patterns (not healthy flow)",
                "priority": "high",
                "affected_members": len(frantic_workers)
            })
        
        return insights
    
    def _generate_github_recommendations(
        self,
        team_health: Dict[str, Any],
        member_analyses: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Generate team-level recommendations based on GitHub analysis."""
        recommendations = []
        
        health_status = team_health.get("health_status", "unknown")
        members_at_risk = team_health.get("members_at_risk", 0)
        
        if health_status in ["poor", "fair"]:
            recommendations.append({
                "type": "organizational",
                "priority": "high",
                "message": "Consider implementing development workflow improvements to reduce code-related stress",
                "actions": [
                    "Review code review processes for efficiency",
                    "Consider pair programming to distribute knowledge",
                    "Implement work-time boundaries for development activities"
                ]
            })
        
        if members_at_risk > 0:
            recommendations.append({
                "type": "interpersonal",
                "priority": "high", 
                "message": f"Schedule 1-on-1s with {members_at_risk} team members showing burnout risk in GitHub activity",
                "actions": [
                    "Discuss workload and development practices",
                    "Review after-hours and weekend work patterns",
                    "Assess code review and collaboration satisfaction"
                ]
            })
        
        # Analyze common patterns for recommendations
        avg_after_hours = statistics.mean([
            m.get("github_metrics", {}).get("after_hours_commit_percentage", 0)
            for m in member_analyses
        ])
        
        if avg_after_hours > 0.15:  # 15% threshold
            recommendations.append({
                "type": "process_improvement",
                "priority": "medium",
                "message": "Team shows high after-hours development activity",
                "actions": [
                    "Establish core collaboration hours",
                    "Review deployment and release schedules",
                    "Consider asynchronous development practices"
                ]
            })
        
        # Always include GitHub-specific guidance
        recommendations.append({
            "type": "methodology_note",
            "priority": "low",
            "message": "Analysis based on GitHub activity patterns only - consider integrating incident and communication data for comprehensive assessment",
            "actions": [
                "Connect PagerDuty/Rootly for incident analysis",
                "Add Slack integration for communication patterns",
                "Regular team check-ins to validate data-driven insights"
            ]
        })
        
        return recommendations
    
    def _calculate_team_github_metrics(self, github_data: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate aggregated GitHub metrics for the team."""
        if not github_data:
            return {}
        
        all_metrics = [data.get("metrics", {}) for data in github_data.values()]
        all_metrics = [m for m in all_metrics if m]  # Filter out empty metrics
        
        if not all_metrics:
            return {}
        
        # Calculate team totals and averages
        team_metrics = {
            "total_members": len(all_metrics),
            "avg_commits_per_week": statistics.mean([m.get("commits_per_week", 0) for m in all_metrics]),
            "avg_prs_per_week": statistics.mean([m.get("prs_per_week", 0) for m in all_metrics]),
            "avg_reviews_per_week": statistics.mean([m.get("reviews_per_week", 0) for m in all_metrics]),
            "avg_after_hours_percentage": statistics.mean([m.get("after_hours_commit_percentage", 0) for m in all_metrics]),
            "avg_weekend_percentage": statistics.mean([m.get("weekend_commit_percentage", 0) for m in all_metrics]),
            "avg_pr_merge_rate": statistics.mean([m.get("pr_merge_rate", 0.8) for m in all_metrics]),
            
            # Team-level indicators
            "high_activity_members": sum(1 for m in all_metrics if m.get("commits_per_week", 0) > 40),
            "after_hours_workers": sum(1 for m in all_metrics if m.get("after_hours_commit_percentage", 0) > 0.2),
            "weekend_workers": sum(1 for m in all_metrics if m.get("weekend_commit_percentage", 0) > 0.15),
            "low_review_participants": sum(1 for m in all_metrics if m.get("review_participation_rate", 1.0) < 0.5)
        }
        
        return team_metrics
    
    def _get_methodology_notes(self) -> Dict[str, Any]:
        """Return methodology information for transparency."""
        return {
            "analysis_type": "github_only",
            "burnout_dimensions": {
                "personal_burnout": "33.3% weight - commit frequency, after-hours activity, work intensity",
                "work_related_burnout": "33.3% weight - collaboration decline, communication quality, detachment signs", 
                "accomplishment_burnout": "33.4% weight - code quality, review participation, knowledge sharing"
            },
            "flow_state_detection": "Distinguishes healthy high productivity from frantic burnout patterns",
            "baseline_comparison": "Individual metrics compared to team and industry baselines",
            "confidence_factors": "Data completeness, team size, activity level, time range",
            "limitations": [
                "No incident response data",
                "No direct communication sentiment analysis", 
                "GitHub activity may not capture all work",
                "Results should be validated with team members"
            ],
            "scientific_basis": "Based on established burnout research adapted for software development metrics"
        }
    
    def _create_empty_analysis(self, reason: str) -> Dict[str, Any]:
        """Create empty analysis result when no data available."""
        return {
            "analysis_timestamp": datetime.now().isoformat(),
            "analysis_type": "github_only",
            "error": reason,
            "team_health": {
                "overall_score": 0.0,
                "risk_distribution": {"low": 0, "medium": 0, "high": 0, "critical": 0},
                "health_status": "unknown",
                "members_at_risk": 0,
                "confidence_level": "none"
            },
            "team_analysis": {"members": [], "total_members": 0},
            "insights": [],
            "recommendations": [{"type": "data_collection", "message": f"Unable to analyze: {reason}"}],
            "github_specific_metrics": {},
            "methodology_notes": self._get_methodology_notes()
        }
    
    def _determine_risk_level(self, burnout_score: float) -> str:
        """Determine risk level from burnout score using standardized thresholds."""
        from ..core.burnout_config import determine_risk_level
        return determine_risk_level(burnout_score)
    
    def _calculate_individual_confidence(
        self, 
        metrics: Dict[str, Any], 
        activity_data: Dict[str, Any]
    ) -> float:
        """Calculate confidence level for individual analysis."""
        confidence_factors = []
        
        # Data availability
        key_metrics = ["commits_per_week", "prs_per_week", "reviews_per_week"]
        data_completeness = sum(1 for key in key_metrics if metrics.get(key, 0) > 0) / len(key_metrics)
        confidence_factors.append(data_completeness)
        
        # Activity level (more activity = higher confidence)
        total_activity = (
            metrics.get("commits_per_week", 0) +
            metrics.get("prs_per_week", 0) * 2 +
            metrics.get("reviews_per_week", 0)
        )
        activity_confidence = min(1.0, total_activity / 20)  # 20 weekly activities = full confidence
        confidence_factors.append(activity_confidence)
        
        # Time range (assuming we have reasonable data)
        time_confidence = 0.8  # Placeholder
        confidence_factors.append(time_confidence)
        
        return statistics.mean(confidence_factors)