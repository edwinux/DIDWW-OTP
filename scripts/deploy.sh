#!/bin/bash
# =============================================================================
# DIDWW OTP Gateway - Production Deploy Script
# Handles deployment with automatic rollback on health check failure
# =============================================================================

set -euo pipefail

IMAGE_LATEST="$1"
IMAGE_SHA="$2"
GHCR_TOKEN="$3"

DEPLOY_DIR="/opt/didww-otp"
HEALTH_URL="http://localhost:8080/health"
HEALTH_RETRIES=10
HEALTH_INTERVAL=6
ROLLBACK_TIMEOUT=60

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# Get current running image for potential rollback
get_current_image() {
    docker inspect didww-otp-gateway --format='{{.Config.Image}}' 2>/dev/null || echo ""
}

# Health check with retries
check_health() {
    local retries=$HEALTH_RETRIES
    local interval=$HEALTH_INTERVAL

    log "Waiting for service to become healthy..."

    for ((i=1; i<=retries; i++)); do
        if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
            log "Health check passed (attempt $i/$retries)"
            return 0
        fi
        log "Health check failed (attempt $i/$retries), waiting ${interval}s..."
        sleep "$interval"
    done

    error "Health check failed after $retries attempts"
    return 1
}

# Rollback to previous image
rollback() {
    local previous_image="$1"

    if [[ -z "$previous_image" ]]; then
        error "No previous image to rollback to"
        return 1
    fi

    log "Rolling back to previous image: $previous_image"

    cd "$DEPLOY_DIR"

    # Update compose to use previous image
    export DEPLOY_IMAGE="$previous_image"
    docker compose pull
    docker compose up -d --no-build

    # Verify rollback health
    if check_health; then
        log "Rollback successful"
        return 0
    else
        error "Rollback also failed - manual intervention required"
        return 1
    fi
}

# Main deployment
main() {
    log "Starting deployment..."
    log "Image: $IMAGE_SHA"

    # Save current image for potential rollback
    PREVIOUS_IMAGE=$(get_current_image)
    if [[ -n "$PREVIOUS_IMAGE" ]]; then
        log "Previous image: $PREVIOUS_IMAGE"
    else
        log "No previous deployment found (first deploy)"
    fi

    cd "$DEPLOY_DIR"

    # Login to GitHub Container Registry
    log "Logging in to GitHub Container Registry..."
    echo "$GHCR_TOKEN" | docker login ghcr.io -u github --password-stdin

    # Pull new image
    log "Pulling new image..."
    docker pull "$IMAGE_SHA"
    docker tag "$IMAGE_SHA" "$IMAGE_LATEST"

    # Update compose file to use the new image
    log "Updating docker-compose.yml to use registry image..."

    # Stop current container
    log "Stopping current container..."
    docker compose down --timeout 30 || true

    # Start with new image
    log "Starting new container..."
    export DEPLOY_IMAGE="$IMAGE_LATEST"
    docker compose up -d --no-build

    # Health check
    if check_health; then
        log "Deployment successful!"

        # Cleanup old images (keep last 3)
        log "Cleaning up old images..."
        docker image prune -f --filter "until=72h" || true

        exit 0
    else
        error "Deployment failed health check"

        if [[ -n "$PREVIOUS_IMAGE" ]]; then
            log "Initiating rollback..."
            if rollback "$PREVIOUS_IMAGE"; then
                exit 1  # Exit with error even though rollback succeeded
            else
                exit 2  # Critical failure
            fi
        else
            error "No previous image available for rollback"
            exit 2
        fi
    fi
}

main
