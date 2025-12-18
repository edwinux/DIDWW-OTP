#!/bin/bash
# =============================================================================
# DIDWW OTP Gateway - Firewall Setup Script
# =============================================================================
# Configures UFW firewall to protect the OTP gateway:
#
# MANDATORY (always applied):
# - SIP (5060/UDP): DIDWW network only - blocks SIP scanner spam
# - RTP (10000-10020/UDP): DIDWW network only
# - SSH (22/TCP): Open
#
# OPTIONAL (based on ALLOWED_CLIENT_IPS):
# - If ALLOWED_CLIENT_IPS is set: HTTP ports restricted to those IPs + DIDWW
# - If ALLOWED_CLIENT_IPS is empty: HTTP ports open to all (protected by API_SECRET)
#
# This allows deployments using serverless functions (e.g., Supabase Edge Functions)
# that don't have static IPs while still protecting the SIP stack.
#
# Usage: ./firewall-setup.sh [path-to-env-file]
# Example: ./firewall-setup.sh /opt/didww-otp/.env
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# Load environment file if provided
ENV_FILE="${1:-.env}"
if [ -f "$ENV_FILE" ]; then
    log_info "Loading configuration from $ENV_FILE"
    # Source only the variables we need (safely)
    DIDWW_ALLOWED_IPS=$(grep -E "^DIDWW_ALLOWED_IPS=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    ALLOWED_CLIENT_IPS=$(grep -E "^ALLOWED_CLIENT_IPS=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
else
    log_warn "Environment file not found: $ENV_FILE"
    log_warn "Using environment variables or defaults"
fi

# Use environment variables if not set from file
DIDWW_ALLOWED_IPS="${DIDWW_ALLOWED_IPS:-46.19.208.0/21,185.238.172.0/22,2a01:ad00::/32}"
ALLOWED_CLIENT_IPS="${ALLOWED_CLIENT_IPS:-}"

# Validate we have DIDWW IPs
if [ -z "$DIDWW_ALLOWED_IPS" ]; then
    log_error "DIDWW_ALLOWED_IPS is not set"
    exit 1
fi

log_info "DIDWW IPs: $DIDWW_ALLOWED_IPS"
log_info "Client IPs: ${ALLOWED_CLIENT_IPS:-<none>}"

# Validate IP/CIDR format to prevent command injection
validate_ip_cidr() {
    local ip="$1"
    # IPv4 CIDR: 0-255.0-255.0-255.0-255/0-32
    if echo "$ip" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$'; then
        return 0
    fi
    # IPv6 CIDR: hexadecimal with colons and prefix
    if echo "$ip" | grep -Eiq '^[0-9a-f:]+/[0-9]{1,3}$'; then
        return 0
    fi
    return 1
}

# Check if UFW is installed
if ! command -v ufw &> /dev/null; then
    log_info "Installing UFW..."
    apt-get update && apt-get install -y ufw
fi

# Reset UFW to default (will prompt for confirmation in interactive mode)
log_info "Resetting UFW to defaults..."
ufw --force reset

# Set default policies
log_info "Setting default policies (deny incoming, allow outgoing)..."
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (always, to prevent lockout)
log_info "Allowing SSH (port 22)..."
ufw allow 22/tcp comment "SSH"

# Function to add rules for a list of IPs
add_rules_for_ips() {
    local port="$1"
    local protocol="$2"
    local ip_list="$3"
    local comment="$4"

    IFS=',' read -ra IPS <<< "$ip_list"
    for ip in "${IPS[@]}"; do
        ip=$(echo "$ip" | tr -d ' ')
        if [ -n "$ip" ]; then
            if ! validate_ip_cidr "$ip"; then
                log_error "  Invalid IP/CIDR format: $ip (skipping)"
                continue
            fi
            log_info "  Allowing $ip -> $port/$protocol ($comment)"
            ufw allow from "$ip" to any port "$port" proto "$protocol" comment "$comment"
        fi
    done
}

# SIP signaling (UDP 5060) - DIDWW only
log_info "Configuring SIP (UDP 5060) - DIDWW only..."
add_rules_for_ips "5060" "udp" "$DIDWW_ALLOWED_IPS" "SIP-DIDWW"

# RTP media (UDP 10000-10020) - DIDWW only
log_info "Configuring RTP (UDP 10000:10020) - DIDWW only..."
IFS=',' read -ra DIDWW_IPS <<< "$DIDWW_ALLOWED_IPS"
for ip in "${DIDWW_IPS[@]}"; do
    ip=$(echo "$ip" | tr -d ' ')
    if [ -n "$ip" ]; then
        if ! validate_ip_cidr "$ip"; then
            log_error "  Invalid IP/CIDR format: $ip (skipping)"
            continue
        fi
        log_info "  Allowing $ip -> 10000:10020/udp (RTP-DIDWW)"
        ufw allow from "$ip" to any port 10000:10020 proto udp comment "RTP-DIDWW"
    fi
done

# HTTP API (TCP 8080)
if [ -n "$ALLOWED_CLIENT_IPS" ]; then
    # Restricted mode: DIDWW (for DLR callbacks) + specific client IPs
    log_info "Configuring HTTP API (TCP 8080) - DIDWW + Clients (restricted)..."
    add_rules_for_ips "8080" "tcp" "$DIDWW_ALLOWED_IPS" "API-DIDWW-DLR"
    add_rules_for_ips "8080" "tcp" "$ALLOWED_CLIENT_IPS" "API-Client"
else
    # Open mode: Allow from anywhere (protected by API_SECRET)
    log_info "Configuring HTTP API (TCP 8080) - Open (protected by API_SECRET)..."
    ufw allow 8080/tcp comment "API-Open"
fi

# Admin panel (TCP 80)
if [ -n "$ALLOWED_CLIENT_IPS" ]; then
    # Restricted mode: Only specific client IPs
    log_info "Configuring Admin (TCP 80) - Clients only (restricted)..."
    add_rules_for_ips "80" "tcp" "$ALLOWED_CLIENT_IPS" "Admin-Client"
else
    # Open mode: Allow from anywhere (protected by admin auth)
    log_info "Configuring Admin (TCP 80) - Open (protected by admin credentials)..."
    ufw allow 80/tcp comment "Admin-Open"
fi

# Enable UFW
log_info "Enabling UFW..."
ufw --force enable

# Show status
log_info "Firewall configuration complete. Current status:"
echo ""
ufw status verbose
echo ""

log_info "=== Summary ==="
log_info "SIP (5060/UDP): DIDWW only"
log_info "RTP (10000-10020/UDP): DIDWW only"
if [ -n "$ALLOWED_CLIENT_IPS" ]; then
    log_info "HTTP API (8080/TCP): DIDWW + configured clients (restricted)"
    log_info "Admin (80/TCP): Configured clients only (restricted)"
else
    log_info "HTTP API (8080/TCP): Open (protected by API_SECRET)"
    log_info "Admin (80/TCP): Open (protected by admin credentials)"
fi
log_info "SSH (22/TCP): Open"
log_info ""
log_info "To check status: ufw status numbered"
log_info "To disable: ufw disable"
log_info "To delete a rule: ufw delete <number>"
