#!/bin/bash

# Check arguments
if [ $# -lt 2 ]; then
    echo "Usage: $0 <user> <usecase>"
    echo "  user: ock, hami, etc."
    echo "  usecase: instagram, chatgpt, chatgpt-enterprise"
    exit 1
fi

USER=$1
USECASE_ARG=$2

# Normalize usecase argument to instagram or chatgpt (for app file selection)
if [ "$USECASE_ARG" = "instagram" ]; then
    APP_USECASE="instagram"
elif [ "$USECASE_ARG" = "chatgpt" ]; then
    APP_USECASE="chatgpt"
elif [ "$USECASE_ARG" = "chatgpt-enterprise" ]; then
    APP_USECASE="chatgpt-enterprise"
else
    echo "Invalid usecase: $USECASE_ARG"
    echo "  Supported usecases: instagram, chatgpt, chatgpt-enterprise"
    exit 1
fi

# Determine which app file to run
if [ "$APP_USECASE" = "instagram" ]; then
    APP_FILE="app-instagram.js"
elif [ "$APP_USECASE" = "chatgpt" ]; then
    APP_FILE="app-chatgpt.js"
elif [ "$APP_USECASE" = "chatgpt-enterprise" ]; then
    APP_FILE="app-chatgpt-enterprise.js"
fi

# Load config from config.json using node
CONFIG_OUTPUT=$(node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
if (!config['$USER']) {
    console.error('User \"$USER\" not found in config.json');
    process.exit(1);
}
let usecaseKey = '$APP_USECASE';
if (usecaseKey === 'chatgpt-enterprise' && !config['$USER']['chatgpt-enterprise']) {
    usecaseKey = 'chatgpt';
}
if (!config['$USER'][usecaseKey]) {
    console.error('Usecase \"$APP_USECASE\" (or fallback) not found for user \"$USER\" in config.json');
    process.exit(1);
}
const userConfig = config['$USER']['$APP_USECASE'];
const p = config.PORT != null && config.PORT !== '' ? String(config.PORT) : '3000';
const ar = config.ALWAYS_RETURN_200 === true || String(config.ALWAYS_RETURN_200).toLowerCase() === 'true' ? 'true' : 'false';
console.log(userConfig.BACKEND_BASE_URL);
console.log(userConfig.NGROK_URL);
console.log(p);
console.log(ar);
")

if [ $? -ne 0 ]; then
    exit 1
fi

CONFIG_BACKEND_BASE_URL=$(echo "$CONFIG_OUTPUT" | sed -n '1p')
CONFIG_NGROK_URL=$(echo "$CONFIG_OUTPUT" | sed -n '2p')
CONFIG_PORT=$(echo "$CONFIG_OUTPUT" | sed -n '3p')
CONFIG_ALWAYS=$(echo "$CONFIG_OUTPUT" | sed -n '4p')

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
# Optional: set in .env for enterprise OAuth tunneling so PHP receives HTTP_RDS_ENV (e.g. enterprise).
export FORWARD_RDS_ENV=${FORWARD_RDS_ENV:-}
export ENTERPRISE_OAUTH_BASE_URL=${ENTERPRISE_OAUTH_BASE_URL:-}
export BASIC_PROXY_USER=$USER
export BASIC_PROXY_USECASE=$APP_USECASE

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
if [ "$APP_USECASE" = "chatgpt-enterprise" ]; then
    echo "Enterprise OAuth: mcp- → enterprise- host + /oa2 (override with ENTERPRISE_OAUTH_BASE_URL in .env)"
fi

# Kill existing session if it exists
tmux kill-session -t basic-proxy 2>/dev/null

# Create new tmux session with two panes
tmux new-session -d -s basic-proxy -x 200 -y 50

# Split window horizontally
tmux split-window -h -t basic-proxy

# Run node app in left pane (pane 0)
tmux send-keys -t basic-proxy:0.0 "export BACKEND_BASE_URL='$BACKEND_BASE_URL' && export NGROK_URL='$NGROK_URL' && export PORT='$PORT' && export ALWAYS_RETURN_200='$ALWAYS_RETURN_200' && export FORWARD_RDS_ENV='$FORWARD_RDS_ENV' && export ENTERPRISE_OAUTH_BASE_URL='$ENTERPRISE_OAUTH_BASE_URL' && node $APP_FILE" C-m

# Run ngrok in right pane (pane 1)
tmux send-keys -t basic-proxy:0.1 "export NGROK_URL='$NGROK_URL' && export PORT='$PORT' && ngrok http \$PORT --url=\$NGROK_URL --host-header=rewrite" C-m

# Attach to the session
tmux attach-session -t basic-proxy
