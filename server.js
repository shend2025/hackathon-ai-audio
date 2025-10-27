const express = require('express');
const path = require('path');
const ftp = require('basic-ftp');
const fs = require('fs');
const { Readable } = require("stream");
const { v4: uuidv4 } = require('uuid');
const Database = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;

// 设置CORS中间件
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// 设置静态文件目录
app.use(express.static('.'));

// 设置JSON解析中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'audio-video-platform.html'));
});

// 数据库实例
let db = null;

// 初始化数据库
async function initDatabase() {
    try {
        db = new Database();
        await db.init();
        console.log('数据库初始化成功');
    } catch (error) {
        console.error('数据库初始化失败:', error);
        process.exit(1);
    }
}

// API路由 - 提取背景音乐
app.post('/api/extract-music', async (req, res) => {
    try {
        const { videoUrl } = req.body;
        const taskId = uuidv4();
        
        console.log('提取背景音乐请求:', { videoUrl, taskId });
        
        // 创建处理任务
        const task = {
            id: taskId,
            type: 'extract',
            title: '背景音乐提取',
            fileName: `${taskId}.mp3`,
            status: 'processing',
            downloadUrl: null
        };
        
        // 保存到数据库
        await db.insertTask(task);
        
        // 异步处理任务
        await processExtractMusic(taskId, videoUrl);
        
        res.json({
            success: true,
            taskId: taskId,
            message: '背景音乐提取已开始'
        });
    } catch (error) {
        console.error('提取背景音乐错误:', error);
        res.status(500).json({
            success: false,
            message: '提取背景音乐失败',
            error: error.message
        });
    }
});

// 异步处理音频提取
async function processExtractMusic(taskId, videoUrl) {
    try {
        const jenkinsUrl = `http://192.168.50.14:8080/job/remove_vocal/buildWithParameters`;
        
        // 生成时间戳确保每次请求的参数都不同，避免 Jenkins 去重
        const timestamp = Date.now();
        
        const params = new URLSearchParams({
            token: 'build_token',
            url: videoUrl,
            task_id: taskId,
            random: timestamp.toString()
        });
        
        const jenkinsApi = `${jenkinsUrl}?${params.toString()}`;
        
        console.log(`触发 Jenkins 构建: ${jenkinsApi}`);
        
        // 步骤1: 触发 Jenkins 构建
        const triggerResponse = await fetch(jenkinsApi, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!triggerResponse.ok) {
            throw new Error(`Jenkins 触发失败: ${triggerResponse.status} ${triggerResponse.statusText}`);
        }
        
        // Jenkins 触发成功会返回 201，并包含 queue item 的 URL
        const location = triggerResponse.headers.get('location');
        console.log('Jenkins 队列项:', location);
        
        if (!location) {
            throw new Error('无法获取 Jenkins 队列项');
        }
        
        // 步骤2: 从队列项获取构建号
        const buildNumber = await waitForBuildStart(location);
        
        console.log(`构建开始，构建号: ${buildNumber}`);
        
        // 步骤3: 轮询查询构建状态
        const buildResult = await pollBuildStatus('remove_vocal',buildNumber);
        
        console.log(`构建完成，状态: ${buildResult.result}`);
        
        // 步骤4: 根据结果更新任务状态
        if (buildResult.result === 'SUCCESS') {
            const downloadUrl = `http://192.168.50.11/ftp/music/${taskId}.mp3`;
            await db.updateTaskStatus(taskId, 'completed', downloadUrl);
            console.log(`音频提取任务 ${taskId} 完成`);
        } else {
            throw new Error(`构建失败: ${buildResult.result}`);
        }
        
    } catch (error) {
        console.error(`音频提取任务 ${taskId} 失败:`, error);
        await db.updateTaskStatus(taskId, 'failed');
    }
}


async function processSynthesizeVideo(taskId, videoUrl, uploadedFileUrl) {
    try {
        const jenkinsUrl = `http://192.168.50.14:8080/job/music_gen/buildWithParameters`;
        
        // 生成时间戳确保每次请求的参数都不同，避免 Jenkins 去重
        const timestamp = Date.now();
        
        const params = new URLSearchParams({
            token: 'build_token',
            url: videoUrl,
            task_id: taskId,
            uploaded_file_url: uploadedFileUrl,
            random: timestamp.toString()
        });
        
        const jenkinsApi = `${jenkinsUrl}?${params.toString()}`;
        
        console.log(`触发 Jenkins 构建: ${jenkinsApi}`);
        
        // 步骤1: 触发 Jenkins 构建
        const triggerResponse = await fetch(jenkinsApi, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!triggerResponse.ok) {
            throw new Error(`Jenkins 触发失败: ${triggerResponse.status} ${triggerResponse.statusText}`);
        }
        
        // Jenkins 触发成功会返回 201，并包含 queue item 的 URL
        const location = triggerResponse.headers.get('location');
        console.log('Jenkins 队列项:', location);
        
        if (!location) {
            throw new Error('无法获取 Jenkins 队列项');
        }
        
        // 步骤2: 从队列项获取构建号
        const buildNumber = await waitForBuildStart(location);
        
        console.log(`构建开始，构建号: ${buildNumber}`);
        
        // 步骤3: 轮询查询构建状态
        const buildResult = await pollBuildStatus('music_gen',buildNumber);
        
        console.log(`构建完成，状态: ${buildResult.result}`);
        
        // 步骤4: 根据结果更新任务状态
        if (buildResult.result === 'SUCCESS') {
            const downloadUrl = `http://192.168.50.11/ftp/music/${taskId}.mp3`;
            await db.updateTaskStatus(taskId, 'completed', downloadUrl);
            console.log(`音频提取任务 ${taskId} 完成`);
        } else {
            throw new Error(`构建失败: ${buildResult.result}`);
        }
        
    } catch (error) {
        console.error(`音频提取任务 ${taskId} 失败:`, error);
        await db.updateTaskStatus(taskId, 'failed');
    }
}

// 等待构建从队列开始执行
async function waitForBuildStart(queueUrl) {
    for (let i = 0; i < 30; i++) { // 最多等待 60 秒
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            const response = await fetch(`${queueUrl}/api/json`);
            const queueData = await response.json();
            
            if (queueData.executable) {
                // 构建已开始
                return queueData.executable.number;
            }
            
            if (queueData.cancelled) {
                throw new Error('Jenkins 构建被取消');
            }
            
            console.log(`等待构建从队列中开始... (${i + 1}/30)`);
        } catch (error) {
            console.error('查询队列状态失败:', error);
            throw error;
        }
    }
    
    throw new Error('构建超时未开始');
}

// 轮询查询构建状态
async function pollBuildStatus(jobName,buildNumber) {
    // const jobName = 'remove_vocal';
    const MAX_RETRIES = 300;
    const POLLING_INTERVAL = 2000;
    
    let lastResult = null;
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
        try {
            const buildUrl = `http://192.168.50.14:8080/job/${jobName}/${buildNumber}/api/json`;
            const response = await fetch(buildUrl);
            
            if (!response.ok) {
                throw new Error(`查询构建状态失败: ${response.status}`);
            }
            
            const buildData = await response.json();
            
            console.log(`构建状态: ${buildData.result || 'building'} (${retries + 1}/${MAX_RETRIES})`);
            
            // 如果构建完成
            if (buildData.result) {
                lastResult = buildData;
                break;
            }
            
            retries++;
            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
            
        } catch (error) {
            console.error('轮询构建状态失败:', error);
            throw error;
        }
    }
    
    if (!lastResult) {
        throw new Error('构建状态查询超时');
    }
    
    return lastResult;
}
// API路由 - 文件上传
app.post('/api/upload', async (req, res) => {
    // 推荐使用 multer 处理文件上传，但此处我们保持与原始代码一致的逻辑
    const { files } = req.body;

    if (!files || !Array.isArray(files)) {
        return res.status(400).json({ success: false, message: '未接收到有效的文件数据' });
    }

    console.log(`收到文件上传请求: ${files.length} 个文件`);

    const client = new ftp.Client();
    const uploadResults = {
        success: [],
        failed: []
    };

    try {
        // 1. 连接FTP服务器 (参数正确，且代码简洁)
        await client.access({
            host: '192.168.50.11',
            user: 'test',
            password: 'test',
            port: 21,
            secure: false // 如果是 FTPS, 设置为 true
        });

        console.log("FTP 连接成功");

        // 2. 遍历并上传文件
        for (const file of files) {
            const fileName = `upload_${Date.now()}_${file.name}`;
            
            try {
                // 解码 Base64
                const fileBuffer = Buffer.from(file.data.split(',')[1], 'base64');
                
                // 将 Buffer 转换为可读流 (basic-ftp 的 uploadFrom 更适合流)
                const readableStream = Readable.from(fileBuffer);

                // 上传文件 (代码简洁，无需 Promise 封装)
                await client.uploadFrom(readableStream, fileName);
                
                console.log(`文件 '${file.name}' 上传成功，保存为 '${fileName}'`);
                uploadResults.success.push({
                    originalName: file.name,
                    uploadedName: 'http://192.168.50.11/ftp/'+fileName,
                    size: fileBuffer.length
                });

            } catch (fileError) {
                console.error(`文件 '${file.name}' 上传失败:`, fileError.message);
                uploadResults.failed.push({
                    originalName: file.name,
                    error: fileError.message
                });
            }
        }

        res.json({
            success: true,
            message: '文件上传处理完成',
            results: uploadResults
        });

    } catch (error) {
        console.error('FTP 处理过程中发生严重错误:', error);
        res.status(500).json({
            success: false,
            message: '文件上传失败',
            error: error.message
        });
    } finally {
        // 4. 确保连接被关闭
        if (!client.closed) {
            await client.close();
            console.log("FTP 连接已关闭");
        }
    }
});

// API路由 - 智能制作视频
app.post('/api/synthesize-video', async (req, res) => {
    try {
        const { videoUrl, uploadedFileUrl } = req.body;
        
        // 生成UUID
        const taskId = uuidv4();
        
        const userUrl = `http://192.168.50.11/ftp/user_${taskId}.mp4`;

        console.log('智能制作视频请求:', { videoUrl, userUrl, taskId });
        
        // 创建处理任务
        const task = {
            id: taskId,
            type: 'synthesize',
            fileName: `${taskId}.mp3`,
            title: '视频制作',
            status: 'processing',
            downloadUrl: null
        };
        
        // 保存到数据库
        await db.insertTask(task);
        
        // 异步处理任务
         await processSynthesizeVideo(taskId, videoUrl, uploadedFileUrl);
        
        res.json({
            success: true,
            taskId: taskId,
            message: '视频制作已开始'
        });
    } catch (error) {
        console.error('智能制作视频错误:', error);
        res.status(500).json({
            success: false,
            message: '视频制作失败',
            error: error.message
        });
    }
});


const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

// 下载文件路由
app.get('/downloads/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(downloadsDir, filename);
    
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('文件不存在');
    }
});

// API路由 - 获取历史记录
app.get('/api/history', async (req, res) => {
    try {
        // 从数据库获取所有任务
        const allTasks = await db.getAllTasks();

        res.json({
            success: true,
            data: allTasks
        });
    } catch (error) {
        console.error('获取历史记录错误:', error);
        res.status(500).json({
            success: false,
            message: '获取历史记录失败',
            error: error.message
        });
    }
});

// API路由 - 删除历史记录
app.delete('/api/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`删除历史记录: ${id}`);
        
        // 从数据库删除记录
        const changes = await db.deleteTask(id);
        
        if (changes > 0) {
            res.json({
                success: true,
                message: '记录删除成功'
            });
        } else {
            res.status(404).json({
                success: false,
                message: '记录不存在'
            });
        }
    } catch (error) {
        console.error('删除历史记录错误:', error);
        res.status(500).json({
            success: false,
            message: '删除记录失败',
            error: error.message
        });
    }
});

// 健康检查路由
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 启动服务器
async function startServer() {
    try {
        // 初始化数据库
        await initDatabase();
        
        // 启动HTTP服务器
        app.listen(PORT, () => {
            console.log(`🚀 服务器已启动!`);
            console.log(`📱 本地访问地址: http://localhost:${PORT}`);
            console.log(`🌐 网络访问地址: http://0.0.0.0:${PORT}`);
            console.log(`📊 健康检查: http://localhost:${PORT}/health`);
            console.log(`📁 静态文件目录: ${__dirname}`);
            console.log(`🗄️ 数据库文件: ${path.join(__dirname, 'audio_video_history.db')}`);
            console.log(`⏰ 启动时间: ${new Date().toLocaleString()}`);
        });
    } catch (error) {
        console.error('服务器启动失败:', error);
        process.exit(1);
    }
}

startServer();

// 优雅关闭
process.on('SIGTERM', async () => {
    console.log('🛑 收到SIGTERM信号，正在关闭服务器...');
    if (db) {
        await db.close();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 收到SIGINT信号，正在关闭服务器...');
    if (db) {
        await db.close();
    }
    process.exit(0);
});
