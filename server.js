const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 存储客户端连接星河改改改！！！！
let clients = new Set();

// 存储当前运行的任务进程星河改改改！！！！
let taskProcess = null;

// 提供静态文件星河改改改！！！！
app.use(express.static(path.join(__dirname, 'public')));

// 发送日志到所有客户端星河改改改！！！！
function broadcastLog(message, level = 'info') {
  const data = JSON.stringify({
    type: 'log',
    message: message,
    level: level
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// 广播任务状态
function broadcastStatus(status) {
  const data = JSON.stringify({
    type: 'status',
    status: status
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// 处理WebSocket连接
wss.on('connection', (ws) => {
  console.log('新客户端连接');
  clients.add(ws);

  // 发送当前任务状态
  ws.send(JSON.stringify({
    type: 'status',
    status: taskProcess ? 'running' : 'stopped'
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.command) {
        case 'testConnection':
          testConnection();
          break;

        case 'startTask':
          startTask(data.data);
          break;

        case 'stopTask':
          stopTask();
          break;
      }
    } catch (error) {
      console.error('WebSocket消息处理错误:', error);
      ws.send(JSON.stringify({
        type: 'log',
        message: `服务器错误: ${error.message}`,
        level: 'error'
      }));
    }
  });

  ws.on('close', () => {
    console.log('客户端断开连接');
    clients.delete(ws);
  });
});

// 测试连接星河改改改！！！！
function testConnection() {
  broadcastLog('正在测试连接...', 'info');

  // 简单的连接测试星河改改改！！！！
  try {
    // 检查必要的模块是否存在
    const requiredModules = ['axios', 'socks-proxy-agent', 'querystring'];
    requiredModules.forEach(module => {
      require.resolve(module);
    });

    broadcastLog('连接测试成功，所有必要模块已安装', 'success');
  } catch (error) {
    broadcastLog(`连接测试失败: ${error.message}`, 'error');
  }
}

// 开始任务（修复：暂时性死区 + 脚本双重执行 + 日志重复 + Cookie编码）
function startTask(config) {
  if (taskProcess) {
    broadcastLog('已有任务在运行中', 'warning');
    return;
  }

  broadcastLog('开始执行任务...', 'info');

  // 创建临时脚本文件
  const scriptPath = path.join(__dirname, 'temp_script.js');

  // 读取原始脚本内容
  fs.readFile('星河快手极速版.js', 'utf8', (err, rawScript) => {
    if (err) {
      broadcastLog(`无法读取脚本文件: ${err.message}`, 'error');
      return;
    }

    // 步骤1：屏蔽原始脚本的自动执行逻辑（匹配常见格式）
    let modifiedRawScript = rawScript
        // 屏蔽 (async () => { ... })(); 格式
        .replace(/\(async \(\) => \{[\s\S]*?\}\)\(\);/g, '/* 原始自动执行逻辑已被禁用 */')
        // 屏蔽 (() => { ... })(); 格式
        .replace(/\(\(\) => \{[\s\S]*?\}\)\(\);/g, '/* 原始自动执行逻辑已被禁用 */')
        // 屏蔽 main(); 或 run(); 等直接执行函数
        .replace(/^\s*(main|run)\(\);/gm, '/* 原始执行函数已被禁用 */');

    // 步骤2：对Cookie进行URL解码 + 分割并过滤空账号
    const decodedKsck = decodeURIComponent(config.ksck);
    const validAccounts = decodedKsck.split('&').map(acc => acc.trim()).filter(acc => acc);
    broadcastLog(`已解码Cookie，共识别 ${validAccounts.length} 个有效账号`, 'info');

    // 步骤3：注入配置参数和自定义执行逻辑（放在原始脚本之后，避免暂时性死区）
    const injectScript = `
      // ===== 系统注入配置参数 =====
      process.env.KSROUNDS = ${config.rounds};
      process.env.KSCOIN_LIMIT = ${config.coinLimit};
      process.env.KS_AdMinTime = ${config.adMinTime};
      process.env.KS_AdMaxTime = ${config.adMaxTime};
      process.env.KS_TaskInterval = ${config.taskInterval};
      process.env.KS_RoundInterval = ${config.roundInterval};
      process.env.KS_AccountInterval = ${config.accountInterval};
      process.env.Task = '${config.tasks.join(',')}';
      process.env.ksck = '${decodedKsck}'; // 使用解码后的原始Cookie
      
      // ===== 日志重定向（仅IPC通道，无重复输出）=====
      console.log = function(...args) {
        process.send({ type: 'log', message: args.join(' ') });
      };
      
      console.error = function(...args) {
        process.send({ type: 'error', message: args.join(' ') });
      };
      
      // ===== 自定义任务执行逻辑（仅执行一次，避免重复）=====
      (async () => {
        try {
          // 先判断核心函数是否存在，避免未定义报错
          if (typeof loadAccountsFromEnv !== 'function' || typeof processAccount !== 'function') {
            console.error('原始脚本缺少核心函数（loadAccountsFromEnv/processAccount），任务终止');
            process.exit(1);
          }
          
          // 加载账号配置
          const accounts = loadAccountsFromEnv();
          if (!accounts || accounts.length === 0) {
            console.log('未加载到有效账号，任务终止');
            process.exit(0);
          }
          console.log(\`共加载 \${accounts.length} 个有效账号\`);
          
          // 执行多轮任务
          for (let round = 1; round <= ${config.rounds}; round++) {
            console.log(\`\\n===== 开始第 \${round} 轮任务 =====\`);
            
            // 逐个处理账号（带账号间隔）
            for (let accountIndex = 0; accountIndex < accounts.length; accountIndex++) {
              const accountConfig = accounts[accountIndex];
              
              // 非第一个账号，添加账号间隔
              if (accountIndex > 0) {
                const accountWaitTime = ${config.accountInterval} * 1000;
                console.log(\`等待 \${accountWaitTime / 1000} 秒后处理下一个账号\`);
                await new Promise(resolve => setTimeout(resolve, accountWaitTime));
              }
              
              // 执行单个账号任务
              console.log(\`—— 🚀 开始账号[\${accountIndex + 1}] ——\`);
              await processAccount(accountConfig);
            }
            
            // 非最后一轮，添加轮次间隔
            if (round < ${config.rounds}) {
              const roundWaitTime = ${config.roundInterval} * 1000;
              console.log(\`第 \${round} 轮任务完成，等待 \${roundWaitTime / 1000} 秒后开始下一轮\`);
              await new Promise(resolve => setTimeout(resolve, roundWaitTime));
            }
          }
          
          console.log('\\n所有任务轮次已完成，任务结束');
          process.exit(0);
        } catch (error) {
          console.error('任务执行异常:', error.message || error);
          process.exit(1);
        }
      })();
    `;

    // 步骤4：调整脚本合并顺序（关键修复）：原始脚本 → 注入逻辑
    // 让原始脚本的变量先初始化，再执行注入逻辑，避免暂时性死区
    const finalScript = modifiedRawScript + '\n' + injectScript;

    // 写入临时脚本文件
    fs.writeFile(scriptPath, finalScript, (err) => {
      if (err) {
        broadcastLog(`无法创建临时脚本: ${err.message}`, 'error');
        return;
      }

      // 启动子进程（忽略stdout/stderr，仅保留IPC通道）
      taskProcess = spawn('node', [scriptPath], {
        stdio: ['pipe', 'ignore', 'ignore', 'ipc']
      });

      broadcastStatus('running');

      // 仅监听IPC消息，避免日志重复
      taskProcess.on('message', (msg) => {
        if (msg.type === 'log') {
          broadcastLog(msg.message);
        } else if (msg.type === 'error') {
          broadcastLog(msg.message, 'error');
        }
      });

      // 子进程退出处理
      taskProcess.on('exit', (code) => {
        const logLevel = code === 0 ? 'success' : 'error';
        broadcastLog(`任务进程已退出，退出码: ${code}`, logLevel);
        taskProcess = null;
        broadcastStatus('stopped');

        // 清理临时文件
        fs.unlink(scriptPath, (err) => {
          if (err) console.error('清理临时脚本失败:', err);
        });
      });

      // 子进程错误处理
      taskProcess.on('error', (err) => {
        broadcastLog(`任务进程启动失败: ${err.message}`, 'error');
        taskProcess = null;
        broadcastStatus('stopped');

        // 清理临时文件
        fs.unlink(scriptPath, (err) => {
          if (err) console.error('清理临时脚本失败:', err);
        });
      });
    });
  });
}

// 停止任务
function stopTask() {
  if (!taskProcess) {
    broadcastLog('没有正在运行的任务', 'warning');
    return;
  }

  broadcastLog('正在停止任务...', 'info');

  // 优雅终止进程
  taskProcess.kill('SIGINT');

  // 5秒后强制终止（若未退出）
  setTimeout(() => {
    if (taskProcess) {
      broadcastLog('任务进程未响应，强制终止', 'warning');
      taskProcess.kill('SIGKILL');
    }
  }, 5000);
}

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器已启动，监听端口: ${PORT}`);
  console.log(`访问地址: http://localhost:${PORT}`);
});

// 进程退出清理
process.on('SIGINT', () => {
  if (taskProcess) {
    taskProcess.kill();
  }
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});