# Tempo Time Logg Reminder App

This is an npm app that integrates with Jira and Tempo to help users log their time.

This app is designed to automate reminders for users to log their time in Jira. 
It uses a cron job that runs every day at a specific time (9:00 AM) to send Slack messages to users who have not logged their time. 

The app also has an option to enable winners based on the number of days not logged and send a formatted message with the so-called "winners".
The app reads a list of email addresses from the environment variable EMAIL_LIST and retrieves the not logged days for each user. 
If there are any not logged days for a user, it sends a direct message to the user on Slack.

If enabled, the app selects winners based on the minimum number of days (WINNERS_MIN_DAYS) set in the environment variable. 
It then invites the winners to a Slack channel and sends a message with the winners to remind them.

The app also provides a basic HTTP server that listens for requests. 
By accessing the /runcron endpoint, the cron job can be manually triggered. 

The server also displays the current status of the cron job, including the last run time, on the default endpoint.

To use this app, you need to configure your environment variables, including the Jira email list, Slack channel ID, and other necessary options.
You need to create the Slack Bot yourself and give him permissions to read user data, write and invite people to chanels.
Of course if some permissions are missing - it will throw error so you can fix them.

## Installation

To use this app, you need to have Node.js and npm installed on your machine.

1. Clone this repository
2. Navigate to the project directory:
3. Install the dependencies using yarn/npm
4. Configure environment variables: 
   - Create a `.env.local` or just use the `.env` file in the project root directory. 
   - Set the following environment variables in the `.env.local` file: 
     - `SLACK_CHANNEL_ID`: If enabled, winners with most days not logged will be displayed in the channel with SLACK_CHANNEL_ID 
     - `ENABLE_WINNERS`: Slack channel ID (something like C05H9KYLPFX) 
     - `WINNERS_MIN_DAYS`: Minimum days not logged to be part of the "winners" list. :D 
     - `JIRA_EMAIL`: Same email as the account from which the API token was generated. 
     - `JIRA_API_TOKEN`: JIRA API token (google how to generate it). 
     - `JIRA_EMAIL`: Same email as the account from which the API token was generated. 
     - `JIRA_BASE_URL`: No slash! 
     - `TEMPO_API_TOKEN`: Generated from the Tempo app in the JIRA (settings -> tokens...)(google it) 
     - `TEMPO_BASE_URL`: usually `https://api.tempo.io`
     - `SLACK_BOT_TOKEN`: The main job token, should start with something like "xoxb-...." 
     - `EMAIL_LIST`: Comma separated emails of people for which to check logs.

## birthdays.json
Use this file to list birthdays of your team members. 
They will be used in combination with OPENAI_API_KEY env. variable to generate nice weekly birthday messages.
Those messages will be sent to the slack channel with the ID from the SLACK_CHANNEL_ID_BIRTHDAYS env. variable.
NOTE: You can also add some other useful information that you want to be sent to the channel, like holidays.
Use the env. variable BIRTHDAY_MSG_INSTRUCTIONS to add instructions about the format of the birthdays message.
Format of the JSON:
```json
[
  {"name": "Some Name", "birthday": "3-1-1992", "email": "email@email.com"},
  {"name": "Some Name", "birthday": "3-1-1992", "email": "email@email.com"}
]
```

## Usage 
1. Start the app: `yarn start`
2. The cron job will run at the specified intervals (every day at 15:00 PM). 
3. The Slack bot will send reminders to all team members to log their time. 

## Contributing We welcome contributions to enhance this app. If you'd like to contribute, please follow these steps: 
1. Fork this repository. 
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes and commit them: `git commit -m "Add your commit message"`
4. Push your changes to your forked repository: `git push origin feature/your-feature-name`
5. Open a pull request with a detailed description of your changes. ## License This app is licensed under the MIT License.
