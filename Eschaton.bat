@echo off
chcp 65001 >nul
title Eschaton Code - Terminal Agent
color 0b

cd /d "%~dp0"

node cli.mjs
pause
