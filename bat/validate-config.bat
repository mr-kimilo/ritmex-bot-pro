@echo off
echo ========================================
echo    Quick Configuration Validation
echo ========================================
echo.

echo Checking configuration files...
if exist "config\api-config.json" (
    echo [OK] config\api-config.json exists
) else (
    echo [ERROR] config\api-config.json missing
    goto :error
)

if exist "config\.env.bnb.sol" (
    echo [OK] config\.env.bnb.sol exists
) else (
    echo [ERROR] config\.env.bnb.sol missing
    goto :error
)

if exist "config\.env.bnb.aster" (
    echo [OK] config\.env.bnb.aster exists
) else (
    echo [ERROR] config\.env.bnb.aster missing
    goto :error
)

echo.
echo Testing API configuration system...
npm run test:api
if %ERRORLEVEL% neq 0 goto :error

echo.
echo Testing configuration routing...
npm run test:config
if %ERRORLEVEL% neq 0 goto :error

echo.
echo ========================================
echo    ALL CHECKS PASSED!
echo    System is ready for deployment
echo ========================================
echo.
echo Ready to start instances:
echo   npm run start:bnb-sol
echo   npm run start:bnb-aster
goto :end

:error
echo.
echo ========================================
echo    CONFIGURATION ERROR DETECTED!
echo    Please check the error messages above
echo ========================================

:end
pause
