# Deployment Checklist

## ✅ Completed Preparations

- [x] Modified `server.js` to bind to `0.0.0.0`
- [x] Created deployment script `deploy.sh`
- [x] Created deployment docs `DEPLOYMENT.md` and `SERVER_DEPLOYMENT.md`
- [x] All page files ready (index.html, nurse-view.html, lead-view.html, it-admin-view.html)
- [x] package.json configured correctly

## 📋 Steps to Execute on Server

### Step 1: Connect to server
```bash
ssh <your_netid>@is-info492.ischool.uw.edu
```

### Step 2: Navigate to team directory
```bash
cd ~/teams/team6
pwd  # Confirm path
ls   # View files
```

### Step 3: Upload project files

**Option A: Using Git (if pushed to GitHub)**
```bash
git clone https://github.com/KatKho/healthcare-email-defense.git .
# Or if directory exists
cd healthcare-email-defense
git pull
```

**Option B: Using SCP from local**
Run in **local terminal**:
```bash
cd /Users/kaibo/Documents/GitHub/healthcare-email-defense
scp -r * <your_netid>@is-info492.ischool.uw.edu:~/teams/team6/
```

### Step 4: Run deployment script
```bash
# Use assigned port 8006
chmod +x deploy.sh
./deploy.sh 8006
```

### Step 5: Start server
```bash
npm start
```

### Step 6: Verify
- Server should show: `Healthcare Email Defense Demo running on http://0.0.0.0:8006`
- Access in browser: `http://is-info492.ischool.uw.edu:8006`

## 📝 Submission Template

Post in course #announcements channel:

```
Team 6 — Healthcare — Defense
Demo: http://is-info492.ischool.uw.edu:8006
Test creds:
- Nurse: Smart Card Swipe → MFA (Demo code shown on screen)
- IT Admin: Smart Card Swipe → PIN: 123456 → MFA (Demo code with 30s countdown)
- Department Lead: Smart Card Swipe → MFA (Demo code shown on screen)
```

## 🔍 Troubleshooting

If you encounter issues:

1. **Port in use**: Use different port (8002, 8003, etc.)
2. **Permission issues**: `chmod +x deploy.sh`
3. **Dependency issues**: `rm -rf node_modules && npm install`
4. **Node version**: Check `node --version` (requires 14+)
