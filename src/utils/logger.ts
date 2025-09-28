import { createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

export class Logger {
  private logDir: string;
  private logStream: NodeJS.WritableStream | null = null;
  private currentLogFile: string | null = null;
  private originalConsoleLog: typeof console.log;
  private originalConsoleError: typeof console.error;
  private originalConsoleWarn: typeof console.warn;
  private originalConsoleInfo: typeof console.info;

  constructor(logDir: string = "log") {
    this.logDir = logDir;
    
    // 保存原始的console方法
    this.originalConsoleLog = console.log.bind(console);
    this.originalConsoleError = console.error.bind(console);
    this.originalConsoleWarn = console.warn.bind(console);
    this.originalConsoleInfo = console.info.bind(console);
    
    this.initialize();
  }

  private initialize(): void {
    // 创建log目录（如果不存在）
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    // 清理旧的日志文件
    this.cleanOldLogs();

    // 创建新的日志文件
    this.createLogFile();

    // 重写console方法以同时输出到文件和控制台
    this.overrideConsoleMethods();
  }

  private cleanOldLogs(): void {
    try {
      const files = readdirSync(this.logDir);
      for (const file of files) {
        const filePath = join(this.logDir, file);
        unlinkSync(filePath);
        this.originalConsoleLog(`已清理日志文件: ${file}`);
      }
    } catch (error) {
      this.originalConsoleError("清理日志文件时出错:", error);
    }
  }

  private createLogFile(): void {
    const now = new Date();
    const timestamp = this.formatTimestamp(now);
    this.currentLogFile = join(this.logDir, `${timestamp}.log`);
    
    this.logStream = createWriteStream(this.currentLogFile, { flags: 'a' });
    this.originalConsoleLog(`日志文件已创建: ${this.currentLogFile}`);
    
    // 写入日志开始标记
    this.writeToFile(`\n=== 日志开始 ${timestamp} ===\n`);
  }

  private formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    // 使用下划线替代冒号，避免Windows文件名问题
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }

  private writeToFile(message: string): void {
    if (this.logStream) {
      const now = new Date();
      const localTimestamp = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');
      this.logStream.write(`[${localTimestamp}] ${message}\n`);
    }
  }

  private overrideConsoleMethods(): void {
    // 重写console.log
    console.log = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      this.originalConsoleLog(...args);
      this.writeToFile(`[LOG] ${message}`);
    };

    // 重写console.error
    console.error = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      this.originalConsoleError(...args);
      this.writeToFile(`[ERROR] ${message}`);
    };

    // 重写console.warn
    console.warn = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      this.originalConsoleWarn(...args);
      this.writeToFile(`[WARN] ${message}`);
    };

    // 重写console.info
    console.info = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      this.originalConsoleInfo(...args);
      this.writeToFile(`[INFO] ${message}`);
    };
  }

  public close(): void {
    if (this.logStream) {
      this.writeToFile(`=== 日志结束 ${this.formatTimestamp(new Date())} ===\n`);
      this.logStream.end();
      this.logStream = null;
    }

    // 恢复原始的console方法
    console.log = this.originalConsoleLog;
    console.error = this.originalConsoleError;
    console.warn = this.originalConsoleWarn;
    console.info = this.originalConsoleInfo;
  }

  public getLogFile(): string | null {
    return this.currentLogFile;
  }

  // 直接写入日志文件的方法（不依赖console重写）
  public writeLog(level: 'LOG' | 'ERROR' | 'WARN' | 'INFO', message: string): void {
    this.writeToFile(`[${level}] ${message}`);
  }

  // 写入交易事件日志
  public writeTrade(message: string): void {
    this.writeToFile(`[TRADE] ${message}`);
  }

  // 写入系统事件日志
  public writeSystem(message: string): void {
    this.writeToFile(`[SYSTEM] ${message}`);
  }
}

// 创建全局logger实例
export const logger = new Logger();

// 处理进程退出时关闭日志
process.on('exit', () => {
  logger.close();
});

process.on('SIGINT', () => {
  logger.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.close();
  process.exit(0);
});
