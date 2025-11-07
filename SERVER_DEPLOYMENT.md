# 课程服务器部署指南

## 快速部署步骤

### 1. SSH 连接到服务器
```bash
ssh <your_netid>@is-info492.ischool.uw.edu
```

### 2. 进入团队目录
```bash
cd ~/teams/teamX
pwd
ls
```

### 3. 上传项目文件
你可以选择以下方式之一：

**方式 A: 使用 Git（推荐）**
```bash
git clone <your-repo-url> .
# 或者如果已经存在，使用 git pull
```

**方式 B: 使用 SCP 从本地上传**
在本地终端运行：
```bash
scp -r . <your_netid>@is-info492.ischool.uw.edu:~/teams/teamX/
```

### 4. 运行部署脚本
```bash
# 使用分配的端口（例如 8001）
./deploy.sh 8001

# 或者手动设置
PORT=8001 npm install
echo "PORT=8001" > .env
```

### 5. 启动服务器
```bash
npm start
```

服务器将在 `http://is-info492.ischool.uw.edu:8001` 上运行

## 验证部署

1. 检查服务器是否运行：
   ```bash
   ps aux | grep node
   ```

2. 检查端口是否监听：
   ```bash
   netstat -tuln | grep 8001
   ```

3. 测试访问（在浏览器中）：
   ```
   http://is-info492.ischool.uw.edu:8001
   ```

## 提交信息格式

在 #announcements 频道提交：

```
Team X — Healthcare — Defense
Demo: http://is-info492.ischool.uw.edu:8001
Test creds:
- Nurse Login: Smart Card Swipe → MFA (Demo code displayed on screen)
- IT Admin Login: Smart Card Swipe → PIN: 123456 → MFA (Demo code with 30s countdown)
- Department Lead Login: Smart Card Swipe → MFA (Demo code displayed on screen)
```

## 故障排除

### 端口已被占用
```bash
# 检查端口使用情况
lsof -i :8001

# 或使用其他端口
PORT=8002 npm start
```

### 权限问题
```bash
chmod +x deploy.sh
chmod +x server.js
```

### Node.js 版本问题
```bash
node --version
# 如果版本太低，可能需要使用 nvm
```

### 依赖安装失败
```bash
# 清除缓存重新安装
rm -rf node_modules package-lock.json
npm install
```

## 重要提示

- ✅ 服务器已配置为绑定到 `0.0.0.0`（所有接口）
- ✅ 所有数据都是合成的，安全用于实验室环境
- ✅ 不需要真实的 API 密钥（如果使用 OpenRouter，需要设置环境变量）
- ✅ 所有认证都是模拟的，不需要真实凭据

