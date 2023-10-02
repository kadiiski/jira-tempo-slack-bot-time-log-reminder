const axios = require('axios');
const {WebClient} = require("@slack/web-api");
const dotenv = require("dotenv");
const {getStartDate, getEndDate, getBusinessDays, getPublicHolidays} = require('./date')
const {debug} = require("./debug");

dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

// JIRA credentials.
const jiraEmail = process.env.JIRA_EMAIL
const jiraApiToken = process.env.JIRA_API_TOKEN
const jiraBaseUrl = process.env.JIRA_BASE_URL

// TEMPO credentials.
const tempoApiToken = process.env.TEMPO_API_TOKEN;
const tempoBaseUrl = process.env.TEMPO_BASE_URL;

// SLACK credentials.
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;

const MINIMUM_HOURS = process.env.MINIMUM_HOURS;

// Initialize the Slack WebClient
const slackClient = new WebClient(SLACK_TOKEN);

const getJiraUserByEmail = (email) => {
  let config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `${jiraBaseUrl}/rest/api/3/user/search?query=${email}`,
    headers: {
      'Authorization': `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
  };

  return axios.request(config)
    .then(response => response?.data?.[0] || null)
    .catch(error => console.error('ERROR: getJiraUserByEmail', email));
}

const getTempoWorkLogsByAccountId = (accountId) => {
  let config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `${tempoBaseUrl}/4/worklogs/user/${accountId}?from=${getStartDate()}&to=${getEndDate()}&limit=5000`,
    headers: {
      'Authorization': `Bearer ${tempoApiToken}`
    }
  };

  return axios.request(config)
    .then(response => response.data)
    .catch(error => console.error('ERROR: getTempoWorkLogsByAccountId', error?.response?.data));
}

const getNotLoggedDaysForUser = (email) => {
  return getJiraUserByEmail(email).then(user => {
    if (!user) {
      return Promise.resolve(false)
    }

    const {accountId, emailAddress, displayName, avatarUrls} = user
    const userData = {accountId, emailAddress, displayName, avatar: avatarUrls['48x48']}

    return getTempoWorkLogsByAccountId(accountId).then(async workLogs => {
      let publicHolidays = await getPublicHolidays();
      let startDate = new Date(getStartDate());
      let endDate = new Date(getEndDate());
      workLogs = workLogs?.results?.filter(workLog => {
        const workLogDate = new Date(workLog?.startDate);
        // Return WorkLogs between start and end dates.
        return startDate <= workLogDate && workLogDate <= endDate;
      })
        .map(workLog => {
          const {timeSpentSeconds, startDate, description} = workLog
          return {timeSpentSeconds, timeSpentInHours: timeSpentSeconds/3600, startDate, description}
        })
        .sort((a,b) => new Date(a.startDate) - new Date(b.startDate));

      const hoursPerDay = {}
      workLogs.map(workLog => {
        hoursPerDay[workLog.startDate] = (hoursPerDay?.[workLog.startDate] || 0) + workLog.timeSpentInHours
      })

      // Will contain valid days in which the user has logged the proper amount of hours.
      const validWorkLogDays = Object.keys(hoursPerDay).filter(date => {
        return hoursPerDay[date] >= MINIMUM_HOURS
      })

      // Here we have all valid working days for the period provided (firstDay - now)
      const notLoggedDays = getBusinessDays({publicHolidays}).filter(day => !validWorkLogDays.includes(day))

      return {notLoggedDays, userData}
    }).catch(error => {
      console.error('ERROR: getNotLoggedDaysForUser > getJiraUserByEmail > getTempoWorkLogsByAccountId', error?.response?.data)
    })
  }).catch(error => {
      console.error('ERROR: getNotLoggedDaysForUser > getJiraUserByEmail', error?.response?.data)
  })
}

async function getSlackUserIdByEmail(email) {
  try {
    // Use the users.lookupByEmail method to get the user information
    const response = await slackClient.users.lookupByEmail({ email });
    // Extract the USER_ID from the response
    return response?.user?.id;
  } catch (error) {
    console.error('ERROR: getSlackUserIdByEmail', error);
    return null;
  }
}

const sendSlackMessage = async (id, message) => {
  // Don't send the real message.
  if(process.env.TEST_MODE === 'true' && process.env.ADMIN_EMAIL) {
    // Set the ID to the admin ID.
    id = await getSlackUserIdByEmail("ivaiylo.kadiyski@ffw.com")
  } else if (process.env.TEST_MODE === 'true') {
    // just stop it
    return
  }

  // Send a direct message to the user using the chat.postMessage method
  slackClient.chat.postMessage({
    channel: id,
    text: message
  })
    .then(() => console.log('Notification sent successfully!'))
    .catch(error => console.error('ERROR: sendSlackMessage', error));
}

const addBotToChannel = (channelId) => {
  return slackClient.conversations.join({
    channel: channelId,
  })
    .then(() => console.log('Bot added to the channel successfully!'))
    .catch(error => console.error('ERROR: addBotToChannel', error))
}

const inviteToChannel = (userId, channelId) => {
  // Don't send the real message.
  if (process.env.TEST_MODE === 'true') {
    return Promise.resolve(true)
  }

  // First make sure the bot is in the channel!
  return addBotToChannel(channelId).then(() => {
    // Send a direct message to the user using the chat.postMessage method
    return slackClient.conversations.members({
      channel: channelId,
    })
      .then(response => {
        const {members} = response
        if (members.includes(userId)) {
          return true;
        }

        return slackClient.conversations.invite({
          channel: channelId,
          users: userId,
        }).then(() => true)
          .catch(error => console.log('slackClient.conversations.invite', error));
      })
      .catch(error => console.error('addBotToChannel', error));
  })
}

module.exports = {getNotLoggedDaysForUser, getSlackUserIdByEmail, sendSlackMessage, inviteToChannel}
