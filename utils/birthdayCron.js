const {sendSlackMessage, getSlackUserIdByEmail} = require("./jira-utils");
const dotenv = require("dotenv");
const {debug} = require("./debug");
const fs = require('fs');
const axios = require('axios');

const BIRTHDAY_MSG_INSTRUCTIONS = process.env.BIRTHDAY_MSG_INSTRUCTIONS
const SLACK_CHANNEL_ID_BIRTHDAYS = process.env.SLACK_CHANNEL_ID_BIRTHDAYS

dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

// Function to execute every day
async function executeBirthdayCron() {
  debug('Executing birthday cron.')

  // Check if ../birthdays.json exists.
  if (!fs.existsSync('birthdays.json')) {
    debug('Birthdays file not found.')
    return
  }

  let channelMessage;

  try {
    channelMessage = JSON.parse(await getBirthdayMessage());
  } catch (error) {
    debug('Error getting birthday message:', error);
    return
  }

  // Check if there is a message returned.
  if (!channelMessage) {
    debug('No message returned.')
    return
  }

  debug('Birthday cron message:', channelMessage)

  if (channelMessage.emails) {
    // Replace the emails in message with slack user id.
    for (const email of channelMessage.emails) {
      const slackUserId= await getSlackUserIdByEmail(email.replace('ffw', 'jakala'));
      channelMessage.message = channelMessage.message.replace(email, `<@${slackUserId}>`);
    }
  }

  await sendSlackMessage(SLACK_CHANNEL_ID_BIRTHDAYS, channelMessage.message)
}

// Function to get the current date and time in a readable format
function getCurrentDateTime() {
  const now = new Date();
  return now.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
}

async function getBirthdayMessage() {
  try {
    const jsonFileContents = JSON.parse(fs.readFileSync('birthdays.json', 'utf8'));

    const celebrationMessage = generateCelebrationMessage(jsonFileContents);
    debug('Filtered dates:', celebrationMessage);

    const birthdayPrompt = `I will provide a celebration message containing peoples details such as birthdays, anniversaries, hiring dates and others.
      Your task is to:
      - Current date and time is ${getCurrentDateTime()}.
      - Replace peoples names with their emails and include the dates and days of the week for each person mentioned.
      - Format the message well so that it is clearly visible who, when and what is celebrating.
      - Additional instructions: ${BIRTHDAY_MSG_INSTRUCTIONS}
      - This message will be directly sent to the team. So make it final - no placeholders.
      Here is the message: ${JSON.stringify(celebrationMessage)}
      `;

    const noBirthdaysPrompt = `We don't have any birthdays to celebrate this week. 
          - Make a nice message to the team to keep the spirits high!
          - Current date and time is ${getCurrentDateTime()}.
          - Do not return emails in the response.
          - This message will be directly sent to the team. So make it final - no placeholders.
          - Additional instructions: ${BIRTHDAY_MSG_INSTRUCTIONS}
          `;

    const gptPrompt = celebrationMessage ? birthdayPrompt : noBirthdaysPrompt;

    debug('GPT prompt:', gptPrompt);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-turbo',
        temperature: 0.7,
        messages: [
          { role: 'user', content: gptPrompt },
          { role: 'system', content: `Respond ONLY in strict valid JSON format { "message": "...", "emails": [...] }.` },
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

// Helper function to parse dates, replacing the year with the current year
function parseDateWithCurrentYear(dateStr) {
  const currentYear = new Date().getFullYear();
  const parts = dateStr.split("-");

  if (parts.length === 2) {
    return new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  } else if (parts.length === 3) {
    return new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }

  return null;
}

function getStartOfWeek() {
  const currentDate = new Date();
  const currentDayOfWeek = currentDate.getDay();
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDayOfWeek + (currentDayOfWeek === 0 ? -6 : 1));
  startOfWeek.setHours(0, 0, 0, 0);

  return startOfWeek;
}

function getEndOfWeek() {
  const startOfWeek = getStartOfWeek();
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return endOfWeek;
}

function isDateInCurrentWeek(date) {
  const startOfWeek = getStartOfWeek();
  const endOfWeek = getEndOfWeek();

  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);

  return normalizedDate >= startOfWeek && normalizedDate <= endOfWeek;
}

// Dynamic filter function to check if any date in an item falls within the current week
function filterItemsByCurrentWeek(items) {
  return items.filter(item => {
    return Object.entries(item).some(([key, value]) => {
      if (key === "email") return false; // Skip the email field

      // If the value is an array, check each element
      if (Array.isArray(value)) {
        return value.some(dateStr => {
          const date = parseDateWithCurrentYear(dateStr);
          return date && isDateInCurrentWeek(date);
        });
      }

      // If the value is a string in date format, check it directly
      if (typeof value === "string" && value.match(/^\d{1,2}-\d{1,2}(-\d{2,4})?$/)) {
        const date = parseDateWithCurrentYear(value);
        return date && isDateInCurrentWeek(date);
      }

      return false;
    });
  });
}

// Function to generate the output string based on dynamic keys
function generateCelebrationMessage(items) {
  const currentWeekItems = filterItemsByCurrentWeek(items);
  const celebrations = currentWeekItems.map(item => {
    const email = item.email;
    const events = [];

    Object.entries(item).forEach(([key, value]) => {
      if (key !== "email") {
        if (Array.isArray(value)) {
          // Handle array of dates
          value.forEach(dateStr => {
            const date = parseDateWithCurrentYear(dateStr);
            if (date && isDateInCurrentWeek(date)) {
              events.push(`${key} on ${date.toLocaleDateString("en-GB", { day: "2-digit", month: "long" })}`);
            }
          });
        } else if (typeof value === "string" && value.match(/^\d{1,2}-\d{1,2}(-\d{2,4})?$/)) {
          // Handle single date in string format
          const date = parseDateWithCurrentYear(value);
          if (date && isDateInCurrentWeek(date)) {
            events.push(`${key} on ${date.toLocaleDateString("en-GB", { day: "2-digit", month: "long" })}`);
          }
        }
      }
    });

    return `${email} - ${events.join(", ")}`;
  });

  return celebrations.join(", ");
}

module.exports = executeBirthdayCron
