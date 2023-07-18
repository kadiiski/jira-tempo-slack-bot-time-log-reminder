# Tempo Time Logg Reminder App

This is an npm app that integrates with Jira and Tempo to help users log their time. 
It includes a simple cron job that reminds people with a Slack bot to log their time.
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
