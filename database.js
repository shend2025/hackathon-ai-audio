const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, 'audio_video_history.db');
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('数据库连接失败:', err);
                    reject(err);
                } else {
                    console.log('数据库连接成功');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        return new Promise((resolve, reject) => {
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS task_history (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    file_size TEXT,
                    duration TEXT,
                    status TEXT NOT NULL,
                    download_url TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            this.db.run(createTableSQL, (err) => {
                if (err) {
                    console.error('创建表失败:', err);
                    reject(err);
                } else {
                    console.log('数据表创建成功');
                    resolve();
                }
            });
        });
    }

    async insertTask(task) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO task_history 
                (id, type, title, file_name, file_size, duration, status, download_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                task.id,
                task.type,
                task.title,
                task.fileName,
                task.fileSize,
                task.duration,
                task.status,
                task.downloadUrl
            ];

            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('插入任务失败:', err);
                    reject(err);
                } else {
                    console.log(`任务 ${task.id} 插入成功`);
                    resolve(this.lastID);
                }
            });
        });
    }

    async updateTaskStatus(taskId, status, downloadUrl = null) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE task_history 
                SET status = ?, download_url = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            
            const params = [status, downloadUrl, taskId];

            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('更新任务状态失败:', err);
                    reject(err);
                } else {
                    console.log(`任务 ${taskId} 状态更新为 ${status}`);
                    resolve(this.changes);
                }
            });
        });
    }

    async getAllTasks() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM task_history 
                ORDER BY created_at DESC
            `;

            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('查询任务失败:', err);
                    reject(err);
                } else {
                    const tasks = rows.map(row => ({
                        id: row.id,
                        type: row.type,
                        title: row.title,
                        fileName: row.file_name,
                        fileSize: row.file_size,
                        duration: row.duration,
                        status: row.status,
                        downloadUrl: row.download_url,
                        createdAt: row.created_at
                    }));
                    resolve(tasks);
                }
            });
        });
    }

    async deleteTask(taskId) {
        return new Promise((resolve, reject) => {
            const sql = `DELETE FROM task_history WHERE id = ?`;

            this.db.run(sql, [taskId], function(err) {
                if (err) {
                    console.error('删除任务失败:', err);
                    reject(err);
                } else {
                    console.log(`任务 ${taskId} 删除成功`);
                    resolve(this.changes);
                }
            });
        });
    }

    async getTaskById(taskId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM task_history WHERE id = ?`;

            this.db.get(sql, [taskId], (err, row) => {
                if (err) {
                    console.error('查询任务失败:', err);
                    reject(err);
                } else if (row) {
                    const task = {
                        id: row.id,
                        type: row.type,
                        title: row.title,
                        fileName: row.file_name,
                        fileSize: row.file_size,
                        duration: row.duration,
                        status: row.status,
                        downloadUrl: row.download_url,
                        createdAt: row.created_at
                    };
                    resolve(task);
                } else {
                    resolve(null);
                }
            });
        });
    }

    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('关闭数据库失败:', err);
                    } else {
                        console.log('数据库连接已关闭');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = Database;
