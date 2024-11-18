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

module.exports = {botResponse, getBotUserId, slackClient, respondToSlashCommand}
