const { WebClient } = require("@slack/web-api");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");
const {getSlackUserById, getSlackUserIdByEmail} = require("./jira-utils");
const axios = require("axios");
const {botResponse, getBotUserId, slackClient, respondToSlashCommand} = require("./slack-utils");

// Environment variables
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 characters for AES-256
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('Encryption key must be exactly 32 characters long.');
}

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

// Handle Slash Commands
async function handleSlashCommand(body) {
  const { command, text, user_id, response_url } = body;

  // Route commands
  if (command === "/give-feedback") {
    await handleGiveFeedbackCommand({ text, user_id, response_url });
  } else if (command === "/get-feedback") {
    await handleGetFeedbackCommand({ text, user_id, response_url });
  } else if (command === "/help") {
    await handleHelpCommand({ text, user_id, response_url });
  } else {
    await respondToSlashCommand(response_url, `Unrecognized command. Use \`/help\`, \`/give-feedback\` or \`/get-feedback\`.`);
  }
}

async function handleHelpCommand({ text, user_id, response_url }) {
  await respondToSlashCommand(response_url, `
    Hello! 👋 I’m here to help you manage feedback. Here’s what I can do:\n
    :one: *Submit Feedback*:\n
           - Share feedback about someone confidentially.\n
           - *Format*: \`/give-feedback @recipient your feedback\`\n
           - *Example*: \`/give-feedback @john_doe Great job on the project!\`\n
          
     :two: *Retrieve Feedback (Managers Only)*:\n
           - View feedback submitted for one or more people.\n
           - *Format*: \`\get-feedback <password> @recipient1, @recipient2...\`\n
           - *Example*: \`\get-feedback secret123 @john_doe, @jane_smith\`\n
          
    :three: *Help*:\n
           - Get this Kermit help message anytime.\n
           - *Command*: \`\help\`\n
          
          💡 _Note: All messages sent to me are confidential and will be deleted after processing._\n
  `);
}

async function handleGiveFeedbackCommand({ text, user_id, response_url }) {
  const author = await getSlackUserById(user_id); // Sender's Slack ID

// Parse message for recipient and feedback
  const match = text.match(/^<@([A-Z0-9]+)(?:\|[^>]*)?>\s+(.+)/); // Match <@USER_ID>, <@USER_ID|>, <@USER_ID|name> with feedback
  if (!match) {
    await respondToSlashCommand(response_url,"Please use the format: `@recipient your feedback`.");
    return;
  }

  const recipientId = match[1]; // Extracts the recipient's Slack ID (e.g., U12345678)
  const feedback = match[2];    // Extracts the feedback text

  if (!feedback) {
    await respondToSlashCommand(response_url,"Please include feedback after the recipient's name.");
    return;
  }

  const recipient = await getSlackUserById(recipientId);
  if (!recipient) {
    await respondToSlashCommand(response_url, `Recipient not found. Please use the format: \`@recipient your feedback\``);
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
        await respondToSlashCommand(response_url,"Something went wrong. Please try again later. Error: " + err.message);
      }
    }
  );

  // Confirm message was saved.
  await respondToSlashCommand(response_url, `Your feedback has been saved and will remain confidential. Thank you!`);
}

async function handleGetFeedbackCommand({ text, user_id, response_url }) {
  // Check if the message matches the expected format
  const match = text.match(/^(\S+)\s+((?:<@[\w]+(?:\|[^>]*)?>[,\s]*|and\s*)+)/i); // Match "<password> <@USER_ID>"
  // or "<password> <@USER_ID|display_name>"
  if (!match) {
    await respondToSlashCommand(response_url, `Invalid format. Please include \`<password>\` followed by mentions like \`@person\`.`);
    return;
  }

  const password = match[1]; // Extract the password
  const recipientsText = match[2]; // Extract all mentions

// Validate the password
  if (password.trim().toLowerCase() !== process.env.MANAGER_PASSWORD.trim().toLowerCase()) {
    await respondToSlashCommand(response_url, "Invalid password. Access denied.");
    return;
  }

// Extract all user IDs, matching both formats <@USER_ID> and <@USER_ID|display_name>
  const recipientIds = [...recipientsText.matchAll(/<@([\w]+)(?:\|[^>]*)?>/g)].map((m) => m[1]);

  if (recipientIds.length === 0) {
    await respondToSlashCommand(response_url, "Please mention at least one recipient using @ (e.g., `@person`).");
    return;
  }

  await respondToSlashCommand(response_url, "I will DM you! ;)");

  // Fetch feedback for all specified recipients
  const feedbackRecords = await getAllFeedback();
  let feedbackResponse = "*NOTE: This message will self delete after 5 minutes.*\n\n";

  for (const recipientId of recipientIds) {
    const feedbackForRecipient = feedbackRecords.filter(record => record.recipient_slack_id === recipientId);

    if (feedbackForRecipient.length === 0) {
      feedbackResponse += `No feedback found for <@${recipientId}>.\n\n`;
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

  const botResponseEvent = await botResponse(feedbackResponse.trim(), user_id);

  // Wait 10 seconds and delete both the original message and the bot's response
  setTimeout(async () => {
    try {
      // Delete the bots response message
      await slackClient.chat.delete({
        channel: botResponseEvent.channel,
        ts: botResponseEvent.message.ts
      });
    } catch (error) {
      console.error("Error deleting messages:", error);
      const adminId = await getSlackUserIdByEmail(process.env.ADMIN_EMAIL);
      await botResponse(`Error deleting messages, please contact <@${adminId}>: ` + error.message, user_id);
    }
  }, 1000*60*5); // 5 minutes.
}

const getAllFeedback = async () => {
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

module.exports = {handleSlashCommand};
