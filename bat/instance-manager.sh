#!/bin/bash
# 多实例管理脚本

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo -e "${BLUE}=== RitMex Bot 多实例管理器 ===${NC}"
    echo ""
    echo "用法: ./instance-manager.sh [命令] [实例名]"
    echo ""
    echo "命令:"
    echo "  start <instance>    启动指定实例"
    echo "  stop <instance>     停止指定实例"
    echo "  restart <instance>  重启指定实例"
    echo "  status             查看所有实例状态"
    echo "  logs <instance>    查看实例日志"
    echo "  list               列出可用实例配置"
    echo "  help               显示此帮助信息"
    echo ""
    echo "实例名:"
    echo "  bnb                BNB交易实例"
    echo "  sol                SOL交易实例" 
    echo "  custom             自定义配置实例"
    echo ""
    echo "示例:"
    echo "  ./instance-manager.sh start bnb"
    echo "  ./instance-manager.sh stop sol"
    echo "  ./instance-manager.sh status"
}

# 启动实例
start_instance() {
    local instance=$1
    echo -e "${BLUE}🚀 启动 ${instance^^} 实例...${NC}"
    
    case $instance in
        "bnb")
            npm run start:bnb &
            echo $! > .pid.bnb
            echo -e "${GREEN}✅ BNB实例已启动 (PID: $!)${NC}"
            ;;
        "sol")
            npm run start:sol &
            echo $! > .pid.sol
            echo -e "${GREEN}✅ SOL实例已启动 (PID: $!)${NC}"
            ;;
        "custom")
            if [ ! -f ".env.custom" ]; then
                echo -e "${RED}❌ 自定义配置文件 .env.custom 不存在${NC}"
                return 1
            fi
            npm run start:custom -- --config=.env.custom &
            echo $! > .pid.custom
            echo -e "${GREEN}✅ 自定义实例已启动 (PID: $!)${NC}"
            ;;
        *)
            echo -e "${RED}❌ 未知实例: $instance${NC}"
            echo "可用实例: bnb, sol, custom"
            return 1
            ;;
    esac
}

# 停止实例
stop_instance() {
    local instance=$1
    local pid_file=".pid.$instance"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        echo -e "${YELLOW}🛑 停止 ${instance^^} 实例 (PID: $pid)...${NC}"
        
        if kill "$pid" 2>/dev/null; then
            rm "$pid_file"
            echo -e "${GREEN}✅ ${instance^^} 实例已停止${NC}"
        else
            echo -e "${RED}❌ 无法停止进程 $pid，可能已经停止${NC}"
            rm -f "$pid_file"
        fi
    else
        echo -e "${YELLOW}⚠️  ${instance^^} 实例未在运行${NC}"
    fi
}

# 重启实例
restart_instance() {
    local instance=$1
    echo -e "${BLUE}🔄 重启 ${instance^^} 实例...${NC}"
    stop_instance "$instance"
    sleep 2
    start_instance "$instance"
}

# 查看状态
show_status() {
    echo -e "${BLUE}=== 实例状态 ===${NC}"
    
    for instance in bnb sol custom; do
        local pid_file=".pid.$instance"
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${GREEN}✅ ${instance^^}: 运行中 (PID: $pid)${NC}"
            else
                echo -e "${RED}❌ ${instance^^}: 已停止 (PID文件过期)${NC}"
                rm "$pid_file"
            fi
        else
            echo -e "${YELLOW}⭕ ${instance^^}: 已停止${NC}"
        fi
    done
}

# 查看日志
show_logs() {
    local instance=$1
    local log_file="logs/${instance}.log"
    
    if [ -f "$log_file" ]; then
        echo -e "${BLUE}📋 ${instance^^} 实例日志:${NC}"
        tail -f "$log_file"
    else
        echo -e "${YELLOW}⚠️  日志文件 $log_file 不存在${NC}"
    fi
}

# 列出配置
list_configs() {
    echo -e "${BLUE}=== 可用配置文件 ===${NC}"
    
    for config in .env.bnb .env.sol .env.custom; do
        if [ -f "$config" ]; then
            local symbol=$(grep "TRADE_SYMBOL=" "$config" | cut -d'=' -f2)
            local amount=$(grep "TRADE_AMOUNT=" "$config" | cut -d'=' -f2)
            echo -e "${GREEN}✅ $config: $symbol (数量: $amount)${NC}"
        else
            echo -e "${RED}❌ $config: 不存在${NC}"
        fi
    done
}

# 主逻辑
case "${1:-help}" in
    "start")
        if [ -z "$2" ]; then
            echo -e "${RED}❌ 请指定要启动的实例名${NC}"
            echo "用法: $0 start <instance>"
            exit 1
        fi
        start_instance "$2"
        ;;
    "stop")
        if [ -z "$2" ]; then
            echo -e "${RED}❌ 请指定要停止的实例名${NC}"
            echo "用法: $0 stop <instance>"
            exit 1
        fi
        stop_instance "$2"
        ;;
    "restart")
        if [ -z "$2" ]; then
            echo -e "${RED}❌ 请指定要重启的实例名${NC}"
            echo "用法: $0 restart <instance>"
            exit 1
        fi
        restart_instance "$2"
        ;;
    "status")
        show_status
        ;;
    "logs")
        if [ -z "$2" ]; then
            echo -e "${RED}❌ 请指定要查看日志的实例名${NC}"
            echo "用法: $0 logs <instance>"
            exit 1
        fi
        show_logs "$2"
        ;;
    "list")
        list_configs
        ;;
    "help")
        show_help
        ;;
    *)
        echo -e "${RED}❌ 未知命令: $1${NC}"
        show_help
        exit 1
        ;;
esac
