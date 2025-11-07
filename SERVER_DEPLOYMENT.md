# Course Server Deployment Guide

## Quick Deployment Steps

### 1. SSH to the server
```bash
ssh <your_netid>@is-info492.ischool.uw.edu
```

### 2. Navigate to team directory
```bash
cd ~/teams/team6
pwd
ls
```

### 3. Upload project files

**Option A: Using Git (Recommended)**
```bash
git clone https://github.com/KatKho/healthcare-email-defense.git .
# Or if directory exists, use git pull
```

**Option B: Using SCP from local machine**
Run in local terminal:
```bash
scp -r . <your_netid>@is-info492.ischool.uw.edu:~/teams/team6/
```

### 4. Run deployment script
```bash
# Use assigned port 8006
chmod +x deploy.sh
./deploy.sh 8006

# Or manually set
PORT=8006 npm install
echo "PORT=8006" > .env
```

### 5. Start the server
```bash
npm start
```

Server will run at `http://is-info492.ischool.uw.edu:8006`

## Verify Deployment

1. Check if server is running:
   ```bash
   ps aux | grep node
   ```

2. Check if port is listening:
   ```bash
   netstat -tuln | grep 8006
   ```

3. Test access (in browser):
   ```
   http://is-info492.ischool.uw.edu:8006
   ```

## Submission Format

Post in #announcements channel:

```
Team 6 — Healthcare — Defense
Demo: http://is-info492.ischool.uw.edu:8006
Test creds:
- Nurse Login: Smart Card Swipe → MFA (Demo code displayed on screen)
- IT Admin Login: Smart Card Swipe → PIN: 123456 → MFA (Demo code with 30s countdown)
- Department Lead Login: Smart Card Swipe → MFA (Demo code displayed on screen)
```

## Troubleshooting

### Port already in use
```bash
# Check port usage
lsof -i :8006

# Or use different port
PORT=8007 npm start
```

### Permission issues
```bash
chmod +x deploy.sh
chmod +x server.js
```

### Node.js version issues
```bash
node --version
# If version is too low, may need to use nvm
```

### Dependency installation fails
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Important Notes

- ✅ Server configured to bind to `0.0.0.0` (all interfaces)
- ✅ All data is synthetic, safe for lab environment
- ✅ No real API keys needed (if using OpenRouter, set environment variable)
- ✅ All authentication is simulated, no real credentials required
