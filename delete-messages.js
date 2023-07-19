const { WebClient } = require('@slack/web-api');
const dotenv = require("dotenv")

dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;

// Create a new instance of WebClient with your Slack API token
const client = new WebClient(SLACK_TOKEN);

(async () => {
  try {
    // Call conversations.history to get all messages in the channel
    const response = await client.conversations.history({
      channel: SLACK_CHANNEL_ID
    });

    if (response.ok) {
      const messages = response.messages;

      // Delete each message in the channel
      for (const message of messages) {
        try {
          await client.chat.delete({
            channel: SLACK_CHANNEL_ID,
            ts: message.ts
          });
        } catch (e) {
          console.log(`Failed to delete message:`, message)
        }
      }

      console.log('All messages deleted successfully.');
    } else {
      console.error('There was an error retrieving channel history:', response.error);
    }
  } catch (error) {
    console.error('Error occurred:', error);
  }
})();
