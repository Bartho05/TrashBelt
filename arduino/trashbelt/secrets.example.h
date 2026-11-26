#ifndef TRASHBELT_SECRETS_H
#define TRASHBELT_SECRETS_H

// Copie este arquivo para secrets.h e preencha com os valores do seu projeto.
// secrets.h está no .gitignore — nunca commite WiFi, token ou URL reais.

const char* TB_WIFI_SSID      = "NOME_DO_WIFI";
const char* TB_WIFI_PASSWORD  = "SENHA_DO_WIFI";

// URL do endpoint do painel (Vercel) ou do XAMPP na rede local.
// Exemplo Vercel: https://SEU-PROJETO.vercel.app/api/ingest
// Exemplo local:  http://192.168.1.10/Trashbelt/api/ingest.php
const char* TB_INGEST_URL     = "https://SEU-PROJETO.vercel.app/api/ingest";

// Mesmo valor de TB_DEVICE_TOKEN configurado no servidor.
const char* TB_DEVICE_TOKEN   = "SEU_TOKEN_DO_DISPOSITIVO";

#endif
