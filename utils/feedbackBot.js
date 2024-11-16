const { WebClient } = require("@slack/web-api");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");
const {getSlackUserById, getSlackUserIdByEmail} = require("./jira-utils");
const axios = require("axios");

// Environment variables
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 characters for AES-256

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('Encryption key must be exactly 32 characters long.');
}

const slackClient = new WebClient(SLACK_BOT_TOKEN);

// Initialize SQLite database
const db = new sqlite3.Database("./feedback.db", (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
    db.run(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_slack_id TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        recipient_slack_id TEXT NOT NULL,
        feedback TEXT NOT NULL
      );
    `);
  }
});

// Encryption helper
const encrypt = (text) => {
  const cipher = crypto.createCipheriv("aes-256-ctr", ENCRYPTION_KEY, Buffer.alloc(16, 0));
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return encrypted.toString("hex");
};

// Decryption helper
const decrypt = (encryptedText) => {
  const decipher = crypto.createDecipheriv("aes-256-ctr", ENCRYPTION_KEY, Buffer.alloc(16, 0));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, "hex")), decipher.final()]);
  return decrypted.toString();
};

// Listen for messages from the bot direct messages
async function handleSlackEvents(event) {
  try {
    // Ignore non-message events or bot messages
    if (!event || event.subtype === "bot_message" || !event.text) {
      return;
    }

    const respond = async (message) => {
      return await slackClient.chat.postMessage({
        channel: event.channel,
        blocks: [{type: "section", text: {type: "mrkdwn", text: message}}]
      })
    }

    const text = event.text.trim();

    if (text === "help") {
      await respond(`
      Hello! 👋 I’m here to help you manage feedback. Here’s what I can do:
      1️⃣ **Submit Feedback**:
         - Share feedback about someone confidentially.
         - *Format*: \`@recipient your feedback\`
         - *Example*: \`@john_doe Great job on the project!\`
      
      2️⃣ **Retrieve Feedback (Managers Only)**:
         - View feedback submitted for one or more people.
         - *Format*: \`Pass: <password>, Feedback for @recipient1, @recipient2\`
         - *Example*: \`Pass: secret123, Feedback for @john_doe, @jane_smith\`
      
      3️⃣ **Help**:
         - Get this help message anytime.
         - *Command*: \`help\`
      
      💡 _Note: All messages sent to me are confidential and will be deleted after processing._
      
      If you have any questions, feel free to ask!
      `);
    } else if (text.startsWith("delete all messages")) {
      // Delete all bot messages from this channel.
      const messages = await slackClient.conversations.history({
        channel: event.channel
      });
      // Delete all.
      for (const message of messages.messages) {
        try {
          await slackClient.chat.delete({
            channel: event.channel,
            ts: message.ts
          });
        } catch (error) {
          console.error("Error deleting message:", error);
        }
      }
    } else if (text.startsWith("Pass:")) {
      // Route to handleManagerMessage for manager commands
      await handleManagerMessage(event);
    } else if (text.match(/^@(\w+)\s(.+)/)) {
      // Route to handleFeedbackMessage for feedback
      await handleFeedbackMessage(event);
    } else {
      // Respond with instructions for unrecognized message formats
      await slackClient.chat.postMessage({
        channel: event.channel,
        text: `Unrecognized message format. 
        If you want to share your feedback about someone, use the format: @recipient your feedback message.
        If you want to retrieve feedback for someone, use the format: Pass: <password>, Feedback for @person, @person...
        `
      });
    }
  } catch (error) {
    console.error("Error in handleSlackEvents:", error);
  }
}

async function handleFeedbackMessage(event) {
  try {
    const text = event.text.trim();
    const author = await getSlackUserById(event.user); // Sender's Slack ID

    const respond = async (message) => {
      return await slackClient.chat.postMessage({
        channel: event.channel,
        blocks: [{type: "section", text: {type: "mrkdwn", text: message}}]
      })
    }

    // Parse message for recipient and feedback
    const match = text.match(/^@(\w+)\s(.+)/); // Format: @recipient feedback message
    if (!match) {
      await respond("Please use the format: `@recipient your feedback`.")
      return;
    }

    const recipientId = match[1];
    const feedback = match[2];

    if (!feedback) {
      await respond("Please include feedback after the recipient's name.")
      return;
    }

    const recipient = await getSlackUserById(recipientId);
    if (!recipient) {
      await respond("Recipient not found. Please use the format: `@recipient your feedback`.")
      return;
    }

    // Encrypt and save to database
    const encryptedFeedback = encrypt(feedback);
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO feedback (date, author_email, author_slack_id, recipient_email, recipient_slack_id, feedback) VALUES (?, ?, ?, ?, ?, ?)`,
      [now, author.profile.email, author.id, recipient.profile.email, recipient.id, encryptedFeedback],
      async (err) => {
        if(err) {
          console.error("Error saving feedback:", err.message);
          await respond("Something went wrong. Please try again later. Error: " + err.message)
        }
      }
    );

    // Confirm message was saved
    await respond(`Your feedback for <@${recipient.id}> has been saved securely and will remain confidential. Thank you!`);

    // Delete the original message
    await slackClient.chat.delete({
      channel: event.channel,
      ts: event.ts
    });
  } catch (error) {
    console.error("Error in handleFeedbackMessage:", error);
  }
}

async function handleManagerMessage(event) {
  try {
    const text = event.text.trim();
    const channelId = event.channel;
    const timestamp = event.ts;

    const respond = async (message) => {
      return await slackClient.chat.postMessage({
        channel: event.channel,
        blocks: [{type: "section", text: {type: "mrkdwn", text: message}}]
      })
    }

    // Check if the message matches the expected format
    const match = text.match(/pass:\s*(\S+).*?(@[\w\s,]+)/i); // Case-insensitive match for "Pass: <password>"
    if (!match) {
      await respond("Invalid format. Please include `Pass: <password>` followed by `@person` mentions.");
      return;
    }

    const password = match[1];
    const recipientsText = match[2];

    // Validate the password
    if (password !== process.env.MANAGER_PASSWORD) {
      await respond("Invalid password. Access denied.");
      return;
    }

    // Parse recipients (e.g., "@person1, @person2" -> ["person1", "person2"])
    const recipientIds = recipientsText
      .split(",")
      .map((recipient) => recipient.trim().replace(/^@/, "")); // Remove "@" and trim spaces

    // Fetch feedback for all specified recipients
    const feedbackRecords = await readAllFeedback();
    let feedbackResponse = "*NOTE: This message will self delete after 10 minutes.*\n\n";

    for (const recipientId of recipientIds) {
      const feedbackForRecipient = feedbackRecords.filter(
        (record) => record.recipient_slack_id === recipientId
      );

      if (feedbackForRecipient.length === 0) {
        feedbackResponse += `No feedback found for <@${recipientId}>.\n`;
      } else {
        const feedbackMessages = feedbackForRecipient
          .map((record) => `• ${record.feedback}`)
          .join("\n");

        feedbackResponse += `Feedback for <@${recipientId}>:\n${feedbackMessages}\n\n`;
      }
    }

    const gptPrompt = `I'll give you list of employee feedback for some people. 
    - Summarize the feedback for every person separately.
    - Add some conclusions for each person separately.
    - Add some short goals to become better employee as well, based on the feedback.
    - Return the response formatted as a plain slack message.
    - Do not use other text formatting other than * for bold, and _ for italic.
    - Do not use emojis.
    Here is the feedback: ${feedbackResponse}
    `

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4-turbo',
          temperature: 1,
          messages: [
            { role: 'user', content: gptPrompt },
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
      // Check if there is a message returned
      if (gptResponse) {
        feedbackResponse += `\n\n*Here is a summary:*\n${gptResponse}`;
      }
    } catch (error) {
      console.error('Error making API request:', error);
    }

    const botResponse = await respond(feedbackResponse.trim());

    // Wait 10 seconds and delete both the original message and the bot's response
    setTimeout(async () => {
      try {
        // Delete the manager's request message
        await slackClient.chat.delete({
          channel: channelId,
          ts: timestamp
        });
      } catch (error) {
        console.error("Error deleting manager message:", error);
        await respond(`Error deleting manager message, please contact <@${await getSlackUserIdByEmail(process.env.ADMIN_EMAIL)}>: ` + error.message);
      }

      try {
        // Delete the bot's response message
        await slackClient.chat.delete({
          channel: botResponse.channel,
          ts: botResponse.message.ts
        });
      } catch (error) {
        console.error("Error deleting messages:", error);
        await respond(`Error deleting messages, please contact <@${await getSlackUserIdByEmail(process.env.ADMIN_EMAIL)}>: ` + error.message);
      }
    }, 1000*60*10); // 10 minutes.
  } catch (error) {
    console.error("Error handling manager message:", error);
  }
}

// @TODO: Use later to get all feedback.
const readAllFeedback = async () => {
  const query = `SELECT * FROM feedback`;

  return new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('Error reading feedback records:', err.message);
        reject(err);
      } else {
        // Decrypt feedback for each row
        const decryptedRows = rows.map(row => ({
          ...row,
          feedback: decrypt(row.feedback) // Decrypt the feedback
        }));
        resolve(decryptedRows);
      }
    });
  });
};

module.exports = {handleSlackEvents};
