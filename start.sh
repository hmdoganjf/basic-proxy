#!/bin/bash

# Check arguments
if [ $# -lt 2 ]; then
    echo "Usage: $0 <user> <usecase>"
    echo "  user: ock, hami, etc."
    echo "  usecase: instagram, chatgpt"
    exit 1
fi

USER=$1
USECASE_ARG=$2

# Normalize usecase argument to instagram or chatgpt (for app file selection)
if [ "$USECASE_ARG" = "instagram" ]; then
    APP_USECASE="instagram"
elif [ "$USECASE_ARG" = "chatgpt" ]; then
    APP_USECASE="chatgpt"
else
    echo "Invalid usecase: $USECASE_ARG"
    echo "  Supported usecases: instagram, chatgpt"
    exit 1
fi

# Determine which app file to run
if [ "$APP_USECASE" = "instagram" ]; then
    APP_FILE="app-instagram.js"
elif [ "$APP_USECASE" = "chatgpt" ]; then
    APP_FILE="app-chatgpt.js"
fi

# Load config from config.json using node
CONFIG_OUTPUT=$(node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
if (!config['$USER']) {
    console.error('User \"$USER\" not found in config.json');
    process.exit(1);
}
if (!config['$USER']['$APP_USECASE']) {
    console.error('Usecase \"$APP_USECASE\" not found for user \"$USER\" in config.json');
    process.exit(1);
}
const userConfig = config['$USER']['$APP_USECASE'];
console.log(userConfig.BACKEND_BASE_URL);
console.log(userConfig.NGROK_URL);
")

if [ $? -ne 0 ]; then
    exit 1
fi

# Extract BACKEND_BASE_URL and NGROK_URL from config output (first and second lines)
CONFIG_BACKEND_BASE_URL=$(echo "$CONFIG_OUTPUT" | sed -n '1p')
CONFIG_NGROK_URL=$(echo "$CONFIG_OUTPUT" | sed -n '2p')

# Load default values from .env if it exists (for PORT and ALWAYS_RETURN_200)
if [ -f .env ]; then
    source .env
fi

# Always use values from config.json (these take precedence over .env)
BACKEND_BASE_URL=$CONFIG_BACKEND_BASE_URL
NGROK_URL=$CONFIG_NGROK_URL

# Export the config values
export BACKEND_BASE_URL
export NGROK_URL

# Set defaults if not in .env
export PORT=${PORT:-3000}
export ALWAYS_RETURN_200=${ALWAYS_RETURN_200:-false}

# check if tmux is installed
if ! command -v tmux &> /dev/null; then
    echo "tmux could not be found, please install it via: brew install tmux"
    exit 1
fi

# check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "ngrok could not be found, please install it via https://ngrok.com/download"
    exit 1
fi

# check NGROK_URL is set
if [ -z "$NGROK_URL" ]; then
    echo "NGROK_URL is not set in config.json for user=$USER, usecase=$APP_USECASE"
    exit 1
fi

# check BACKEND_BASE_URL is set
if [ -z "$BACKEND_BASE_URL" ]; then
    echo "BACKEND_BASE_URL is not set in config.json for user=$USER, usecase=$APP_USECASE"
    exit 1
fi

# check app file exists
if [ ! -f "$APP_FILE" ]; then
    echo "App file $APP_FILE not found"
    exit 1
fi

echo "Starting proxy for user: $USER, usecase: $APP_USECASE"
echo "BACKEND_BASE_URL: $BACKEND_BASE_URL"
echo "NGROK_URL: $NGROK_URL"
echo "App file: $APP_FILE"

# Kill existing session if it exists
tmux kill-session -t basic-proxy 2>/dev/null

# Create new tmux session with two panes
tmux new-session -d -s basic-proxy -x 200 -y 50

# Split window horizontally
tmux split-window -h -t basic-proxy

# Run node app in left pane (pane 0)
tmux send-keys -t basic-proxy:0.0 "export BACKEND_BASE_URL='$BACKEND_BASE_URL' && export PORT='$PORT' && export ALWAYS_RETURN_200='$ALWAYS_RETURN_200' && node $APP_FILE" C-m

# Run ngrok in right pane (pane 1)
tmux send-keys -t basic-proxy:0.1 "export NGROK_URL='$NGROK_URL' && export PORT='$PORT' && ngrok http \$PORT --url=\$NGROK_URL --host-header=rewrite" C-m

# Attach to the session
tmux attach-session -t basic-proxy
