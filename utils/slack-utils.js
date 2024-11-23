const {WebClient} = require("@slack/web-api");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const slackClient = new WebClient(SLACK_BOT_TOKEN);

const botResponse = async (message, channel) => {
  return await slackClient.chat.postMessage({
    channel: channel,
    blocks: [{type: "section", text: {type: "mrkdwn", text: message}}],
    text: message,
  })
}

const botResponseBlocks = async (blocks, text, channel) => {
  return await slackClient.chat.postMessage({
    channel: channel,
    blocks: blocks,
    text: text,
  })
}

async function getBotUserId() {
  try {
    const botInfo = await slackClient.auth.test();
    return botInfo.user_id;
  } catch (error) {
    return null;
  }
}

// Respond to a Slash Command with a message
async function respondToSlashCommand(responseUrl, message) {
  try {
    await axios.post(responseUrl, {
      response_type: "ephemeral",
      blocks: [{type: "section", text: {type: "mrkdwn", text: message}}],
      text: message,
    });
  } catch (error) {
    console.error("Error responding to Slash Command:", error);
  }
}

// Respond to a Slash Command with a message
async function respondToSlashCommandBlocks(responseUrl, blocks) {
  try {
    await axios.post(responseUrl, {
      response_type: "ephemeral",
      blocks: blocks,
    });
  } catch (error) {
    console.error("Error responding to Slash Command:", error);
  }
}

const replyToThread = async ({message, blocks = null, channel, thread_ts, ...rest}) => {
  return await slackClient.chat.postMessage({
    channel: channel,
    thread_ts: thread_ts,
    blocks: blocks,
    text: message,
    ...rest
  })
}

async function deleteBotHistoryWithUser(user_id) {
  try {
    // Open a DM channel with the user to get the channel ID
    const dmChannelResponse = await slackClient.conversations.open({ users: user_id });
    if (!dmChannelResponse.ok) {
      console.error("Failed to open DM channel:", dmChannelResponse.error);
      return;
    }
    const channel_id = dmChannelResponse.channel.id;

    // Retrieve the message history for the DM channel
    const messagesResponse = await slackClient.conversations.history({ channel: channel_id });
    if (!messagesResponse.ok) {
      console.error("Failed to fetch conversation history:", messagesResponse.error);
      return;
    }

    // Iterate through each message in the DM channel
    for (const message of messagesResponse.messages) {
      try {
        // Check if the message has thread replies
        if (message.thread_ts) {
          // Fetch all replies in the thread
          const threadResponse = await slackClient.conversations.replies({
            channel: channel_id,
            ts: message.thread_ts
          });

          if (threadResponse.ok) {
            // Delete all thread replies
            for (const threadMessage of threadResponse.messages) {
              try {
                await slackClient.chat.delete({
                  channel: channel_id,
                  ts: threadMessage.ts
                });
              } catch (error) {
                console.error("Error deleting thread message:", error.message);
              }
            }
          } else {
            console.error("Failed to fetch thread replies:", threadResponse.error);
          }
        }

        // Delete the main message
        await slackClient.chat.delete({
          channel: channel_id,
          ts: message.ts
        });
      } catch (error) {
        console.error("Error deleting message:", error.message);
      }
    }

    console.log(`Deleted all messages, including threads, in DM channel ${channel_id} with user ${user_id}.`);
  } catch (error) {
    console.error("Error in handleDeleteHistoryCommand:", error.message);
  }
}


module.exports = {botResponse, getBotUserId, slackClient, respondToSlashCommand, respondToSlashCommandBlocks, botResponseBlocks, replyToThread, deleteBotHistoryWithUser}
