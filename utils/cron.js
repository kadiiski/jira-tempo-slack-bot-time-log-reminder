const {getNotLoggedDaysForUser, getSlackUserIdByEmail, sendSlackMessage, inviteToChannel} = require("./jira-utils");
const dotenv = require("dotenv");
const EMAILS_LIST = (process.env.EMAIL_LIST || "").split(',').map(s => s.trim())
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID
const ENABLE_WINNERS = process.env.ENABLE_WINNERS === 'true'
const WINNERS_MIN_DAYS = process.env.WINNERS_MIN_DAYS

dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

// Function to execute every day
async function executeCron() {
  if(process.env.DEBUG === 'true') console.log('Executing cron for emails:', EMAILS_LIST)

  const winners = []
  for (const email of EMAILS_LIST) {
    if(process.env.DEBUG === 'true') console.log(`Handling user: ${email}`)

    const {notLoggedDays, userData} = await getNotLoggedDaysForUser(email)
    if(process.env.DEBUG === 'true') console.log(`Not logged days: ${notLoggedDays?.length || 0}`)

    if (!notLoggedDays?.length) {
      continue
    }
    if (!userData) {
      if(process.env.DEBUG === 'true') console.log(`ERROR: can get getNotLoggedDaysForUser: ${email}`)
      continue
    }

    const slackUserId = await getSlackUserIdByEmail(email)
    const {displayName} = userData
    const directMessage = `Hello ${displayName}, please log your time for the following days: ${notLoggedDays.map(item => `\`${item}\``).join(', ')}`

    if(process.env.DEBUG === 'true') console.log(`Sending message: ${directMessage} TO: ${email}`)

    if (process.env.TEST_MODE !== 'true') {
      await sendSlackMessage(slackUserId, directMessage)
    }

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
    if(process.env.DEBUG === 'true') console.log('No winners!')
    return
  }

  // Invite winners to channel.
  for (const winner of winners) {
    if(process.env.DEBUG === 'true') console.debug(`Inviting: ${winner.email} to channel.`)

    if (process.env.TEST_MODE !== 'true') {
      await inviteToChannel(winner.slackUserId, SLACK_CHANNEL_ID)
    }
  }

  // Make an object like {1: [], 2:[], ...} with the places.
  const winnerGroups = Object.fromEntries(winners
    .map(winner => [winner.notLoggedDays, []]))

  // Build winners groups.
  winners.map((item, index) => winnerGroups?.[item?.notLoggedDays].push(item.slackUserId))

  const channelMessage = Object.keys(winnerGroups).sort((a,b) => b - a).map((count, index) => {
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
  if(process.env.DEBUG === 'true') console.debug(`Sending channel message:`, channelMessage)

  if (process.env.TEST_MODE !== 'true') {
    await sendSlackMessage(SLACK_CHANNEL_ID, channelMessage)
  }
}

module.exports = executeCron
