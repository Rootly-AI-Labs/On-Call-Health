"""
AI-Enhanced Burnout Analysis Service

Integrates the smolagents-powered burnout detection agent with the existing analysis pipeline.
"""
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

from ..agents.burnout_agent import create_burnout_agent
from ..agents.workflows import run_team_analysis_workflow

logger = logging.getLogger(__name__)

# Global user context for AI analysis
_current_user = None

def set_user_context(user):
    """Set the current user context for AI analysis."""
    global _current_user
    _current_user = user

def get_user_context():
    """Get the current user context."""
    return _current_user


class AIBurnoutAnalyzerService:
    """
    Service that adds AI-powered insights to the existing burnout analysis.
    
    This service works alongside the traditional burnout analysis to provide:
    - Dynamic, context-aware analysis
    - Intelligent recommendations
    - Pattern recognition across multiple data sources
    - Sentiment analysis integration
    """
    
    def __init__(self, api_key: Optional[str] = None, provider: Optional[str] = None):
        """Initialize the AI burnout analyzer service."""
        self.logger = logging.getLogger(__name__)
        self.api_key = api_key
        self.provider = provider
        
        try:
            # Determine model name based on provider
            if provider == "anthropic":
                model_name = "claude-3-haiku-20240307"  # Cost-efficient for agent reasoning
            else:
                model_name = "gpt-4o-mini"  # Default OpenAI model
            
            self.agent = create_burnout_agent(model_name=model_name, api_key=api_key, provider=provider)
            self.available = True
            self.logger.info(f"AI Burnout Analyzer initialized successfully (provider: {provider}, with API key: {bool(api_key)})")
        except Exception as e:
            self.logger.error(f"Failed to initialize AI agent: {e}")
            self.available = False
    
    def enhance_member_analysis(
        self,
        member_data: Dict[str, Any],
        traditional_analysis: Dict[str, Any],
        available_integrations: List[str]
    ) -> Dict[str, Any]:
        """
        Enhance traditional burnout analysis with AI insights.
        
        Args:
            member_data: Raw member data from all sources
            traditional_analysis: Results from traditional burnout analysis
            available_integrations: List of available data sources
            
        Returns:
            Enhanced analysis with AI insights
        """
        if not self.available:
            return self._add_unavailable_notice(traditional_analysis)
        
        try:
            # Prepare data for AI analysis
            ai_member_data = self._prepare_ai_data(member_data, available_integrations)
            
            # Get AI analysis
            ai_insights = self.agent.analyze_member_burnout(
                ai_member_data,
                available_integrations
            )
            
            # Log AI enhancement details before merging
            traditional_member_count = len(traditional_analysis.get('members', []))
            ai_enhanced_count = len([m for m in ai_insights.get('members', []) if m.get('ai_insights')])
            self.logger.info(f"AI Enhancement Summary - Traditional members: {traditional_member_count}, AI enhanced: {ai_enhanced_count}")
            
            # Merge AI insights with traditional analysis
            enhanced_analysis = self._merge_analyses(traditional_analysis, ai_insights)
            
            # Log final enhancement results
            final_member_count = len(enhanced_analysis.get('members', []))
            ai_enabled_final = enhanced_analysis.get('ai_enhanced', False)
            self.logger.info(f"AI Enhancement Complete - Final members: {final_member_count}, AI enabled: {ai_enabled_final}")
            
            return enhanced_analysis
            
        except Exception as e:
            self.logger.error(f"Error in AI analysis enhancement: {e}")
            self.logger.error(f"AI Enhancement Error Details - Traditional analysis size: {len(traditional_analysis.get('members', []))}, Error type: {type(e).__name__}")
            return self._add_error_notice(traditional_analysis, str(e))
    
    def generate_team_insights(
        self,
        team_members: List[Dict[str, Any]],
        available_integrations: List[str]
    ) -> Dict[str, Any]:
        """
        Generate team-level AI insights and recommendations.
        
        Args:
            team_members: List of team member analyses
            available_integrations: Available data sources
            
        Returns:
            Team-level AI insights
        """
        if not self.available:
            return {"available": False, "message": "AI insights not available"}
        
        try:
            # Analyze team patterns with verbose insights
            team_insights = {
                "analysis_timestamp": datetime.utcnow().isoformat(),
                "team_size": len(team_members),
                "data_sources": available_integrations,
                "executive_summary": self._generate_executive_summary(team_members, available_integrations),
                "llm_team_analysis": self._generate_llm_team_narrative(team_members, available_integrations),
                "risk_distribution": self._analyze_team_risk_distribution(team_members),
                "detailed_risk_analysis": self._generate_detailed_risk_analysis(team_members),
                "common_patterns": self._identify_common_patterns(team_members),
                "burnout_indicators": self._analyze_burnout_indicators(team_members),
                "workload_distribution": self._analyze_workload_distribution(team_members),
                "communication_analysis": self._analyze_team_communication(team_members),
                "temporal_patterns": self._analyze_temporal_patterns(team_members),
                "team_recommendations": self._generate_team_recommendations(team_members),
                "individual_insights": self._generate_individual_member_insights(team_members),
                "trend_analysis": self._analyze_team_trends(team_members),
                "risk_factors": self._identify_primary_risk_factors(team_members)
            }
            
            return {"available": True, "insights": team_insights}
            
        except Exception as e:
            self.logger.error(f"Error generating team insights: {e}")
            return {"available": False, "error": str(e)}
    
    async def run_comprehensive_workflow(
        self,
        team_data: List[Dict[str, Any]],
        available_integrations: List[str],
        historical_data: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Run comprehensive team analysis workflow using advanced smolagents capabilities.
        
        Args:
            team_data: List of team member data
            available_integrations: Available data sources
            historical_data: Optional historical analyses for trend analysis
            
        Returns:
            Comprehensive workflow results with multi-phase analysis
        """
        if not self.available:
            return {
                "available": False, 
                "message": "AI agent not available for workflow analysis"
            }
        
        try:
            # Run the comprehensive workflow
            workflow_results = await run_team_analysis_workflow(
                agent=self.agent,
                team_data=team_data,
                available_data_sources=available_integrations,
                historical_data=historical_data
            )
            
            # Log workflow completion
            phases_completed = len(workflow_results.get("phases", {}))
            team_size = workflow_results.get("team_size", 0)
            self.logger.info(
                f"Comprehensive workflow completed - Team size: {team_size}, "
                f"Phases: {phases_completed}, Status: {workflow_results.get('executive_summary', {}).get('team_health_status', 'unknown')}"
            )
            
            return {
                "available": True,
                "workflow_results": workflow_results
            }
            
        except Exception as e:
            self.logger.error(f"Error in comprehensive workflow: {e}")
            return {
                "available": False,
                "error": str(e)
            }
    
    def _prepare_ai_data(self, member_data: Dict[str, Any], integrations: List[str]) -> Dict[str, Any]:
        """
        Transform member data into format expected by AI agent.
        """
        ai_data = {
            "name": member_data.get("user_name", "Unknown"),
            "user_id": member_data.get("user_id"),
            "incidents": [],
            "commits": [],
            "pull_requests": [],
            "messages": [],
            "slack_messages": [],
            "pr_comments": [],
            "incident_comments": []
        }
        
        # Add incident data
        if "incidents" in member_data:
            for incident in member_data["incidents"]:
                ai_data["incidents"].append({
                    "timestamp": incident.get("created_at") or incident.get("timestamp"),
                    "severity": incident.get("severity"),
                    "response_time_minutes": incident.get("acknowledged_at_minutes"),
                    "resolved_at": incident.get("resolved_at"),
                    "urgency": incident.get("urgency")
                })
        
        # Add GitHub data if available
        if "github" in integrations and member_data.get("github_activity"):
            github_data = member_data["github_activity"]
            
            # Add commits
            if "commits" in github_data:
                for commit in github_data["commits"]:
                    ai_data["commits"].append({
                        "timestamp": commit.get("created_at") or commit.get("timestamp"),
                        "changes": commit.get("additions", 0) + commit.get("deletions", 0),
                        "message": commit.get("message", "")
                    })
            
            # Add pull requests
            if "pull_requests" in github_data:
                for pr in github_data["pull_requests"]:
                    ai_data["pull_requests"].append({
                        "timestamp": pr.get("created_at") or pr.get("timestamp"),
                        "size": pr.get("additions", 0) + pr.get("deletions", 0),
                        "title": pr.get("title", ""),
                        "state": pr.get("state")
                    })
        
        # Add Slack data if available
        if "slack" in integrations and member_data.get("slack_activity"):
            slack_data = member_data["slack_activity"]
            
            # Add messages
            if "messages" in slack_data:
                for message in slack_data["messages"]:
                    ai_data["messages"].append({
                        "timestamp": message.get("created_at") or message.get("timestamp"),
                        "text": message.get("text", ""),
                        "channel": message.get("channel")
                    })
                    
                    # Also add to slack_messages for sentiment analysis
                    ai_data["slack_messages"].append({
                        "text": message.get("text", ""),
                        "timestamp": message.get("created_at") or message.get("timestamp")
                    })
        
        return ai_data
    
    def _merge_analyses(self, traditional: Dict[str, Any], ai_insights: Dict[str, Any]) -> Dict[str, Any]:
        """
        Merge traditional analysis with AI insights.
        """
        enhanced = traditional.copy()
        
        # Add AI insights section
        enhanced["ai_insights"] = ai_insights.get("ai_insights", {})
        
        # Enhance risk assessment
        ai_risk = ai_insights.get("risk_assessment", {})
        if ai_risk:
            enhanced["ai_risk_assessment"] = ai_risk
            
            # If AI detected higher risk, flag it
            traditional_risk = enhanced.get("risk_level", "low")
            ai_risk_level = ai_risk.get("overall_risk_level", "low")
            
            if self._risk_level_value(ai_risk_level) > self._risk_level_value(traditional_risk):
                enhanced["risk_level"] = ai_risk_level
                enhanced["risk_escalated_by_ai"] = True
        
        # Add AI recommendations
        ai_recommendations = ai_insights.get("recommendations", [])
        if ai_recommendations:
            enhanced["ai_recommendations"] = ai_recommendations
            
            # Add high-priority AI recommendations to main recommendations
            urgent_ai_recs = [rec for rec in ai_recommendations if rec.get("priority") in ["urgent", "high"]]
            if urgent_ai_recs:
                if "recommendations" not in enhanced:
                    enhanced["recommendations"] = []
                
                for rec in urgent_ai_recs:
                    enhanced["recommendations"].append(f"[AI] {rec['description']}")
        
        # Add confidence and analysis metadata
        enhanced["ai_confidence"] = ai_insights.get("confidence_score", 0.0)
        enhanced["ai_analysis_timestamp"] = ai_insights.get("analysis_timestamp")
        enhanced["ai_data_sources"] = ai_insights.get("data_sources_analyzed", [])
        
        return enhanced
    
    def _risk_level_value(self, risk_level: str) -> int:
        """Convert risk level to numeric value for comparison."""
        levels = {"low": 1, "medium": 2, "moderate": 2, "high": 3, "critical": 4}
        return levels.get(risk_level.lower(), 1)
    
    def _analyze_team_risk_distribution(self, team_members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze risk distribution across the team."""
        risk_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
        risk_members = {"low": [], "medium": [], "high": [], "critical": []}
        ai_escalations = 0
        
        for member in team_members:
            try:
                if not member or not isinstance(member, dict):
                    logger.debug("Skipping invalid member in team enhancement")
                    continue
                    
                # Safe extraction of member data
                risk_level = "low"
                member_name = "Unknown"
                member_email = ""
                
                try:
                    raw_risk_level = member.get("risk_level", "low")
                    if isinstance(raw_risk_level, str):
                        risk_level = raw_risk_level.lower()
                except Exception as e:
                    logger.debug(f"Error extracting risk_level: {e}")
                    
                try:
                    raw_member_name = member.get("user_name", "Unknown")
                    if isinstance(raw_member_name, str):
                        member_name = raw_member_name
                except Exception as e:
                    logger.debug(f"Error extracting user_name: {e}")
                    
                try:
                    raw_member_email = member.get("user_email", "")
                    if isinstance(raw_member_email, str):
                        member_email = raw_member_email
                except Exception as e:
                    logger.debug(f"Error extracting user_email: {e}")
            except Exception as e:
                logger.warning(f"Error processing member in team enhancement: {e}")
                continue
            
            if risk_level in risk_counts:
                risk_counts[risk_level] += 1
                risk_members[risk_level].append({
                    "name": member_name,
                    "email": member_email,
                    "user_id": member.get("user_id"),
                    "burnout_score": member.get("ocb_score") if member.get("ocb_score") is not None else member.get("burnout_score", 0),
                    "scoring_type": "OCB" if member.get("ocb_score") is not None else "Legacy",
                    "incident_count": len(member.get("incidents", []))
                })
            
            if member.get("risk_escalated_by_ai"):
                ai_escalations += 1
        
        total = len(team_members)
        high_risk_count = risk_counts["high"] + risk_counts["critical"]
        
        return {
            "distribution": risk_counts,
            "members_by_risk": risk_members,
            "high_risk_percentage": (high_risk_count / total * 100) if total > 0 else 0,
            "ai_escalations": ai_escalations,
            "total_members": total
        }
    
    def _identify_common_patterns(self, team_members: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Identify common patterns across team members."""
        patterns = []
        
        # Count common AI-identified issues
        issue_counts = {}
        
        for member in team_members:
            ai_risk = member.get("ai_risk_assessment", {})
            risk_factors = ai_risk.get("risk_factors", [])
            
            for factor in risk_factors:
                # Extract pattern type from risk factor
                pattern_key = self._extract_pattern_type(factor)
                if pattern_key:
                    issue_counts[pattern_key] = issue_counts.get(pattern_key, 0) + 1
        
        # Identify patterns affecting multiple team members
        team_size = len(team_members)
        threshold = max(2, team_size * 0.3)  # At least 2 members or 30% of team
        
        for pattern, count in issue_counts.items():
            if count >= threshold:
                patterns.append({
                    "pattern": pattern,
                    "affected_members": count,
                    "percentage": (count / team_size * 100) if team_size > 0 else 0,
                    "severity": "high" if count >= team_size * 0.5 else "medium"
                })
        
        return sorted(patterns, key=lambda x: x["affected_members"], reverse=True)
    
    def _extract_pattern_type(self, risk_factor: str) -> Optional[str]:
        """Extract pattern type from risk factor description."""
        risk_factor_lower = risk_factor.lower()
        
        if "after-hours" in risk_factor_lower or "after hours" in risk_factor_lower:
            return "after_hours_work"
        elif "weekend" in risk_factor_lower:
            return "weekend_work"
        elif "incident" in risk_factor_lower and ("load" in risk_factor_lower or "response" in risk_factor_lower):
            return "incident_overload"
        elif "negative" in risk_factor_lower and "sentiment" in risk_factor_lower:
            return "communication_stress"
        elif "workload" in risk_factor_lower:
            return "high_workload"
        elif "coding" in risk_factor_lower or "commit" in risk_factor_lower:
            return "excessive_coding"
        elif "communication" in risk_factor_lower and "overload" in risk_factor_lower:
            return "communication_overload"
        
        return None
    
    def _generate_team_recommendations(self, team_members: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Generate team-level recommendations based on AI analysis."""
        recommendations = []
        
        # Analyze common patterns
        common_patterns = self._identify_common_patterns(team_members)
        
        for pattern in common_patterns:
            if pattern["severity"] == "high":
                rec = self._get_team_recommendation_for_pattern(pattern["pattern"], pattern["affected_members"])
                if rec:
                    recommendations.append(rec)
        
        # Overall team health recommendations
        risk_dist = self._analyze_team_risk_distribution(team_members)
        high_risk_pct = risk_dist["high_risk_percentage"]
        high_risk_members = risk_dist["members_by_risk"]["high"] + risk_dist["members_by_risk"]["critical"]
        medium_risk_members = risk_dist["members_by_risk"]["medium"]
        
        if high_risk_pct > 30:
            high_risk_names = [member["name"] for member in high_risk_members]
            recommendations.append({
                "priority": "urgent",
                "category": "team_health",
                "title": "Team Burnout Risk Critical",
                "description": f"{high_risk_pct:.1f}% of team members show high burnout risk",
                "at_risk_members": high_risk_names,
                "member_details": high_risk_members,
                "actions": [
                    f"Conduct immediate workload review for: {', '.join(high_risk_names)}" if high_risk_names else "Conduct immediate team workload review",
                    "Implement team-wide stress reduction measures",
                    "Consider bringing in additional resources",
                    "Review team processes and efficiency"
                ]
            })
        elif high_risk_pct > 15:
            elevated_risk_members = high_risk_members + medium_risk_members
            elevated_risk_names = [member["name"] for member in elevated_risk_members]
            recommendations.append({
                "priority": "high",
                "category": "team_health", 
                "title": "Team Burnout Prevention",
                "description": f"{high_risk_pct:.1f}% of team members show elevated burnout risk",
                "at_risk_members": elevated_risk_names,
                "member_details": elevated_risk_members,
                "actions": [
                    f"Monitor workload trends for: {', '.join(elevated_risk_names)}" if elevated_risk_names else "Monitor team workload trends closely",
                    "Implement preventive measures",
                    "Improve team communication and support"
                ]
            })
        
        return recommendations
    
    def _get_team_recommendation_for_pattern(self, pattern: str, affected_count: int) -> Optional[Dict[str, Any]]:
        """Get team recommendation for a specific pattern."""
        if pattern == "after_hours_work":
            return {
                "priority": "high",
                "category": "work_life_balance",
                "title": "Team After-Hours Work Issue",
                "description": f"{affected_count} team members showing excessive after-hours work",
                "actions": [
                    "Establish team-wide after-hours boundaries",
                    "Review on-call rotation effectiveness",
                    "Implement better workload planning"
                ]
            }
        elif pattern == "weekend_work":
            return {
                "priority": "high",
                "category": "work_life_balance",
                "title": "Team Weekend Work Pattern",
                "description": f"{affected_count} team members frequently working weekends",
                "actions": [
                    "Review sprint planning and estimation",
                    "Establish weekend work policies",
                    "Improve task prioritization"
                ]
            }
        elif pattern == "incident_overload":
            return {
                "priority": "urgent",
                "category": "operational",
                "title": "Team Incident Overload",
                "description": f"{affected_count} team members experiencing incident response overload",
                "actions": [
                    "Expand incident response team",
                    "Improve monitoring and prevention",
                    "Review incident severity classification"
                ]
            }
        elif pattern == "communication_stress":
            return {
                "priority": "medium",
                "category": "team_dynamics",
                "title": "Team Communication Health",
                "description": f"{affected_count} team members showing communication stress indicators",
                "actions": [
                    "Conduct team communication workshop",
                    "Review team collaboration processes",
                    "Provide conflict resolution support"
                ]
            }
        
        return None
    
    def _analyze_workload_distribution(self, team_members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze workload distribution across the team."""
        workload_data = []
        
        for member in team_members:
            ai_insights = member.get("ai_insights", {})
            workload_info = ai_insights.get("workload", {})
            
            if workload_info:
                workload_data.append({
                    "member": member.get("user_name", "Unknown"),
                    "intensity": workload_info.get("intensity_score", 0),
                    "status": workload_info.get("workload_status", "unknown")
                })
        
        if not workload_data:
            return {"available": False}
        
        # Calculate distribution metrics
        intensities = [w["intensity"] for w in workload_data]
        avg_intensity = sum(intensities) / len(intensities) if intensities else 0
        max_intensity = max(intensities) if intensities else 0
        min_intensity = min(intensities) if intensities else 0
        
        # Find imbalances
        imbalance_threshold = 30  # intensity points
        imbalanced_pairs = []
        
        for i, member1 in enumerate(workload_data):
            for member2 in workload_data[i+1:]:
                diff = abs(member1["intensity"] - member2["intensity"])
                if diff > imbalance_threshold:
                    imbalanced_pairs.append({
                        "high_load": member1["member"] if member1["intensity"] > member2["intensity"] else member2["member"],
                        "low_load": member2["member"] if member1["intensity"] > member2["intensity"] else member1["member"],
                        "difference": diff
                    })
        
        return {
            "available": True,
            "average_intensity": round(avg_intensity, 1),
            "intensity_range": {"min": min_intensity, "max": max_intensity},
            "imbalances": imbalanced_pairs,
            "distribution_health": "poor" if len(imbalanced_pairs) > len(workload_data) * 0.3 else "good"
        }
    
    def _add_unavailable_notice(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Add notice that AI analysis is unavailable."""
        analysis = analysis.copy()
        analysis["ai_available"] = False
        analysis["ai_notice"] = "AI-enhanced analysis not available. Using traditional analysis only."
        return analysis
    
    def _add_error_notice(self, analysis: Dict[str, Any], error: str) -> Dict[str, Any]:
        """Add error notice to analysis."""
        analysis = analysis.copy()
        analysis["ai_available"] = False
        analysis["ai_error"] = f"AI analysis error: {error}"
        return analysis


    def _generate_executive_summary(self, team_members: List[Dict[str, Any]], available_integrations: List[str]) -> Dict[str, Any]:
        """Generate a comprehensive executive summary of team burnout status using OCB methodology."""
        risk_dist = self._analyze_team_risk_distribution(team_members)
        total_incidents = sum(len(member.get("incidents", [])) for member in team_members)
        
        # Use OCB scores if available, otherwise fall back to legacy scoring
        ocb_scores = []
        legacy_scores = []
        
        for member in team_members:
            ocb_score = member.get("ocb_score")
            if ocb_score is not None:
                ocb_scores.append(ocb_score)
            else:
                legacy_score = member.get("burnout_score", 0)
                legacy_scores.append(legacy_score)
        
        # Calculate average burnout level
        if ocb_scores:
            avg_ocb_score = sum(ocb_scores) / len(ocb_scores)
            avg_legacy_score = 0  # Not used but defined for consistency
            using_ocb = True
            # For display, convert OCB to health score (100 - OCB score)
            overall_health_score = round(100 - avg_ocb_score, 1)
            avg_burnout_display = round(avg_ocb_score, 1)
            trajectory_score = avg_ocb_score
        else:
            avg_legacy_score = sum(legacy_scores) / len(legacy_scores) if legacy_scores else 0
            avg_ocb_score = 0  # Not used but defined for consistency
            using_ocb = False
            overall_health_score = round(100 - (avg_legacy_score * 10), 1)
            avg_burnout_display = round(avg_legacy_score, 2)
            trajectory_score = avg_legacy_score * 10  # Convert to 0-100 scale
        
        high_risk_count = risk_dist["distribution"]["high"] + risk_dist["distribution"]["critical"]
        medium_risk_count = risk_dist["distribution"]["medium"]
        
        # Generate narrative summary using OCB terminology
        if high_risk_count > 0:
            urgency_level = "Critical"
            if using_ocb:
                primary_concern = f"{high_risk_count} team member(s) showing severe OCB burnout symptoms (>75/100) requiring immediate intervention"
            else:
                primary_concern = f"{high_risk_count} team member(s) showing severe burnout symptoms requiring immediate intervention"
        elif medium_risk_count > len(team_members) * 0.5:
            urgency_level = "High"
            primary_concern = f"Over half the team ({medium_risk_count} members) showing elevated stress levels"
        elif medium_risk_count > 0:
            urgency_level = "Moderate"
            if using_ocb:
                primary_concern = f"{medium_risk_count} team member(s) showing moderate OCB burnout warning signs (25-74/100)"
            else:
                primary_concern = f"{medium_risk_count} team member(s) showing early burnout warning signs"
        else:
            urgency_level = "Low"
            primary_concern = "Team appears to be managing workload effectively with healthy OCB scores" if using_ocb else "Team appears to be managing workload effectively"
        
        return {
            "urgency_level": urgency_level,
            "overall_health_score": overall_health_score,
            "primary_concern": primary_concern,
            "key_metrics": {
                "total_team_incidents": total_incidents,
                "average_burnout_score": avg_burnout_display,
                "scoring_methodology": "OCB (0-100)" if using_ocb else "Legacy (0-10)",
                "high_risk_percentage": risk_dist["high_risk_percentage"],
                "data_completeness": len(available_integrations)
            },
            "immediate_actions_needed": high_risk_count > 0,
            "team_trajectory": self._determine_team_trajectory(trajectory_score, using_ocb)
        }
    
    def _determine_team_trajectory(self, burnout_score: float, is_ocb: bool) -> str:
        """Determine team trajectory based on burnout score and methodology."""
        if is_ocb:
            # OCB scoring: 0-100 where higher = more burnout
            if burnout_score >= 75:
                return "Critical Risk"
            elif burnout_score >= 50:
                return "Declining"
            elif burnout_score >= 25:
                return "Stable"
            else:
                return "Healthy"
        else:
            # Legacy scoring converted to 0-100 scale
            if burnout_score >= 70:
                return "Declining" 
            elif burnout_score >= 30:
                return "Stable"
            else:
                return "Healthy"
    
    def _generate_detailed_risk_analysis(self, team_members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate detailed analysis of risk factors across the team."""
        detailed_analysis = {
            "risk_breakdown": {},
            "contributing_factors": [],
            "member_spotlight": []
        }
        
        for risk_level in ["critical", "high", "medium", "low"]:
            members_at_risk = []
            try:
                for m in team_members:
                    if m and isinstance(m, dict):
                        try:
                            member_risk_level = m.get("risk_level", "low")
                            if isinstance(member_risk_level, str) and member_risk_level.lower() == risk_level:
                                members_at_risk.append(m)
                        except Exception as e:
                            logger.debug(f"Error checking risk level for member: {e}")
                            continue
            except Exception as e:
                logger.warning(f"Error processing risk level {risk_level}: {e}")
                members_at_risk = []
            if members_at_risk:
                detailed_analysis["risk_breakdown"][risk_level] = {
                    "count": len(members_at_risk),
                    "members": [m.get("user_name", "Unknown") for m in members_at_risk],
                    "common_patterns": self._identify_risk_patterns(members_at_risk),
                    "severity_indicators": self._get_severity_indicators(members_at_risk)
                }
        
        # Identify top contributing factors
        all_factors = []
        for member in team_members:
            ai_insights = member.get("ai_insights", {})
            if ai_insights and ai_insights.get("insights"):
                factors = ai_insights["insights"].get("primary_risk_factors", [])
                all_factors.extend(factors)
        
        from collections import Counter
        factor_counts = Counter(all_factors)
        detailed_analysis["contributing_factors"] = [
            {"factor": factor, "affected_members": count, "percentage": round(count/len(team_members)*100, 1)}
            for factor, count in factor_counts.most_common(5)
        ]
        
        return detailed_analysis
    
    def _analyze_burnout_indicators(self, team_members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze specific burnout indicators across the team."""
        indicators = {
            "emotional_exhaustion": {"severe": 0, "moderate": 0, "mild": 0},
            "depersonalization": {"severe": 0, "moderate": 0, "mild": 0},
            "reduced_accomplishment": {"severe": 0, "moderate": 0, "mild": 0},
            "after_hours_activity": {"concerning": [], "moderate": [], "normal": []},
            "communication_stress": {"high": [], "moderate": [], "low": []},
            "workload_sustainability": {"unsustainable": [], "concerning": [], "manageable": []}
        }
        
        for member in team_members:
            name = member.get("user_name", "Unknown")
            ai_insights = member.get("ai_insights", {})
            
            # Analyze burnout dimensions if available
            burnout_dims = ai_insights.get("burnout_analysis", {}) if ai_insights else {}
            
            # After-hours analysis
            after_hours_pct = member.get("after_hours_percentage", 0)
            if after_hours_pct > 40:
                indicators["after_hours_activity"]["concerning"].append({
                    "name": name, "percentage": after_hours_pct
                })
            elif after_hours_pct > 20:
                indicators["after_hours_activity"]["moderate"].append({
                    "name": name, "percentage": after_hours_pct
                })
            else:
                indicators["after_hours_activity"]["normal"].append({
                    "name": name, "percentage": after_hours_pct
                })
        
        return indicators
    
    def _analyze_team_communication(self, team_members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze team communication patterns and stress indicators."""
        communication_analysis = {
            "overall_sentiment": "neutral",
            "stress_indicators": [],
            "communication_volume": {"high": [], "normal": [], "low": []},
            "negative_sentiment_trends": [],
            "team_interaction_health": "unknown"
        }
        
        total_messages = 0
        sentiment_scores = []
        
        for member in team_members:
            name = member.get("user_name", "Unknown")
            ai_insights = member.get("ai_insights", {})
            
            if ai_insights and "sentiment_analysis" in ai_insights:
                sentiment = ai_insights["sentiment_analysis"]
                sentiment_score = sentiment.get("sentiment_score", 0)
                message_count = sentiment.get("total_messages", 0)
                
                sentiment_scores.append(sentiment_score)
                total_messages += message_count
                
                if sentiment_score < -0.3:
                    communication_analysis["negative_sentiment_trends"].append({
                        "member": name,
                        "sentiment_score": sentiment_score,
                        "stress_indicators": sentiment.get("stress_indicators", [])
                    })
        
        if sentiment_scores:
            avg_sentiment = sum(sentiment_scores) / len(sentiment_scores)
            communication_analysis["overall_sentiment"] = (
                "negative" if avg_sentiment < -0.1 else 
                "neutral" if avg_sentiment < 0.1 else 
                "positive"
            )
            communication_analysis["team_sentiment_score"] = round(avg_sentiment, 3)
        
        return communication_analysis
    
    def _analyze_temporal_patterns(self, team_members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze temporal work patterns across the team."""
        patterns = {
            "peak_activity_hours": {},
            "weekend_work_analysis": {},
            "after_hours_trends": {},
            "burnout_progression": []
        }
        
        # Aggregate temporal data
        all_hours = []
        weekend_workers = []
        after_hours_workers = []
        
        for member in team_members:
            name = member.get("user_name", "Unknown")
            
            # Weekend work analysis
            weekend_pct = member.get("weekend_percentage", 0)
            if weekend_pct > 15:
                weekend_workers.append({"name": name, "percentage": weekend_pct})
            
            # After hours analysis
            after_hours_pct = member.get("after_hours_percentage", 0)
            if after_hours_pct > 25:
                after_hours_workers.append({"name": name, "percentage": after_hours_pct})
        
        patterns["weekend_work_analysis"] = {
            "members_working_weekends": weekend_workers,
            "team_weekend_work_rate": len(weekend_workers) / len(team_members) * 100 if team_members else 0
        }
        
        patterns["after_hours_trends"] = {
            "members_working_after_hours": after_hours_workers,
            "team_after_hours_rate": len(after_hours_workers) / len(team_members) * 100 if team_members else 0
        }
        
        return patterns
    
    def _generate_individual_member_insights(self, team_members: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Generate detailed insights for each team member."""
        individual_insights = []
        
        for member in team_members:
            name = member.get("user_name", "Unknown")
            risk_level = member.get("risk_level", "low")
            burnout_score = member.get("burnout_score", 0)
            incident_count = len(member.get("incidents", []))
            
            ai_insights = member.get("ai_insights", {})
            member_insight = {
                "name": name,
                "risk_level": risk_level,
                "burnout_score": burnout_score,
                "incident_load": incident_count,
                "key_concerns": [],
                "strengths": [],
                "recommended_actions": [],
                "manager_notes": ""
            }
            
            # Extract key insights from AI analysis
            if ai_insights and ai_insights.get("insights"):
                insights = ai_insights["insights"]
                member_insight["key_concerns"] = insights.get("primary_risk_factors", [])
                member_insight["recommended_actions"] = insights.get("recommendations", [])
                
                # Generate manager notes
                if risk_level.lower() in ["high", "critical"]:
                    member_insight["manager_notes"] = f"Immediate attention required for {name}. Schedule 1:1 to discuss workload and stress levels."
                elif risk_level.lower() == "medium":
                    member_insight["manager_notes"] = f"Monitor {name} closely. Consider preventive measures to avoid escalation."
                else:
                    member_insight["manager_notes"] = f"{name} appears to be managing well. Continue current support level."
            
            individual_insights.append(member_insight)
        
        return individual_insights
    
    def _analyze_team_trends(self, team_members: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze trends and patterns in team burnout risk."""
        trends = {
            "risk_trajectory": "stable",
            "emerging_patterns": [],
            "early_warning_signs": [],
            "positive_indicators": [],
            "team_resilience_factors": []
        }
        
        # Count high-risk members with null safety
        high_risk_count = 0
        try:
            for m in team_members:
                if m and isinstance(m, dict):
                    try:
                        risk_level = m.get("risk_level", "low")
                        if isinstance(risk_level, str) and risk_level.lower() in ["high", "critical"]:
                            high_risk_count += 1
                    except Exception as e:
                        logger.debug(f"Error checking high risk level for member: {e}")
                        continue
        except Exception as e:
            logger.warning(f"Error counting high-risk members: {e}")
            high_risk_count = 0
        total_members = len(team_members)
        
        if high_risk_count > total_members * 0.5:
            trends["risk_trajectory"] = "rapidly_declining"
            trends["early_warning_signs"].append("Over 50% of team showing high burnout risk")
        elif high_risk_count > total_members * 0.3:
            trends["risk_trajectory"] = "concerning"
            trends["early_warning_signs"].append("Significant portion of team under stress")
        
        # Identify positive indicators with null safety
        low_risk_count = 0
        try:
            for m in team_members:
                if m and isinstance(m, dict):
                    try:
                        risk_level = m.get("risk_level", "low")
                        if isinstance(risk_level, str) and risk_level.lower() == "low":
                            low_risk_count += 1
                    except Exception as e:
                        logger.debug(f"Error checking low risk level for member: {e}")
                        continue
        except Exception as e:
            logger.warning(f"Error counting low-risk members: {e}")
            low_risk_count = 0
        if low_risk_count > total_members * 0.6:
            trends["positive_indicators"].append("Majority of team showing healthy stress levels")
        
        return trends
    
    def _identify_primary_risk_factors(self, team_members: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Identify and rank primary risk factors affecting the team."""
        risk_factors = []
        
        # Analyze workload factors
        high_incident_members = [m for m in team_members if len(m.get("incidents", [])) > 10]
        if high_incident_members:
            risk_factors.append({
                "factor": "Excessive Incident Load",
                "severity": "high" if len(high_incident_members) > len(team_members) * 0.3 else "medium",
                "affected_members": [m.get("user_name", "Unknown") for m in high_incident_members],
                "description": f"{len(high_incident_members)} team members handling excessive incident volumes",
                "recommended_action": "Redistribute incident load and review escalation procedures"
            })
        
        # Analyze temporal factors
        after_hours_members = [m for m in team_members if m.get("after_hours_percentage", 0) > 30]
        if after_hours_members:
            risk_factors.append({
                "factor": "After-Hours Work Overload",
                "severity": "high" if len(after_hours_members) > len(team_members) * 0.4 else "medium",
                "affected_members": [m.get("user_name", "Unknown") for m in after_hours_members],
                "description": f"{len(after_hours_members)} team members regularly working after hours",
                "recommended_action": "Implement after-hours work policies and improve coverage rotation"
            })
        
        return risk_factors
    
    def _identify_risk_patterns(self, members_at_risk: List[Dict[str, Any]]) -> List[str]:
        """Identify common patterns among members at the same risk level."""
        patterns = []
        
        high_incident_count = len([m for m in members_at_risk if len(m.get("incidents", [])) > 8])
        if high_incident_count > len(members_at_risk) * 0.5:
            patterns.append("High incident load")
        
        after_hours_count = len([m for m in members_at_risk if m.get("after_hours_percentage", 0) > 25])
        if after_hours_count > len(members_at_risk) * 0.5:
            patterns.append("Excessive after-hours work")
        
        return patterns
    
    def _get_severity_indicators(self, members_at_risk: List[Dict[str, Any]]) -> List[str]:
        """Get severity indicators for members at risk."""
        indicators = []
        
        avg_burnout = sum(m.get("burnout_score", 0) for m in members_at_risk) / len(members_at_risk)
        if avg_burnout > 7:
            indicators.append("Severe burnout scores")
        
        total_incidents = sum(len(m.get("incidents", [])) for m in members_at_risk)
        if total_incidents > len(members_at_risk) * 15:
            indicators.append("Overwhelming incident volume")
        
        return indicators

    def _generate_llm_team_narrative(self, team_members: List[Dict[str, Any]], available_integrations: List[str]) -> str:
        """Generate detailed, colorful LLM-powered team analysis narrative."""
        try:
            # Check if we have an API key available (system or user)
            if not self.api_key:
                self.logger.warning("No LLM API key available for team narrative generation")
                return self._generate_fallback_detailed_narrative(team_members, available_integrations)
            
            # Prepare comprehensive team data for LLM analysis
            team_data = self._prepare_comprehensive_team_data(team_members, available_integrations)
            
            # Create detailed prompt for rich narrative generation
            import random
            
            # Add randomization elements to ensure unique responses
            opening_styles = [
                "Begin with an unexpected observation about the data patterns",
                "Start by highlighting the most surprising metric first", 
                "Open with a comparison to industry standards or benchmarks",
                "Lead with the strongest indicator of team health (positive or negative)",
                "Begin with a temporal pattern that stands out in the timeline",
                "Start by addressing the most actionable insight for leadership"
            ]
            
            analysis_perspectives = [
                "Focus on the human element behind the metrics",
                "Emphasize data-driven patterns and correlations", 
                "Take a preventive/proactive management perspective",
                "Analyze through a team dynamics and collaboration lens",
                "Approach from a sustainable engineering practices angle",
                "Frame as a strategic workforce health assessment"
            ]
            
            selected_opening = random.choice(opening_styles)
            selected_perspective = random.choice(analysis_perspectives)
            
            prompt = f"""
You are an expert burnout analyst reviewing a software team's health data. Generate a detailed, insightful narrative analysis that is COMPLETELY UNIQUE to this team's specific situation. Every analysis must be different - no templates or boilerplate.

**VARIATION INSTRUCTIONS FOR THIS ANALYSIS:**
- Opening approach: {selected_opening}
- Analytical perspective: {selected_perspective}
- Avoid phrases like "intriguing paradox" or other cliche openings
- Write each sentence with fresh language - no recycled phrases from previous analyses

**Analysis Timestamp:** {datetime.utcnow().isoformat()}

**Team Data:**
- Team Size: {team_data['team_size']} members  
- Active Incident Responders: {team_data['active_responders']} ({team_data['responder_percentage']:.1f}%)
- Average Burnout Score: {team_data['avg_burnout_score']:.1f} ({team_data['burnout_scale']})
- Scoring Method: {team_data['scoring_explanation']}
- Data Sources: {', '.join(available_integrations)}

**Detailed Metrics:**
{team_data['detailed_metrics']}

**Individual Patterns:**
{team_data['individual_patterns']}

**Communication & Activity Patterns:**
{team_data['activity_patterns']}

**Additional Context:**
- Analysis Period: Last 30 days
- High Risk Members: {team_data['high_risk_count']} (using {team_data['risk_criteria']})
- Total Incidents: {sum(m.get('incident_count', 0) for m in team_members)}

**CRITICAL: Understand the Scoring System:**
{team_data['scoring_explanation']}

**CRITICAL REQUIREMENTS - Generate a UNIQUE analysis:**

**Summary Section (2-3 paragraphs):**
- Start with a unique opening that captures THIS team's specific situation
- Tell their story through the data - what makes this team different?
- Include ALL key metrics but weave them into a narrative, not a list
- Assess health with specific reasoning unique to their data patterns
- Use metaphors or analogies that fit their specific context

**Key Observations Section (3-4 detailed observations):**
- Each observation must be data-driven and specific to this team
- Look for non-obvious patterns or correlations in their data
- Explain the "why" - what might be causing these specific patterns?
- Connect different data sources to reveal unique insights
- Include industry context where it adds value
- Suggest root causes based on the specific data combinations

**MANDATORY - Make it unique by:**
- Varying sentence structure and writing style
- Using different analytical frameworks each time
- Finding surprising connections in the data
- Referencing specific numbers in creative ways
- Acknowledging data limitations honestly
- Never using phrases that could apply to any team
- Making each insight actionable and specific

**Remember:** This team is unique. Their data tells a specific story. Your analysis should feel custom-written for their exact situation, with insights they couldn't get from a generic report.
"""

            # Call LLM for narrative generation
            try:
                # Use the API key and provider from the service (system or user)
                if self.provider == "anthropic":
                    narrative = self._call_anthropic_for_narrative(prompt, self.api_key)
                elif self.provider == "openai":
                    narrative = self._call_openai_for_narrative(prompt, self.api_key)
                else:
                    self.logger.warning(f"Unsupported LLM provider: {self.provider}")
                    return self._generate_fallback_detailed_narrative(team_members, available_integrations)
                
                return narrative
                
            except Exception as e:
                self.logger.error(f"LLM narrative generation failed: {e}")
                return self._generate_fallback_detailed_narrative(team_members, available_integrations)
                
        except Exception as e:
            self.logger.error(f"Error in LLM team narrative generation: {e}")
            return self._generate_fallback_detailed_narrative(team_members, available_integrations)

    def _prepare_comprehensive_team_data(self, team_members: List[Dict[str, Any]], available_integrations: List[str]) -> Dict[str, Any]:
        """Prepare detailed team data for LLM analysis."""
        active_responders = [m for m in team_members if m.get("incident_count", 0) > 0]
        
        # Calculate comprehensive metrics using OCB when available
        ocb_scores = [m.get("ocb_score") for m in team_members if m.get("ocb_score") is not None]
        legacy_scores = [m.get("burnout_score", 0) for m in team_members if m.get("ocb_score") is None]
        
        if ocb_scores:
            avg_burnout = sum(ocb_scores) / len(ocb_scores)
            using_ocb = True
            burnout_scale = "OCB (0-100)"
        else:
            avg_burnout = sum(legacy_scores) / len(legacy_scores) if legacy_scores else 0
            using_ocb = False  
            burnout_scale = "Legacy (0-10)"
            
        total_incidents = sum(m.get("incident_count", 0) for m in team_members)
        
        # Risk distribution
        risk_levels = {"low": 0, "medium": 0, "high": 0, "critical": 0}
        for member in team_members:
            risk_level = member.get("risk_level", "low").lower()
            if risk_level in risk_levels:
                risk_levels[risk_level] += 1
        
        # Detailed metrics breakdown
        metrics_breakdown = []
        github_stats = {}
        slack_stats = {}
        
        if "github" in available_integrations:
            total_commits = sum(m.get("github_activity", {}).get("commits_count", 0) for m in team_members)
            after_hours_commits = sum(m.get("github_activity", {}).get("after_hours_commits", 0) for m in team_members)
            weekend_commits = sum(m.get("github_activity", {}).get("weekend_commits", 0) for m in team_members)
            total_prs = sum(m.get("github_activity", {}).get("pull_requests_count", 0) for m in team_members)
            total_reviews = sum(m.get("github_activity", {}).get("reviews_count", 0) for m in team_members)
            
            after_hours_pct = (after_hours_commits / total_commits * 100) if total_commits > 0 else 0
            weekend_pct = (weekend_commits / total_commits * 100) if total_commits > 0 else 0
            
            metrics_breakdown.append(f"GitHub: {total_commits} commits ({after_hours_pct:.1f}% after hours, {weekend_pct:.1f}% weekends), {total_prs} PRs, {total_reviews} reviews")
            
            github_stats = {
                "total_commits": total_commits,
                "after_hours_percentage": after_hours_pct,
                "weekend_percentage": weekend_pct,
                "total_prs": total_prs,
                "total_reviews": total_reviews
            }
        
        if "slack" in available_integrations:
            total_messages = sum(m.get("slack_activity", {}).get("messages_sent", 0) for m in team_members)
            after_hours_messages = sum(m.get("slack_activity", {}).get("after_hours_messages", 0) for m in team_members)
            after_hours_msg_pct = (after_hours_messages / total_messages * 100) if total_messages > 0 else 0
            avg_sentiment = sum(m.get("slack_activity", {}).get("sentiment_score", 0) for m in team_members) / len(team_members) if team_members else 0
            
            sentiment_label = "negative" if avg_sentiment < -0.1 else "neutral" if avg_sentiment < 0.1 else "positive"
            metrics_breakdown.append(f"Slack: {total_messages} messages ({after_hours_msg_pct:.1f}% after hours), {sentiment_label} sentiment ({avg_sentiment:.2f})")
            
            slack_stats = {
                "total_messages": total_messages,
                "after_hours_percentage": after_hours_msg_pct,
                "avg_sentiment": avg_sentiment,
                "sentiment_label": sentiment_label
            }
        
        # Individual patterns with more detail - use appropriate risk criteria
        if using_ocb:
            high_risk_members = sorted(
                [m for m in team_members if m.get("ocb_score", 0) >= 75],
                key=lambda x: x.get("ocb_score", 0),
                reverse=True
            )
            risk_criteria = "OCB score ≥75/100 (severe burnout)"
        else:
            high_risk_members = sorted(
                [m for m in team_members if m.get("burnout_score", 0) >= 7],
                key=lambda x: x.get("burnout_score", 0),
                reverse=True
            )
            risk_criteria = "Legacy score ≥7/10 (high burnout)"
        
        individual_insights = []
        for member in high_risk_members[:5]:  # Top 5 highest risk
            name = member.get("user_name", "Anonymous")
            incidents = member.get("incident_count", 0)
            risk_level = member.get("risk_level", "unknown")
            
            # Use appropriate scoring method
            if using_ocb:
                score = member.get("ocb_score", 0)
                score_display = f"{score:.1f}/100 OCB"
            else:
                score = member.get("burnout_score", 0)
                score_display = f"{score:.1f}/10 legacy"
            
            # Add more context about the member
            github_commits = member.get("github_activity", {}).get("commits_count", 0)
            after_hours_pct = member.get("after_hours_percentage", 0)
            
            insight = f"{name}: {score_display} burnout ({risk_level} risk), {incidents} incidents"
            if github_commits > 0:
                insight += f", {github_commits} commits ({after_hours_pct:.1f}% after hours)"
            
            individual_insights.append(insight)
        
        # Activity patterns with more detail
        activity_insights = []
        
        # Weekend workers
        weekend_workers = [m for m in team_members if m.get("github_activity", {}).get("weekend_commits", 0) > 0]
        if weekend_workers:
            weekend_worker_names = [m.get("user_name", "Unknown") for m in weekend_workers[:3]]
            activity_insights.append(f"{len(weekend_workers)} members working weekends (including {', '.join(weekend_worker_names)})")
        
        # Late responders
        late_responders = [m for m in team_members if m.get("metrics", {}).get("avg_response_time_minutes", 0) > 120]
        if late_responders:
            activity_insights.append(f"{len(late_responders)} members with slow incident response (>2h avg)")
        
        # Incident concentration
        if active_responders and total_incidents > 0:
            top_responder = max(active_responders, key=lambda x: x.get("incident_count", 0))
            top_responder_load = (top_responder.get("incident_count", 0) / total_incidents * 100)
            if top_responder_load > 30:
                activity_insights.append(f"{top_responder.get('user_name', 'Top responder')} handles {top_responder_load:.0f}% of all incidents")
        
        # Workload imbalance
        if team_members:
            zero_incident_members = len([m for m in team_members if m.get("incident_count", 0) == 0])
            if zero_incident_members > len(team_members) * 0.5:
                activity_insights.append(f"{zero_incident_members}/{len(team_members)} members have zero incidents")
        
        return {
            "team_size": len(team_members),
            "active_responders": len(active_responders),
            "responder_percentage": len(active_responders) / len(team_members) * 100 if team_members else 0,
            "avg_burnout_score": avg_burnout,
            "burnout_scale": burnout_scale,
            "scoring_explanation": self._get_scoring_explanation(using_ocb),
            "high_risk_count": len(high_risk_members),
            "risk_criteria": risk_criteria,
            "total_incidents": total_incidents,
            "risk_distribution": f"Critical: {risk_levels['critical']}, High: {risk_levels['high']}, Medium: {risk_levels['medium']}, Low: {risk_levels['low']}",
            "detailed_metrics": "; ".join(metrics_breakdown) if metrics_breakdown else "Limited metrics available",
            "individual_patterns": "; ".join(individual_insights) if individual_insights else "No high-risk members identified",
            "activity_patterns": "; ".join(activity_insights) if activity_insights else "Standard activity patterns",
            "github_stats": github_stats,
            "slack_stats": slack_stats
        }
    
    def _get_scoring_explanation(self, using_ocb: bool) -> str:
        """Get explanation of the scoring methodology for the LLM."""
        if using_ocb:
            return """This team uses the On-Call Burnout (OCB) methodology:
- Scale: 0-100 where HIGHER scores = MORE burnout (opposite of health scores)
- 0-24: Low/minimal burnout (healthy)
- 25-49: Mild burnout symptoms  
- 50-74: Moderate/significant burnout
- 75-100: High/severe burnout (critical intervention needed)
- OCB is scientifically validated and measures Personal + Work-Related burnout dimensions"""
        else:
            return """This team uses legacy burnout scoring:
- Scale: 0-10 where higher scores = more burnout
- Converted to 0-100 scale for display (multiply by 10)
- Less precise than OCB methodology"""

    def _call_anthropic_for_narrative(self, prompt: str, api_key: str) -> str:
        """Call Anthropic API for narrative generation."""
        import requests
        
        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }
        
        data = {
            "model": "claude-sonnet-4-5",  # Latest Claude Sonnet model
            "max_tokens": 1500,
            "temperature": 0.8,  # Add higher temperature for creative, varied responses
            "messages": [{"role": "user", "content": prompt}]
        }
        
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=data,
            timeout=120  # Increased timeout for Claude 4.5
        )
        
        if response.status_code == 200:
            return response.json()["content"][0]["text"]
        else:
            raise Exception(f"Anthropic API error: {response.status_code} - {response.text}")

    def _call_openai_for_narrative(self, prompt: str, api_key: str) -> str:
        """Call OpenAI API for narrative generation."""
        import requests
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
        data = {
            "model": "gpt-4",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1500,
            "temperature": 0.7
        }
        
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=data,
            timeout=30
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        else:
            raise Exception(f"OpenAI API error: {response.status_code} - {response.text}")

    def _generate_fallback_detailed_narrative(self, team_members: List[Dict[str, Any]], available_integrations: List[str]) -> str:
        """Return empty string when LLM is not available - no template fallback."""
        return ""


# Cache for AI analyzer instances (keyed by API key hash for security)
_ai_analyzer_cache = {}

def get_ai_burnout_analyzer(api_key: Optional[str] = None, provider: Optional[str] = None) -> AIBurnoutAnalyzerService:
    """
    Get AI burnout analyzer instance.

    Respects user's token preference: uses custom token if provided, otherwise system token.

    Args:
        api_key: Optional custom API key (if user has configured one)
        provider: LLM provider ('anthropic' or 'openai')

    Returns:
        AIBurnoutAnalyzerService instance
    """
    import os
    import hashlib

    # Determine which token to use
    if api_key and provider:
        # User has custom token - use it
        effective_api_key = api_key
        effective_provider = provider
    else:
        # No custom token - use system token from Railway environment
        effective_api_key = os.getenv('ANTHROPIC_API_KEY')
        effective_provider = 'anthropic'

    # Create cache key based on the actual token being used
    cache_key = hashlib.sha256(f"{effective_api_key or ''}:{effective_provider}".encode()).hexdigest()[:16]

    if cache_key not in _ai_analyzer_cache:
        _ai_analyzer_cache[cache_key] = AIBurnoutAnalyzerService(api_key=effective_api_key, provider=effective_provider)

    return _ai_analyzer_cache[cache_key]