const {getNotLoggedDaysForUser, getSlackUserIdByEmail, sendSlackMessage, inviteToChannel} = require("./jira-utils");
const {getBusinessDays, getStartDate, getEndDate, getPublicHolidays} = require('./date')
const dotenv = require("dotenv");
const {debug} = require("./debug");
const axios = require("axios");
const EMAILS_LIST = (process.env.EMAIL_LIST || "").split(',').map(s => s.trim())
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID
const ENABLE_WINNERS = process.env.ENABLE_WINNERS === 'true'
const WINNERS_MIN_DAYS = process.env.WINNERS_MIN_DAYS

dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

// Function to execute every day
async function executeCron() {
  let publicHolidays = await getPublicHolidays();
  debug('Executing cron for emails:', EMAILS_LIST)
  debug('Business days:', getBusinessDays({publicHolidays}))
  debug('Public holidays:', publicHolidays)
  debug('JIRA logs START:', getStartDate())
  debug('JIRA logs END:', getEndDate())

  const winners = []
  for (const email of EMAILS_LIST) {
    debug(`Handling user: ${email}`)

    const {notLoggedDays, userData} = await getNotLoggedDaysForUser(email)
    debug(`Not logged days: ${notLoggedDays?.length || 0}`)

    if (!notLoggedDays?.length) {
      continue
    }
    if (!userData) {
      debug(`ERROR: can get getNotLoggedDaysForUser: ${email}`)
      continue
    }

    // TODO: remove the temp fix for the email.
    const slackUserId = await getSlackUserIdByEmail(email.replace('ffw', 'jakala'))
    const {displayName} = userData
    const directMessage = `Hello ${displayName}, please log your time for the following days: ${notLoggedDays.map(item => `\`${item}\``).join(', ')}`

    debug(`Sending message: ${directMessage} TO: ${email}`)

    await sendSlackMessage(slackUserId, directMessage)

    if(ENABLE_WINNERS && notLoggedDays?.length >= WINNERS_MIN_DAYS) {
      winners.push({
        email,
        slackUserId,
        userData,
        notLoggedDays: notLoggedDays.length
      })
    }
  }

  // Finish if no winners.
  if (!winners.length) {
    debug('No winners!')
    return
  }

  // Invite winners to channel.
  for (const winner of winners) {
    debug(`Inviting: ${winner.email} to channel.`)
    await inviteToChannel(winner.slackUserId, SLACK_CHANNEL_ID)
  }

  // Make an object like {1: [], 2:[], ...} with the places.
  const winnerGroups = Object.fromEntries(winners.map(winner => [winner.notLoggedDays, []]))

  // Build winners groups.
  winners.map((item, index) => winnerGroups?.[item?.notLoggedDays].push(`${item.slackUserId} (${item.email})`))
  // winners.map((item, index) => winnerGroups?.[item?.notLoggedDays].push(item.slackUserId))

  const winnersMessage = Object.keys(winnerGroups).sort((a,b) => b - a).map((count, index) => {
    const people = winnerGroups?.[count].map(slackId => `<@${slackId}>`)
    // Build the message row.
    const place = index + 1;
    let icon = ':clap:'
    switch (place) {
      case 1:
        icon = ':first_place_medal:'
        break;
      case 2:
        icon = ':second_place_medal:'
        break;
      case 3:
        icon = ':third_place_medal:'
        break;
    }
    return `${place} PLACE (${count} not logged days) ${icon}\n ${people.join(', ')}`;
  }).join('\n\n')

  // Send the channel message.
  debug(`Sending channel message:`, winnersMessage)

  const channelMessage = await getTimeLogsMessage(winnersMessage);

  await sendSlackMessage(SLACK_CHANNEL_ID, channelMessage)
}

async function getTimeLogsMessage(message) {
  try {
    const gptPrompt = `I'll give you a message that we put out for everyone who hasn't logged in their hours in Jira.
      - We've made it as a fun reminder message, in the form of "winners" who haven't, to remind them. Make it fun and goofy!
      - The names of the people are slack user IDs, so don't change them.
      - The message must be properly formatted for slack.
      - Use properly :first_place_medal:, :second_place_medal:, :third_place_medal: emojis.
      - Use only slack emojis that you are sure exist.
      - Respect the gender of the names and write them in the proper language.
      - Remove the emails, they are just so you know the gender and name of the person.
      - You can also use the names of the people to make jokes or puns.
      - No need to follow the same format, just make it funny.
      Here is the message: 
      ${message}
      `;

    debug('GPT prompt:', gptPrompt);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-turbo',
        temperature: 1,
        messages: [
          { role: 'user', content: gptPrompt },
          { role: 'system', content: process.env.TIME_LOG_GPT_SYSTEM_INSTRUCTIONS },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extract the message content from the response
    const gptResponse = response.data.choices[0].message.content;
    debug('GPT response:', gptResponse);

    // Check if there is a message returned
    if (!gptResponse) {
      debug('No message returned.');
      return;
    }

    return gptResponse;
  } catch (error) {
    debug('Error making API request:', error);
  }
}

module.exports = executeCron
