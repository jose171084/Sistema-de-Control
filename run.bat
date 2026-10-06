@echo off
title Sistema de Control de Inventario y Facturacion Multimoneda

:: Asegurar que el directorio de trabajo sea siempre la carpeta de la aplicacion
cd /d "%~dp0"

:: Si server.py no esta en la carpeta actual, redirigir a la ruta del proyecto
if not exist "server.py" (
    if exist "C:\Users\pc\.gemini\antigravity\scratch\sistema-inventario\server.py" (
        cd /d "C:\Users\pc\.gemini\antigravity\scratch\sistema-inventario"
    )
)

echo ==============================================================
echo  Iniciando Sistema de Control de Inventario y Facturacion
echo  Modulos: Inventario, POS, Compras, CXC, CXP, Reportes
echo ==============================================================
echo.
python server.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Ocurrio un error al iniciar el servidor.
)
pause
