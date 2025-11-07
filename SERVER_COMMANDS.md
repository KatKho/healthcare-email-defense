# Server Commands (Copy & Paste Ready)

## Complete Command Sequence to Execute on Server

### 1. SSH Connection
```bash
ssh <your_netid>@is-info492.ischool.uw.edu
```

### 2. Navigate to Team Directory
```bash
cd ~/teams/team6
pwd
ls
```

### 3. Clone or Update Project
```bash
# If directory is empty, clone project
git clone https://github.com/KatKho/healthcare-email-defense.git .

# If directory exists, enter and update
cd healthcare-email-defense
git pull
```

### 4. Set Permissions and Run Deployment Script
```bash
chmod +x deploy.sh
./deploy.sh 8006
```

### 5. Start Server
```bash
npm start
```

### 6. Keep Server Running (using screen or tmux)

**Using screen (Recommended)**
```bash
# Create new screen session
screen -S healthcare-demo

# Start server in screen
PORT=8006 npm start

# Press Ctrl+A then D to detach (server keeps running)
# Reconnect: screen -r healthcare-demo
```

**Or using nohup**
```bash
nohup npm start > server.log 2>&1 &
```

### 7. Verify Server is Running
```bash
# Check process
ps aux | grep node

# Check port
netstat -tuln | grep 8006

# View logs (if using nohup)
tail -f server.log
```

## Quick One-Line Deployment

```bash
cd ~/teams/team6 && \
git clone https://github.com/KatKho/healthcare-email-defense.git . && \
chmod +x deploy.sh && \
./deploy.sh 8006 && \
npm start
```

## Stop Server

```bash
# Find process
ps aux | grep node

# Stop process (replace PID with actual process number)
kill <PID>

# Or force stop
pkill -f "node server.js"
```
