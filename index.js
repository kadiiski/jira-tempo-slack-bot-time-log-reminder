const {getNotLoggedDaysForUser, getSlackUserIdByEmail, sendSlackMessage, inviteToChannel} = require('./utils/jira-utils')
const cron = require('node-cron');
const dotenv = require("dotenv")
const http = require('http');

dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

const EMAILS_LIST = (process.env.EMAIL_LIST || "").split(',').map(s => s.trim())
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID
const ENABLE_WINNERS = process.env.ENABLE_WINNERS === 'true'
const WINNERS_MIN_DAYS = process.env.WINNERS_MIN_DAYS

// Function to execute every day
async function executeCron() {
  if(process.env.DEBUG === 'true') console.log('Executing cron for emails:', EMAILS_LIST)

  const winners = []
  for (const email of EMAILS_LIST) {
    if(process.env.DEBUG === 'true') console.log(`Handling user: ${email}`)

    const {notLoggedDays, userData} = await getNotLoggedDaysForUser(email)
    const slackUserId = await getSlackUserIdByEmail(email)

    if(process.env.DEBUG === 'true') console.log(`Not logged days: ${notLoggedDays?.length || 0}`)

    if (!userData) {
      if(process.env.DEBUG === 'true') console.log(`ERROR: can get getNotLoggedDaysForUser: ${email}`)
      continue
    }

    if (!notLoggedDays?.length) {
      continue
    }

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

// if (process.env.DEBUG === 'true') {
//   executeCron().then(() => console.log('Success!'))
//   return;
// }

const currentTime = new Date().toLocaleString()
let cronStatus = 'online';
let lastRunTime = 'never';

// # ┌────────────── second (optional)
// # │ ┌──────────── minute
// # │ │ ┌────────── hour
// # │ │ │ ┌──────── day of month
// # │ │ │ │ ┌────── month
// # │ │ │ │ │ ┌──── day of week
// # │ │ │ │ │ │
// # │ │ │ │ │ │
// # * * * * * *
// Schedule the cron job to execute the function every day at a specific time (e.g., 9:00 AM)
const cronJob = cron.schedule('0 15 * * 1-5', () => {
  console.log('Starting cron...');
  try {
    executeCron().then(() => {
      console.log('Cron run success!')
    }).catch(error => {
      console.error('Cron job failed:', error);
      cronStatus = `failed <pre>${JSON.stringify(error)}</pre>`;
    });

    // Update the last run time
    lastRunTime = new Date().toLocaleString();
  } catch (error) {
    console.error('Cron job failed:', error);
    cronStatus = `failed <pre>${JSON.stringify(error)}</pre>`;
  }
});

cronJob.start()

// Create a basic HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/runcron') {
    // Manually trigger the cron job
    cronJob.now()
    console.log('CRON STARTED!')
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Cron job triggered manually');
  } else {
    // Return the index.html file
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<h1>Cron Job Status</h1>');
    res.write(`<p>Debug: ${process.env.DEBUG}</p>`);
    res.write(`<p>Current time: ${currentTime}</p>`);
    res.write(`<p>Runs: every day at 16:00</p>`);
    res.write(`<p>Status: ${cronStatus}</p>`);
    res.write(`<p>Last Run: ${lastRunTime}</p>`);
    res.end();
  }
});

// Start the server
server.listen(process.env.PORT || 3000, () => {
  console.log('Server started on port', process.env.PORT || 3000);
});
