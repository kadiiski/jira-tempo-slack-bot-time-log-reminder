const {getSlackUserById} = require("./jira-utils");
const {botResponse, getBotUserId, slackClient, respondToSlashCommand, botResponseBlocks, replyToThread, deleteBotHistoryWithUser } = require("./slack-utils");
const {encrypt} = require("./encrypt-utils");
const {getFeedbackById, getThreadStateByThreadTs, insertFeedback, insertThreadState, getFeedbackByRecipientId, getThreadStateByFeedbackId} = require("./sqlite-utils");

// Handle Slash Commands
async function handleSlashCommand(body) {
  const { command, text, user_id, response_url } = body;

  // Route commands
  if (command === "/give-feedback") {
    await handleGiveFeedbackCommand({ text, user_id, response_url });
  } else if (command === "/get-feedback") {
    await handleGetFeedbackCommand({ text, user_id, response_url });
  } else if (command === "/delete-history") {
    // Delete all messages from the bot
    await respondToSlashCommand(response_url, "Fine, I will delete all my messages. ;)");
    await deleteBotHistoryWithUser(user_id);
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
    💡 _Note: you can do this anywhere, in any chat, any time, it will only be seen by you as it's ephemeral messaging. If you have any doubts - do it in your own DMs or with me._
    
    :two: *Retrieve Feedback (Managers Only)*:\n
           - View feedback submitted for one or more people.\n
           - *Format*: \`\get-feedback <password> @recipient1, @recipient2...\`\n
           - *Example*: \`\get-feedback secret123 @john_doe, @jane_smith\`\n
    💡 _Note: you can do this anywhere, in any chat, any time, it will only be seen by you as it's ephemeral messaging. If you have any doubts - do it in your own DMs or with me._
          
    :three: *Help*:\n
           - Get this Kermit help message anytime.\n
           - *Command*: \`\help\`\n
          
    💡 _Note: All messages sent to me are confidential and will be deleted after processing. No names and emails are being saved and feedback is encrypted_\n\n
    :tea_kermit: _Managers can also initiate a confidential & anonymous discussion about specific feedback item, Kermit will act as a middle man to convey the messages and keep both parties anonymous. When this happens a private thread will be initiated in both people DM chats with Kermit, where they can communicate in the thread._
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

  try {
    await insertFeedback(author.id, recipient.id, encryptedFeedback);
  } catch (error) {
    console.error("Error saving feedback:", error);
    await respondToSlashCommand(response_url, "Something went wrong. Please try again later. Error: " + error.message);
  }

  // Confirm message was saved.
  await respondToSlashCommand(response_url, `Your feedback has been saved and will remain confidential. Thank you!`);
}

async function handleGetFeedbackCommand({ text, user_id, response_url }) {
  // Check if the message matches the expected format.
  const match = text.match(/^(\S+)\s+((?:<@[\w]+(?:\|[^>]*)?>[,\s]*|and\s*)+)/i); // Match "<password> <@USER_ID>"
  // or "<password> <@USER_ID|display_name>"
  if (!match) {
    respondToSlashCommand(response_url, `Invalid format. Please include \`<password>\` followed by mentions like \`@person\`.`).then();
    return;
  }

  const password = match[1]; // Extract the password
  const recipientsText = match[2]; // Extract all mentions

  // Validate the password
  if (password.trim().toLowerCase() !== process.env.MANAGER_PASSWORD.trim().toLowerCase()) {
    respondToSlashCommand(response_url, "Invalid password. Access denied.").then();
    return;
  }

  if (recipientsText.includes(user_id)) {
    respondToSlashCommand(response_url, "You can't get feedback for yourself, i'll just ignore it.").then();
  }

  // Extract all user IDs, matching both formats <@USER_ID> and <@USER_ID|display_name>
  const recipientIds = [...recipientsText.matchAll(/<@([\w]+)(?:\|[^>]*)?>/g)]
    // Get the proper match for the IDs.
    .map(m => m[1])
    // Remove duplicates.
    .filter((value, index, array) => array.indexOf(value) === index)
    .filter(id => id !== user_id)
  ;

  if (recipientIds.length === 0) {
    respondToSlashCommand(response_url, "Please mention at least one recipient using @ (e.g., `@person`).").then();
    return;
  }

  // await respondToSlashCommand(response_url, "I will DM you!");

  const blocks = [];

  for (const recipientId of recipientIds) {
    const feedbackForRecipient = await getFeedbackByRecipientId(recipientId);

    if (feedbackForRecipient.length === 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `No feedback found for <@${recipientId}>.`
        }
      });
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Feedback for <@${recipientId}>:*`
        }
      });

      for (const record of feedbackForRecipient) {
        // Convert the string to a Date object
        const date = new Date(record.date);
        // Extract the day, month, and year
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const year = date.getFullYear();
        // Format the date as DD/MM/YYYY
        const formattedDate = `${day}/${month}/${year}`;

        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${formattedDate}*\n _${record.feedback}_`
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Discuss"
            },
            action_id: `discuss_feedback_${record.id}`
          }
        });
      }
    }

    blocks.push({
      type: "divider"
    });
  }

  await botResponseBlocks(blocks, "Here is the feedback:", user_id);
}

async function handleFeedbackDiscussion(payload, action) {
  const { user, message } = payload;
  const managerSlackId = user.id; // The manager initiating the discussion
  const feedbackId = action.action_id.split('discuss_feedback_')[1]; // Extract the feedback ID

  // Retrieve the feedback details from the database
  const feedbackRecord = await getFeedbackById(feedbackId);

  if (!feedbackRecord) {
    console.error('Feedback not found for ID:', feedbackId);
    botResponse(`Sorry, but I can't find the feedback for ID: ${feedbackId}, couldn't initiate a discussion.`, managerSlackId).then();
    return;
  }

  const { author_slack_id, feedback, recipient_slack_id } = feedbackRecord;

  if (author_slack_id === managerSlackId) {
    botResponse(`Sorry, but you can't discuss your own feedback.`, managerSlackId).then();
    return;
  }

  // Check if the thread already exist for this same feedback, author and manager.
  const threadStates = await getThreadStateByFeedbackId(feedbackId, author_slack_id, managerSlackId);
  if (threadStates.length > 0) {
    const threadState = threadStates[0];
    const existingDiscussionBlocks = [
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: '_Further discussion requested._'
        }]
      }
    ];
    const {author_slack_id, manager_slack_id, author_thread_ts, manager_thread_ts} = threadState

    await replyToThread({
      message: `Further discussion requested.`,
      blocks: existingDiscussionBlocks,
      channel: author_slack_id,
      thread_ts: author_thread_ts
    });
    await replyToThread({
      message: `Further discussion requested.`,
      blocks: existingDiscussionBlocks,
      channel: manager_slack_id,
      thread_ts: manager_thread_ts
    });
    return;
  }

  const sharedBlocks = [
    {
      type: 'divider'
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'You can reply to this message to communicate anonymously. Kermit will be your middle man.'
        }
      ]
    }
  ]

  const recipientSlackUser = await getSlackUserById(recipient_slack_id);

  const managerBlocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Anonymous discussion about <@${recipient_slack_id}> feedback:*\n _${feedback}_`
      },
      accessory: {
        type: "image",
        image_url: recipientSlackUser ? recipientSlackUser.profile.image_original : null,
        alt_text: recipientSlackUser ? recipientSlackUser.profile.real_name : "User Image"
      }
    },
    ...sharedBlocks
  ];

  const authorBlocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Your manager requested anonymous discussion about feedback you submitted for <@${recipient_slack_id}>:*\n _${feedback}_`
      },
      accessory: {
        type: "image",
        image_url: recipientSlackUser ? recipientSlackUser.profile.image_original : null,
        alt_text: recipientSlackUser ? recipientSlackUser.profile.real_name : "User Image"
      }
    },
    ...sharedBlocks
  ];

  // Start the discussion thread
  const managerThread = await slackClient.chat.postMessage({
    channel: managerSlackId,
    text: `Anonymous discussion about <@${recipient_slack_id}> feedback:\n\n"${feedback}"`,
    blocks: managerBlocks,
  });

  // Send an initial message to the author
  const authorThread = await slackClient.chat.postMessage({
    channel: author_slack_id,
    text: `Your manager requested anonymous discussion about feedback you submitted for:\n\n"${feedback}"`,
    blocks: authorBlocks,
  });

  await insertThreadState(feedbackId, managerThread.ts, authorThread.ts, managerSlackId, author_slack_id);
}

// async function handleGetFeedbackCommand({ text, user_id, response_url }) {
//   // Check if the message matches the expected format
//   const match = text.match(/^(\S+)\s+((?:<@[\w]+(?:\|[^>]*)?>[,\s]*|and\s*)+)/i); // Match "<password> <@USER_ID>"
//   // or "<password> <@USER_ID|display_name>"
//   if (!match) {
//     await respondToSlashCommand(response_url, `Invalid format. Please include \`<password>\` followed by mentions like \`@person\`.`);
//     return;
//   }
//
//   const password = match[1]; // Extract the password
//   const recipientsText = match[2]; // Extract all mentions
//
// // Validate the password
//   if (password.trim().toLowerCase() !== process.env.MANAGER_PASSWORD.trim().toLowerCase()) {
//     await respondToSlashCommand(response_url, "Invalid password. Access denied.");
//     return;
//   }
//
// // Extract all user IDs, matching both formats <@USER_ID> and <@USER_ID|display_name>
//   const recipientIds = [...recipientsText.matchAll(/<@([\w]+)(?:\|[^>]*)?>/g)].map((m) => m[1]);
//
//   if (recipientIds.length === 0) {
//     await respondToSlashCommand(response_url, "Please mention at least one recipient using @ (e.g., `@person`).");
//     return;
//   }
//
//   await respondToSlashCommand(response_url, "I will DM you! ;)");
//
//   // Fetch feedback for all specified recipients
//   const feedbackRecords = await getAllFeedback();
//   let feedbackResponse = "*NOTE: This message will self delete after 5 minutes.*\n\n";
//
//   for (const recipientId of recipientIds) {
//     const feedbackForRecipient = feedbackRecords.filter(record => record.recipient_slack_id === recipientId);
//
//     if (feedbackForRecipient.length === 0) {
//       feedbackResponse += `No feedback found for <@${recipientId}>.\n\n`;
//     } else {
//       const feedbackMessages = feedbackForRecipient
//         .map((record) => `• ${record.feedback}`)
//         .join("\n");
//
//       feedbackResponse += `Feedback for <@${recipientId}>:\n${feedbackMessages}\n\n`;
//     }
//   }
//
//   const gptPrompt = `I'll give you list of employee feedback for some people.
//     - Summarize the feedback for every person separately.
//     - Add some conclusions for each person separately.
//     - Add some short goals to become better employee as well, based on the feedback.
//     - Return the response formatted as a plain slack message.
//     - Do not use other text formatting other than * for bold, and _ for italic.
//     - Do not use emojis.
//     Here is the feedback: ${feedbackResponse}
//     `
//
//   try {
//     const response = await axios.post(
//       'https://api.openai.com/v1/chat/completions',
//       {
//         model: 'gpt-4-turbo',
//         temperature: 1,
//         messages: [
//           { role: 'user', content: gptPrompt },
//         ],
//       },
//       {
//         headers: {
//           'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
//           'Content-Type': 'application/json'
//         }
//       }
//     );
//
//     // Extract the message content from the response
//     const gptResponse = response.data.choices[0].message.content;
//     // Check if there is a message returned
//     if (gptResponse) {
//       feedbackResponse += `\n\n*Here is a summary:*\n${gptResponse}`;
//     }
//   } catch (error) {
//     console.error('Error making API request:', error);
//   }
//
//   const botResponseEvent = await botResponse(feedbackResponse.trim(), user_id);
//
//   // Wait 10 seconds and delete both the original message and the bot's response
//   setTimeout(async () => {
//     try {
//       // Delete the bots response message
//       await slackClient.chat.delete({
//         channel: botResponseEvent.channel,
//         ts: botResponseEvent.message.ts
//       });
//     } catch (error) {
//       console.error("Error deleting messages:", error);
//       const adminId = await getSlackUserIdByEmail(process.env.ADMIN_EMAIL);
//       await botResponse(`Error deleting messages, please contact <@${adminId}>: ` + error.message, user_id);
//     }
//   }, 1000*60*5); // 5 minutes.
// }

async function handleSlackEvent(event) {
  if (event.type === 'message' && event.thread_ts) {
    const botUserId = await getBotUserId();
    if (event.user === botUserId) {
      return; // Ignore messages from the bot
    }

    const threadState = await getThreadStateByThreadTs(event.thread_ts);
    if (!threadState) {
      console.log('No active thread found for this message.');
      return;
    }

    const { manager_slack_id, author_slack_id, author_thread_ts, manager_thread_ts } = threadState;

    if (event.user === manager_slack_id && event.thread_ts === manager_thread_ts) {
      // Manager sent a message, forward it to the author's thread
      await replyToThread({
        message: event.text,
        channel: author_slack_id,
        thread_ts: author_thread_ts
      });
    } else if (event.user === author_slack_id && event.thread_ts === author_thread_ts) {
      // Author sent a message, forward it to the manager's thread
      await replyToThread({
        message: event.text,
        channel: manager_slack_id,
        thread_ts: manager_thread_ts
      });
    } else {
      console.log('Message from an unexpected user or thread received.', event);
      await botResponse(`Unexpected message received or I couldn't find the thread. Contact the app admin. Here are some details: \`\`\`${JSON.stringify(event)}\`\`\``, manager_slack_id);
    }
  }
}

module.exports = {handleSlashCommand, handleFeedbackDiscussion, handleSlackEvent};
