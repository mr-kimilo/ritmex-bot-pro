@echo off
REM Windows多实例管理脚本

setlocal EnableDelayedExpansion

if "%1"=="" goto :help
if "%1"=="help" goto :help
if "%1"=="start" goto :start
if "%1"=="stop" goto :stop
if "%1"=="restart" goto :restart
if "%1"=="status" goto :status
if "%1"=="list" goto :list
goto :unknown

:help
echo.
echo === RitMex Bot 多实例管理器 ===
echo.
echo 用法: instance-manager.bat [命令] [实例名]
echo.
echo 命令:
echo   start ^<instance^>    启动指定实例
echo   stop ^<instance^>     停止指定实例  
echo   restart ^<instance^>  重启指定实例
echo   status             查看所有实例状态
echo   list               列出可用实例配置
echo   help               显示此帮助信息
echo.
echo 实例名:
echo   bnb                BNB交易实例
echo   sol                SOL交易实例
echo   bnb-sol            BNB账户-SOL交易
echo   bnb-aster          BNB账户-ASTER交易
echo   custom             自定义配置实例
echo.
echo 示例:
echo   instance-manager.bat start bnb
echo   instance-manager.bat stop sol
echo   instance-manager.bat status
echo.
goto :end

:start
if "%2"=="" (
    echo ❌ 请指定要启动的实例名
    echo 用法: %0 start ^<instance^>
    goto :end
)

echo 🚀 启动 %2 实例...

if "%2"=="bnb" (
    start "BNB-Instance" npm run start:bnb
    echo ✅ BNB实例已启动
) else if "%2"=="sol" (
    start "SOL-Instance" npm run start:sol
    echo ✅ SOL实例已启动
) else if "%2"=="bnb-sol" (
    start "BNB-SOL-Instance" npm run start:bnb-sol
    echo ✅ BNB-SOL实例已启动
) else if "%2"=="bnb-aster" (
    start "BNB-ASTER-Instance" npm run start:bnb-aster
    echo ✅ BNB-ASTER实例已启动
) else if "%2"=="custom" (
    if not exist ".env.custom" (
        echo ❌ 自定义配置文件 .env.custom 不存在
        goto :end
    )
    start "Custom-Instance" npm run start:custom -- --config=.env.custom
    echo ✅ 自定义实例已启动
) else (
    echo ❌ 未知实例: %2
    echo 可用实例: bnb, sol, bnb-sol, bnb-aster, custom
)
goto :end

:stop
if "%2"=="" (
    echo ❌ 请指定要停止的实例名
    echo 用法: %0 stop ^<instance^>
    goto :end
)

echo 🛑 停止 %2 实例...

if "%2"=="bnb" (
    taskkill /FI "WINDOWTITLE eq BNB-Instance*" /T /F >nul 2>&1
    echo ✅ BNB实例已停止
) else if "%2"=="sol" (
    taskkill /FI "WINDOWTITLE eq SOL-Instance*" /T /F >nul 2>&1
    echo ✅ SOL实例已停止
) else if "%2"=="custom" (
    taskkill /FI "WINDOWTITLE eq Custom-Instance*" /T /F >nul 2>&1
    echo ✅ 自定义实例已停止
) else (
    echo ❌ 未知实例: %2
    echo 可用实例: bnb, sol, custom
)
goto :end

:restart
if "%2"=="" (
    echo ❌ 请指定要重启的实例名
    echo 用法: %0 restart ^<instance^>
    goto :end
)

echo 🔄 重启 %2 实例...
call :stop %2
timeout /t 2 >nul
call :start %2
goto :end

:status
echo.
echo === 实例状态 ===
echo.

REM 检查BNB实例
tasklist /FI "WINDOWTITLE eq BNB-Instance*" 2>nul | find /i "node.exe" >nul
if !errorlevel! equ 0 (
    echo ✅ BNB: 运行中
) else (
    echo ❌ BNB: 已停止
)

REM 检查SOL实例
tasklist /FI "WINDOWTITLE eq SOL-Instance*" 2>nul | find /i "node.exe" >nul
if !errorlevel! equ 0 (
    echo ✅ SOL: 运行中
) else (
    echo ❌ SOL: 已停止
)

REM 检查自定义实例
tasklist /FI "WINDOWTITLE eq Custom-Instance*" 2>nul | find /i "node.exe" >nul
if !errorlevel! equ 0 (
    echo ✅ CUSTOM: 运行中
) else (
    echo ❌ CUSTOM: 已停止
)
goto :end

:list
echo.
echo === 可用配置文件 ===
echo.

if exist ".env.bnb" (
    for /f "tokens=2 delims==" %%a in ('findstr "TRADE_SYMBOL=" ".env.bnb"') do set bnb_symbol=%%a
    for /f "tokens=2 delims==" %%a in ('findstr "TRADE_AMOUNT=" ".env.bnb"') do set bnb_amount=%%a
    echo ✅ .env.bnb: !bnb_symbol! ^(数量: !bnb_amount!^)
) else (
    echo ❌ .env.bnb: 不存在
)

if exist ".env.sol" (
    for /f "tokens=2 delims==" %%a in ('findstr "TRADE_SYMBOL=" ".env.sol"') do set sol_symbol=%%a
    for /f "tokens=2 delims==" %%a in ('findstr "TRADE_AMOUNT=" ".env.sol"') do set sol_amount=%%a
    echo ✅ .env.sol: !sol_symbol! ^(数量: !sol_amount!^)
) else (
    echo ❌ .env.sol: 不存在
)

if exist ".env.custom" (
    for /f "tokens=2 delims==" %%a in ('findstr "TRADE_SYMBOL=" ".env.custom"') do set custom_symbol=%%a
    for /f "tokens=2 delims==" %%a in ('findstr "TRADE_AMOUNT=" ".env.custom"') do set custom_amount=%%a
    echo ✅ .env.custom: !custom_symbol! ^(数量: !custom_amount!^)
) else (
    echo ❌ .env.custom: 不存在
)
goto :end

:unknown
echo ❌ 未知命令: %1
call :help
goto :end

:end
