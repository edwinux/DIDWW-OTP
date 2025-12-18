#!/bin/bash
set -e

echo "=== DIDWW Voice OTP Gateway Starting ==="

# Set defaults for optional variables
export SIP_PORT=${SIP_PORT:-5060}
export RTP_PORT_START=${RTP_PORT_START:-10000}
export RTP_PORT_END=${RTP_PORT_END:-10020}
export ARI_PASSWORD=${ARI_PASSWORD:-internal-ari-secret}
export AMI_SECRET=${AMI_SECRET:-internal-ami-secret}
export AMI_ENABLED=${AMI_ENABLED:-true}

# Validate required variables
if [ -z "$DIDWW_SIP_HOST" ] || [ -z "$DIDWW_USERNAME" ] || [ -z "$DIDWW_PASSWORD" ] || [ -z "$PUBLIC_IP" ] || [ -z "$API_SECRET" ]; then
    echo "ERROR: Missing required environment variables"
    echo "Required: DIDWW_SIP_HOST, DIDWW_USERNAME, DIDWW_PASSWORD, PUBLIC_IP, API_SECRET"
    exit 1
fi

# Track child processes for cleanup
ASTERISK_PID=""
NODE_PID=""

# Graceful shutdown handler
cleanup() {
    echo "Received shutdown signal, cleaning up..."

    # Stop Node.js first
    if [ -n "$NODE_PID" ] && kill -0 "$NODE_PID" 2>/dev/null; then
        echo "Stopping Node.js application..."
        kill -TERM "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null || true
    fi

    # Stop Asterisk gracefully
    if [ -n "$ASTERISK_PID" ] && kill -0 "$ASTERISK_PID" 2>/dev/null; then
        echo "Stopping Asterisk..."
        kill -TERM "$ASTERISK_PID" 2>/dev/null || true
        wait "$ASTERISK_PID" 2>/dev/null || true
    fi

    echo "Shutdown complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT SIGQUIT

echo "Generating Asterisk configuration..."

# Generate Asterisk configs from templates
envsubst < /etc/asterisk/templates/asterisk.conf.tmpl > /etc/asterisk/asterisk.conf
envsubst < /etc/asterisk/templates/pjsip.conf.tmpl > /etc/asterisk/pjsip.conf
envsubst < /etc/asterisk/templates/ari.conf.tmpl > /etc/asterisk/ari.conf
envsubst < /etc/asterisk/templates/rtp.conf.tmpl > /etc/asterisk/rtp.conf
envsubst < /etc/asterisk/templates/http.conf.tmpl > /etc/asterisk/http.conf
envsubst < /etc/asterisk/templates/extensions.conf.tmpl > /etc/asterisk/extensions.conf
envsubst < /etc/asterisk/templates/modules.conf.tmpl > /etc/asterisk/modules.conf
envsubst < /etc/asterisk/templates/logger.conf.tmpl > /etc/asterisk/logger.conf
envsubst < /etc/asterisk/templates/stasis.conf.tmpl > /etc/asterisk/stasis.conf
envsubst < /etc/asterisk/templates/indications.conf.tmpl > /etc/asterisk/indications.conf
envsubst < /etc/asterisk/templates/cdr.conf.tmpl > /etc/asterisk/cdr.conf
envsubst < /etc/asterisk/templates/cel.conf.tmpl > /etc/asterisk/cel.conf
envsubst < /etc/asterisk/templates/features.conf.tmpl > /etc/asterisk/features.conf
envsubst < /etc/asterisk/templates/ccss.conf.tmpl > /etc/asterisk/ccss.conf
envsubst < /etc/asterisk/templates/acl.conf.tmpl > /etc/asterisk/acl.conf
envsubst < /etc/asterisk/templates/udptl.conf.tmpl > /etc/asterisk/udptl.conf
envsubst < /etc/asterisk/templates/manager.conf.tmpl > /etc/asterisk/manager.conf

# Fix permissions so asterisk user can read configs
chown asterisk:asterisk /etc/asterisk/*.conf

echo "Starting Asterisk..."
asterisk -f &
ASTERISK_PID=$!

# Brief pause to let Asterisk initialize
sleep 2

# Check if still running
if ! kill -0 "$ASTERISK_PID" 2>/dev/null; then
    echo "ERROR: Asterisk died during startup"
    exit 1
fi

# Wait for Asterisk ARI to be ready
echo "Waiting for Asterisk ARI..."
for i in $(seq 1 30); do
    # Check if Asterisk is still running
    if ! kill -0 "$ASTERISK_PID" 2>/dev/null; then
        echo "ERROR: Asterisk process died unexpectedly"
        exit 1
    fi

    RESULT=$(wget -qO- "http://ariuser:${ARI_PASSWORD}@127.0.0.1:8088/ari/api-docs/resources.json" 2>&1)
    if echo "$RESULT" | grep -q "apiVersion"; then
        echo "Asterisk ARI is ready"
        # Additional delay to ensure WebSocket endpoint is fully ready
        sleep 2
        break
    fi

    if [ $i -eq 30 ]; then
        echo "ERROR: Asterisk ARI failed to start after 30 seconds"
        exit 1
    fi
    sleep 1
done

echo "Starting Node.js application..."
node /app/dist/index.js &
NODE_PID=$!

# Give Node.js a moment to start and potentially fail
sleep 3

# Check if Node.js is still running (catches immediate startup failures)
if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo "ERROR: Node.js application failed to start"
    echo "Check the logs above for error details"
    cleanup
    exit 1
fi

echo "=== Gateway running - Asterisk PID: $ASTERISK_PID, Node PID: $NODE_PID ==="

# Monitor both processes - exit if either dies
while true; do
    if ! kill -0 "$ASTERISK_PID" 2>/dev/null; then
        echo "Asterisk process exited"
        cleanup
        exit 1
    fi
    if ! kill -0 "$NODE_PID" 2>/dev/null; then
        echo "Node.js process exited"
        cleanup
        exit 1
    fi
    sleep 5
done
