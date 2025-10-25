const express = require('express');
const path = require('path');
const ftp = require('basic-ftp');
const fs = require('fs');
const { Readable } = require("stream");
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
        const taskId = `extract_${Date.now()}`;
        
        console.log('提取背景音乐请求:', { videoUrl, taskId });
        
        // 创建处理任务
        const task = {
            id: taskId,
            type: 'extract',
            title: '背景音乐提取',
            fileName: `background-music-${Date.now()}.mp3`,
            fileSize: '3.2 MB',
            duration: '2:15',
            status: 'processing',
            downloadUrl: null
        };
        
        // 保存到数据库
        await db.insertTask(task);
        
        // 异步处理任务
        processExtractMusic(taskId, videoUrl);
        
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
        // 模拟处理步骤
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 更新任务状态到数据库
        const downloadUrl = `http://localhost:${PORT}/downloads/extracted-music-${Date.now()}.mp3`;
        await db.updateTaskStatus(taskId, 'completed', downloadUrl);
        
        console.log(`音频提取任务 ${taskId} 完成`);
    } catch (error) {
        console.error(`音频提取任务 ${taskId} 失败:`, error);
        await db.updateTaskStatus(taskId, 'failed');
    }
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
                    uploadedName: fileName,
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
        const taskId = `synthesize_${Date.now()}`;
        
        console.log('智能制作视频请求:', { videoUrl, uploadedFileUrl, taskId });
        
        // 创建处理任务
        const task = {
            id: taskId,
            type: 'synthesize',
            title: '视频制作',
            fileName: `synthesized-video-${Date.now()}.mp4`,
            fileSize: '15.8 MB',
            duration: '3:45',
            status: 'processing',
            downloadUrl: null
        };
        
        // 保存到数据库
        await db.insertTask(task);
        
        // 异步处理任务
        processSynthesizeVideo(taskId, videoUrl, uploadedFileUrl);
        
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

// 异步处理视频合成
async function processSynthesizeVideo(taskId, videoUrl, uploadedFileUrl) {
    try {
        // 模拟处理步骤
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 更新任务状态到数据库
        const downloadUrl = `http://localhost:${PORT}/downloads/synthesized-video-${Date.now()}.mp4`;
        await db.updateTaskStatus(taskId, 'completed', downloadUrl);
        
        console.log(`视频合成任务 ${taskId} 完成`);
    } catch (error) {
        console.error(`视频合成任务 ${taskId} 失败:`, error);
        await db.updateTaskStatus(taskId, 'failed');
    }
}

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
