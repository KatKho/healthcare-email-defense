# Deployment Guide for Course Server

## Server Setup Instructions

### 1. SSH into the course server
```bash
ssh <your_netid>@is-info492.ischool.uw.edu
```

### 2. Navigate to your team directory
```bash
cd ~/teams/teamX
pwd
ls
```

### 3. Clone or upload your project
```bash
# If using git
git clone <your-repo-url> .

# Or upload files via SCP
```

### 4. Install dependencies
```bash
npm install
```

### 5. Set environment variables (if needed)
```bash
# Create .env file if needed
# PORT will be assigned by the course
```

### 6. Run the server
```bash
# Use your assigned port (e.g., 8001, 8002, etc.)
PORT=800X npm start

# Or set in .env file
# PORT=800X
npm start
```

### 7. Verify the server is running
- The server should bind to `0.0.0.0` (all interfaces)
- Accessible at: `http://is-info492.ischool.uw.edu:PORT`

## Test Credentials

### Nurse Login
- **Method**: Smart Card Swipe + MFA
- **Demo MFA Code**: Generated on screen (6 digits)
- **Access**: `http://is-info492.ischool.uw.edu:PORT/` or `index.html`

### Department Lead Login
- **Method**: Smart Card Swipe + MFA
- **Demo MFA Code**: Generated on screen (6 digits)
- **Access**: `http://is-info492.ischool.uw.edu:PORT/lead-view.html`

### IT Admin Login
- **Method**: Smart Card Swipe + PIN + MFA + Device Verification
- **Demo PIN**: `123456`
- **Demo MFA Code**: Generated on screen (6 digits, 30s countdown)
- **Access**: `http://is-info492.ischool.uw.edu:PORT/it-admin-view.html`

## Demo Flow

1. **Nurse View**: Login → View emails → Report suspicious email to IT
2. **IT Admin**: Receives report → Login with multi-stage authentication
3. **Department Lead**: Review quarantined emails → Release urgent emails

## Notes

- All data is synthetic/fake (no real patient data)
- All authentication is simulated (no real credentials required)
- Safe for lab environment
- No external API calls required for basic demo

