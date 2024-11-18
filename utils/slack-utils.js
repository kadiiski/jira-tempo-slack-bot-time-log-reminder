const {WebClient} = require("@slack/web-api");
const dotenv = require("dotenv");

dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const slackClient = new WebClient(SLACK_BOT_TOKEN);

const botResponse = async (message, channel) => {
  return await slackClient.chat.postMessage({
    channel: channel,
    blocks: [{type: "section", text: {type: "mrkdwn", text: message}}]
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

module.exports = {botResponse, getBotUserId, slackClient}
