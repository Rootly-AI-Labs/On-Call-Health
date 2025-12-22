"""
Service for sending Slack DMs with interactive survey buttons.
"""
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)


class SlackDMSender:
    """
    Sends direct messages to Slack users with interactive survey buttons.
    """

    async def send_survey_dm(
        self,
        slack_token: str,
        slack_user_id: str,
        user_id: int,
        organization_id: int,
        message: Optional[str] = None
    ):
        """
        Send a DM to a user with a button to open the burnout survey.

        Args:
            slack_token: Decrypted Slack bot token (ready to use)
            slack_user_id: Slack user ID (e.g., U01234567)
            user_id: Internal user ID
            organization_id: Organization ID
            message: Custom message (uses default if None)
        """
        try:
            # Token is already decrypted by SlackTokenService
            decrypted_token = slack_token

            # Default message if none provided
            if not message:
                message = (
                    "Hi there!\n\n"
                    "Quick check-in: How are you feeling today?\n\n"
                    "Your feedback helps us support team well-being and workload balance."
                )

            # Create message with button
            blocks = [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": message
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Take Check-in (30 sec)"
                            },
                            "style": "primary",
                            "action_id": "open_burnout_survey",
                            "value": f"{user_id}|{organization_id}"
                        }
                    ]
                }
            ]

            # Open DM conversation
            async with httpx.AsyncClient() as client:
                # Step 1: Open conversation
                conv_response = await client.post(
                    "https://slack.com/api/conversations.open",
                    headers={"Authorization": f"Bearer {decrypted_token}"},
                    json={"users": slack_user_id}
                )
                conv_data = conv_response.json()

                if not conv_data.get("ok"):
                    raise Exception(f"Failed to open conversation: {conv_data.get('error')}")

                channel_id = conv_data["channel"]["id"]

                # Step 2: Send message
                msg_response = await client.post(
                    "https://slack.com/api/chat.postMessage",
                    headers={"Authorization": f"Bearer {decrypted_token}"},
                    json={
                        "channel": channel_id,
                        "blocks": blocks,
                        "text": "Daily burnout check-in"  # Fallback text
                    }
                )
                msg_data = msg_response.json()

                logger.info(f"Slack API response: {msg_data}")

                if not msg_data.get("ok"):
                    logger.error(f"Slack API error: {msg_data.get('error')} - Full response: {msg_data}")
                    raise Exception(f"Failed to send message: {msg_data.get('error')}")

                logger.info(f"Survey DM sent successfully to {slack_user_id} - Message TS: {msg_data.get('ts')}")
                return True

        except Exception as e:
            logger.error(f"Error sending survey DM to {slack_user_id}: {str(e)}")
            raise
