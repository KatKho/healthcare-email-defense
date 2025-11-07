# 部署检查清单

## ✅ 已完成的准备工作

- [x] 修改 `server.js` 绑定到 `0.0.0.0`
- [x] 创建部署脚本 `deploy.sh`
- [x] 创建部署文档 `DEPLOYMENT.md` 和 `SERVER_DEPLOYMENT.md`
- [x] 所有页面文件已准备好（index.html, nurse-view.html, lead-view.html, it-admin-view.html）
- [x] package.json 配置正确

## 📋 需要在服务器上执行的步骤

### 步骤 1: 连接服务器
```bash
ssh <your_netid>@is-info492.ischool.uw.edu
```

### 步骤 2: 进入团队目录
```bash
cd ~/teams/teamX
pwd  # 确认路径
ls   # 查看文件
```

### 步骤 3: 上传项目文件

**选项 A: 使用 Git（如果已推送到 GitHub）**
```bash
git clone https://github.com/KatKho/healthcare-email-defense.git .
# 或者如果目录已存在
cd healthcare-email-defense
git pull
```

**选项 B: 使用 SCP 从本地上传**
在**本地终端**运行：
```bash
cd /Users/kaibo/Documents/GitHub/healthcare-email-defense
scp -r * <your_netid>@is-info492.ischool.uw.edu:~/teams/teamX/
```

### 步骤 4: 运行部署脚本
```bash
# 使用分配的端口（例如 8001）
chmod +x deploy.sh
./deploy.sh 8001
```

### 步骤 5: 启动服务器
```bash
npm start
```

### 步骤 6: 验证
- 服务器应该显示：`Healthcare Email Defense Demo running on http://0.0.0.0:8001`
- 在浏览器访问：`http://is-info492.ischool.uw.edu:8001`

## 📝 提交信息模板

在课程 #announcements 频道提交：

```
Team X — Healthcare — Defense
Demo: http://is-info492.ischool.uw.edu:8001
Test creds:
- Nurse: Smart Card Swipe → MFA (Demo code shown on screen)
- IT Admin: Smart Card Swipe → PIN: 123456 → MFA (Demo code with 30s countdown)
- Department Lead: Smart Card Swipe → MFA (Demo code shown on screen)
```

## 🔍 故障排除

如果遇到问题：

1. **端口被占用**：使用其他端口（8002, 8003 等）
2. **权限问题**：`chmod +x deploy.sh`
3. **依赖问题**：`rm -rf node_modules && npm install`
4. **Node 版本**：检查 `node --version`（需要 14+）

