@echo off

:start
echo ========================================
echo       Multi-API Trading System
echo ========================================
echo.
echo Quick Actions:
echo.
echo [1] Check System Status
echo     bat\status.bat
echo.
echo [2] Validate Configuration  
echo     bat\validate-config.bat
echo.
echo [3] Start BNB-SOL Instance
echo     npm run start:bnb-sol
echo.
echo [4] Start BNB-ASTER Instance
echo     npm run start:bnb-aster
echo.
echo [5] Run All Tests
echo     npm run test:api
echo.
echo [0] Exit
echo.
echo ========================================
set /p choice=Select an option (0-5): 

if "%choice%"=="1" call bat\status.bat & goto :start
if "%choice%"=="2" call bat\validate-config.bat & goto :start
if "%choice%"=="3" start "BNB-SOL" cmd /k npm run start:bnb-sol & goto :start
if "%choice%"=="4" start "BNB-ASTER" cmd /k npm run start:bnb-aster & goto :start
if "%choice%"=="5" npm run test:api & goto :start
if "%choice%"=="0" goto :exit

goto :start

:exit
echo.
echo Goodbye!
pause
