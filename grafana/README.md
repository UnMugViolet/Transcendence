# Grafana Security and User Management

## Overview

This Grafana setup implements secure authentication and access control mechanisms to protect sensitive monitoring data.

## Security Features

### 1. **Authentication**
- Admin credentials stored in environment variables (`.env` file)
- User signup disabled by default
- Anonymous access disabled
- Basic authentication enabled

### 2. **User Roles**

Grafana has three main roles with different permission levels:

| Role | Permissions | Use Case |
|------|-------------|----------|
| **Admin** | Full access - create/edit/delete dashboards, manage users, change settings | System administrators |
| **Editor** | Create and edit dashboards, view and edit data sources | Dashboard managers |
| **Viewer** | Read-only access to dashboards and data | Monitoring users, developers |

### 3. **Additional Security Hardening**
- Cookie security with SameSite strict policy
- Gravatar disabled
- Embedding disabled
- External snapshots disabled
- Public dashboards disabled
- Organization creation restricted

## User Provisioning

### Automatic User Creation

Run the provisioning script to create additional users:

```bash
# Make the script executable (first time only)
chmod +x grafana/provision-users.sh

# Run the script (Grafana must be running)
./grafana/provision-users.sh
```

### Default Provisioned Users

The script creates the following users:

1. **monitor** (Viewer)
   - Username: `monitor`
   - Email: `$GF_MONITOR_EMAIL`
   - Password: `$GF_MONITOR_PASSWORD`
   - Purpose: Read-only monitoring access

2. **dashboard-editor** (Editor)
   - Username: `dashboard-editor`
   - Email: `$GF_EDITOR_EMAIL`
   - Password: `$GF_EDITOR_PASSWORD`
   - Purpose: Dashboard management

3. **developer** (Viewer)
   - Username: `developer`
   - Email: `$GF_DEVELOPER_EMAIL`
   - Password: `$GF_DEVELOPER_PASSWORD`
   - Purpose: Development team monitoring

### Manual User Creation

You can also create users manually through the Grafana UI:

1. Login as admin at http://localhost:10100
2. Go to **Configuration** → **Users**
3. Click **New user**
4. Fill in the details and select the appropriate role
5. Click **Create user**

### Creating Users via API

```bash
# Create a new user
curl -X POST http://localhost:10100/api/admin/users \
  -H "Content-Type: application/json" \
  -u "admin:your_admin_password" \
  -d '{
    "name": "New User",
    "email": "user@example.com",
    "login": "newuser",
    "password": "SecurePassword123",
    "OrgId": 1
  }'

# Update user role
curl -X PATCH http://localhost:10100/api/org/users/{userId} \
  -H "Content-Type: application/json" \
  -u "admin:your_admin_password" \
  -d '{
    "role": "Viewer"
  }'
```

## Access Control

### Dashboard Permissions

You can set specific permissions for each dashboard:

1. Open a dashboard
2. Click the dashboard settings icon (gear)
3. Go to **Permissions**
4. Add users or teams with specific roles

### Folder Permissions

Organize dashboards in folders with specific permissions:

1. Create a folder in **Dashboards**
2. Set permissions for the folder
3. All dashboards in the folder inherit these permissions

## Best Practices

### Production Deployment

For production, update the following in `.env`:

```env
# Use strong, randomly generated passwords
GF_SECURITY_ADMIN_PASSWORD=<strong-random-password>

```

### Password Policy

- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, and special characters
- Avoid common words or patterns
- Rotate passwords regularly

### Network Security

The current setup exposes Grafana on port 10100. For production:

1. **Use a reverse proxy** (nginx, traefik) with SSL/TLS
2. **Implement rate limiting** to prevent brute force attacks
3. **Use VPN or IP whitelisting** to restrict access
4. **Enable HTTPS** by setting `protocol = https` in grafana.ini

### Monitoring Access

- Regularly review user access logs
- Audit dashboard permissions
- Remove inactive users
- Monitor failed login attempts

## Configuration Files

- **grafana.ini**: Main Grafana configuration file
- **datasources/prometheus.yml**: Prometheus data source configuration
- **dashboards/**: Dashboard provisioning directory

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GF_SECURITY_ADMIN_USER` | Admin username | Yes |
| `GF_SECURITY_ADMIN_PASSWORD` | Admin password | Yes |
| `GF_MONITOR_EMAIL` | Monitor user email | Yes |
| `GF_MONITOR_PASSWORD` | Monitor user email | Yes |
| `GF_EDITOR_EMAIL` | Editor user email | Yes |
| `GF_EDITOR_PASSWORD` | Editor user email | Yes |
| `GF_DEVELOPER_EMAIL` | Dev user email | Yes |
| `GF_DEVELOPER_PASSWORD` | Dev user email | Yes |


## Troubleshooting

### Cannot Login

1. Check if Grafana is running: `docker ps | grep grafana`
2. Verify environment variables: `docker exec transcendence_grafana env | grep GF_`
3. Check logs: `docker logs transcendence_grafana`

### User Already Exists

The provisioning script will skip users that already exist. To reset:

```bash
# Remove Grafana data volume
docker compose down
docker volume rm transcendence_grafana_data_dev
docker compose up -d
```

### Permission Denied

Ensure the user has the correct role for the action they're trying to perform.

## Additional Resources

- [Grafana User Management](https://grafana.com/docs/grafana/latest/administration/user-management/)
- [Grafana Security](https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/)
- [Grafana API Reference](https://grafana.com/docs/grafana/latest/developers/http_api/)
