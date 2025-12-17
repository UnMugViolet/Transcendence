#!/bin/bash

# Grafana User Provisioning Script
# This script creates additional users with restricted permissions in Grafana

set -e

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
elif [ -z "$ADMIN_USER" ] || [ -z "$GF_SECURITY_ADMIN_USER" ] || [ -z "$GF_SECURITY_ADMIN_PASSWORD" ] || [ -z "$GF_MONITOR_EMAIL" ] || [ -z "$GF_MONITOR_PASSWORD" ] || [ -z "$GF_EDITOR_EMAIL" ] || [ -z "$GF_EDITOR_PASSWORD" ] || [ -z "$GF_DEVELOPER_EMAIL" ] || [ -z "$GF_DEVELOPER_PASSWORD" ]; then
	echo "Error: Required environment variables are missing in .env file."
	exit 1
elif [ ! -f .env ]; then
    echo "Warning: .env file not found. Cannot run this script."
    exit 1
fi

GRAFANA_URL="http://localhost:10100"
ADMIN_USER="${GF_SECURITY_ADMIN_USER}"

# Pass
ADMIN_PASSWORD="${GF_SECURITY_ADMIN_PASSWORD}"
MONITOR_PASSWORD="${GF_MONITOR_PASSWORD}"
EDITOR_PASSWORD="${GF_EDITOR_PASSWORD}"
DEVELOPER_PASSWORD="${GF_DEVELOPER_PASSWORD}"



# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Grafana User Provisioning Script${NC}"
echo -e "${YELLOW}========================================${NC}"

# Wait for Grafana to be ready
echo -e "\n${YELLOW}Waiting for Grafana to be ready...${NC}"
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s -o /dev/null -w "%{http_code}" "${GRAFANA_URL}/api/health" | grep -q "200"; then
        echo -e "${GREEN}✓ Grafana is ready!${NC}"
        break
    fi
    attempt=$((attempt + 1))
    echo -e "Attempt ${attempt}/${max_attempts}..."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}✗ Grafana failed to start within expected time${NC}"
    exit 1
fi

# Function to create user
create_user() {
    local username=$1
    local email=$2
    local password=$3
    local role=$4  # Admin, Editor, or Viewer
    
    echo -e "\n${YELLOW}Creating user: ${username} (${role})${NC}"
    
    # Create user
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"${username}\",\"email\":\"${email}\",\"login\":\"${username}\",\"password\":\"${password}\",\"OrgId\":1}" \
        -u "${ADMIN_USER}:${ADMIN_PASSWORD}" \
        "${GRAFANA_URL}/api/admin/users" 2>&1)
    
    if echo "$response" | grep -q "User created"; then
        echo -e "${GREEN}✓ User ${username} created successfully${NC}"
        
        # Get user ID
        user_id=$(echo "$response" | grep -o '"id":[0-9]*' | grep -o '[0-9]*')
        
        # Update user role
        curl -s -X PATCH \
            -H "Content-Type: application/json" \
            -d "{\"role\":\"${role}\"}" \
            -u "${ADMIN_USER}:${ADMIN_PASSWORD}" \
            "${GRAFANA_URL}/api/org/users/${user_id}" > /dev/null
        
        echo -e "${GREEN}✓ User role set to ${role}${NC}"
    elif echo "$response" | grep -q "already exists"; then
        echo -e "${YELLOW}⚠ User ${username} already exists${NC}"
    else
        echo -e "${RED}✗ Failed to create user ${username}${NC}"
        echo -e "${RED}Response: ${response}${NC}"
    fi
}

# Create read-only viewer account for general monitoring
create_user "monitor" "${GF_MONITOR_EMAIL}" "${MONITOR_PASSWORD}" "Viewer"

# Create editor account for dashboard management (optional)
create_user "dashboard-editor" "${GF_EDITOR_EMAIL}" "${EDITOR_PASSWORD}" "Editor"

# Create developer viewer account
create_user "developer" "${GF_DEVELOPER_EMAIL}" "${DEVELOPER_PASSWORD}" "Viewer"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}User Provisioning Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${YELLOW}Created Users:${NC}"
echo -e "  - ${GREEN}monitor${NC} (Viewer) - Read-only access"
echo -e "  - ${GREEN}dashboard-editor${NC} (Editor) - Can edit dashboards"
echo -e "  - ${GREEN}developer${NC} (Viewer) - Read-only access"
echo -e "\n${YELLOW}Admin Account:${NC}"
echo -e "  - ${GREEN}${ADMIN_USER}${NC} (Admin) - Full access"
echo -e "\n${YELLOW}Access Grafana at:${NC} ${GRAFANA_URL}"
