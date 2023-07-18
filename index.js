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

  const winners = []
  const chatMessages = []
  EMAILS_LIST.map(email => {
    const promise = getNotLoggedDaysForUser(email).then(({notLoggedDays, userData}) => {
      if (!notLoggedDays?.length) {
        // All is logged!
        return;
      }

      return getSlackUserIdByEmail(email).then(userId => {
        const {displayName} = userData
        const directMessage = `Hello ${displayName}, please log your time for the following days: ${notLoggedDays.join(', ')}`

        if (process.env.DEBUG === 'true') {
          console.debug(`Sending message: ${directMessage} TO: ${email}`)
        } else {
          sendSlackMessage(userId, directMessage)
        }

        if (ENABLE_WINNERS && notLoggedDays?.length >= WINNERS_MIN_DAYS) {
          winners.push({
            email,
            slackUserId: userId,
            userData,
            notLoggedDays: notLoggedDays.length
          })
        }
      })
    })

    chatMessages.push(promise)
  })

  return Promise.all(chatMessages).then(() => {
    // Finish if no winners.
    if (!winners.length) {
      return true
    }

    const invites = []
    const channelMessage = winners.sort((a,b) => {
      return b.notLoggedDays - a.notLoggedDays
    }).map((item, index) => {
      // Push the invite.
      if (process.env.DEBUG === 'true') {
        console.debug(`Inviting: ${item.email} to channel.`)
      } else {
        invites.push(inviteToChannel(item.slackUserId, SLACK_CHANNEL_ID))
      }

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

      return `${place} place: <@${item.slackUserId}> with ${item?.notLoggedDays} days! ${icon}`;
    }).join('\n')

    if (process.env.DEBUG === 'true') {
      console.debug(`Processing invites...`)
    }
    // After they were all invited - send the message to the channel.
    return Promise.all(invites).then(() => {
      if (process.env.DEBUG === 'true') {
        console.debug(`Sending channel message:`, channelMessage)
      } else {
        sendSlackMessage(SLACK_CHANNEL_ID, channelMessage)
      }
    })
  })
}

if (process.env.DEBUG === 'true') {
  executeCron().then(() => console.log('Success!'))
  return;
}

const currentTime = new Date().toLocaleString()
let cronStatus = 'online';
let lastRunTime = 'never';
// Schedule the cron job to execute the function every day at a specific time (e.g., 9:00 AM)
cron.schedule('0 16 * * 1-5', () => {
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

// Create a basic HTTP server
const server = http.createServer((req, res) => {
  // Return the index.html file
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.write('<h1>Cron Job Status</h1>');
  res.write(`<p>Current time: ${currentTime}</p>`);
  res.write(`<p>Runs: every day at 16:00</p>`);
  res.write(`<p>Status: ${cronStatus}</p>`);
  res.write(`<p>Last Run: ${lastRunTime}</p>`);
  res.end();
});

// Start the server
server.listen(process.env.PORT || 3000, () => {
  console.log('Server started on port', process.env.PORT || 3000);
});
