#!/bin/bash

echo "============================================"
echo " Iniciando ngrok para o projeto FQNJ"
echo "============================================"
echo ""
echo "Este script inicia o ngrok com as configurações"
echo "corretas para evitar a tela de aviso."
echo ""
echo "Certifique-se de que o servidor Next.js está"
echo "rodando em http://localhost:3000"
echo ""
echo "============================================"
echo ""

ngrok http 3000 --request-header-add='ngrok-skip-browser-warning:true'
