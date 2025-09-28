export interface TradeLogEntry {
  time: string;
  type: string;
  detail: string;
}

export function createTradeLog(maxEntries: number, seed: TradeLogEntry[] = []) {
  const entries: TradeLogEntry[] = seed.slice(-maxEntries);
  
  function push(type: string, detail: string) {
    const timestamp = new Date().toLocaleString();
    entries.push({ time: timestamp, type, detail });
    
    // 同时输出到控制台（会被日志系统捕获并写入文件）
    // 直接输出detail，不添加额外的类型标签（避免重复）
    switch (type.toLowerCase()) {
      case 'error':
        console.error(detail);
        break;
      case 'warning':
      case 'warn':
        console.warn(detail);
        break;
      case 'info':
        console.info(detail);
        break;
      default:
        console.log(detail);
        break;
    }
    
    if (entries.length > maxEntries) {
      entries.shift();
    }
  }
  
  function all() {
    return entries;
  }
  
  function replace(next: TradeLogEntry[]) {
    entries.splice(0, entries.length, ...next.slice(-maxEntries));
  }
  
  return { push, all, replace };
}
