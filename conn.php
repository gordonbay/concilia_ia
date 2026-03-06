<?php
// =============================================================================
// conn.example.php — Template de configuração
// COPIE este arquivo para conn.php e preencha com suas credenciais reais.
// NUNCA versione conn.php com dados reais.
// =============================================================================

$ondeEstou = "desenvolvimento";

if($ondeEstou == "servidor"){
    $enderecoLocal = "127.0.0.1";
    $GLOBALS['enderecoLocal'] = "127.0.0.1";
} 

if($ondeEstou == "desenvolvimento"){
    $enderecoLocal = "45.148.244.193";
    $GLOBALS['enderecoLocal'] = "45.148.244.193";
}

$dbGlobal = "global";
$GLOBALS['dbGlobal'] = "global";
$dbKaisan = "kaisan_beta";
$GLOBALS['dbKaisan'] = "kaisan_beta";

header("Content-type: text/html; charset=utf-8");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Pragma: no-cache");

date_default_timezone_set('America/Sao_Paulo');

// ─── BANCO DE DADOS MYSQL (principal) ────────────────────────────────────────
$GLOBALS['usuarioRoot']          = "root";
$GLOBALS['senhaRoot']            = "";
$GLOBALS['dnsPrimarioServidor']  = "localhost"; // Ex: maprojetos.ovh

// ─── BANCO DE DADOS MSSQL (integração legada) ────────────────────────────────
$GLOBALS['mssql_kaisan_host'] = "localhost";
$GLOBALS['mssql_kaisan_port'] = "1433";
$GLOBALS['mssql_kaisan_db']   = "PRODUCAO";
$GLOBALS['mssql_kaisan_user'] = "seu_usuario";
$GLOBALS['mssql_kaisan_pass'] = "sua_senha";

// ─── SMTP ────────────────────────────────────────────────────────────────────
$GLOBALS['SMTP_HOST']       = 'smtp.gmail.com';
$GLOBALS['SMTP_USERNAME']   = 'seu@email.com';
$GLOBALS['SMTP_PASSWORD']   = 'sua_senha_de_app';  // Senha de App do Gmail
$GLOBALS['SMTP_PORT']       = 587;
$GLOBALS['SMTP_SECURE']     = 'tls';
$GLOBALS['SMTP_FROM_EMAIL'] = 'seu@email.com';
$GLOBALS['SMTP_FROM_NAME']  = 'MA Projetos';

// ─── MODELOS DE IA ───────────────────────────────────────────────────────────
$GLOBALS['LM_STUDIO_MODEL_A'] = json_encode([
    "load_name" => "google/gemma-3-12b",
    "loaded_id" => "google/gemma-3-12b",
    "family"    => "gemma"
]);

$GLOBALS['LM_STUDIO_MODEL_B'] = json_encode([
    "loaded_id" => "groq/compound",
    "TPM"       => "70000",
    "RPD"       => "250",
    "family"    => "groq"
]);

$GLOBALS['GEMINI'] = json_encode([
    "loaded_id" => "gemini-2.5-flash",
    "RPD"       => "20",
    "family"    => "gemini"
]);

$GLOBALS['MISTRAL'] = json_encode([
    "loaded_id" => "mistral-large-latest",
    "RPD"       => "10000",
    "family"    => "mistral"
]);

// ─── API KEYS ─────────────────────────────────────────────────────────────────
// Obtenha suas chaves em:
//   Gemini:      https://aistudio.google.com/app/apikey
//   Groq:        https://console.groq.com/keys
//   Mistral:     https://console.mistral.ai/api-keys
//   OpenRouter:  https://openrouter.ai/keys

$GLOBALS['GEMINI_API_KEY']       = "SUA_GEMINI_API_KEY";
$GLOBALS['GEMINI_API_KEY_B']     = "SUA_GEMINI_API_KEY_B";
// Adicione mais chaves conforme necessário...

$GLOBALS['GROK_API_KEY_A']       = "SUA_GROQ_API_KEY_A";
// Adicione mais chaves conforme necessário...

$GLOBALS['MISTRAL_API_KEY_A']    = "SUA_MISTRAL_API_KEY";

$GLOBALS['OPEN_ROUTER_API_KEY_A'] = "SUA_OPENROUTER_API_KEY";

// ─── CAMINHOS RAG (ajuste para seu ambiente) ──────────────────────────────────
$GLOBALS['RAG_YUTA_ASANA']         = "D:/AI_RAG_PROCESSED/YUTA_ASANA/";
$GLOBALS['RAG_YUTA_ASANA_SCHEMAS'] = "D:/AI_RAG_PROCESSED/YUTA_ASANA_SCHEMAS";
$GLOBALS['RAG_PESSOAL_EMAIL']      = "D:/AI_RAG_DUMP/EMAILS";

// ─── CONFIGURAÇÃO DE EMPRESAS ─────────────────────────────────────────────────
// Preencha com os dados das empresas do seu ambiente
$GLOBALS['CONFIG_EMPRESAS'] = json_encode([
    [
        "id"           => 0,
        "nome_fantasia" => "Empresa Exemplo",
        "razao_social" => "Empresa Exemplo LTDA",
        "cnpj"         => "00.000.000/0001-00",
    ]
]);

function somenteNumeros($string) {
    if (empty($string)) return null;
    return preg_replace('/[^0-9]/', '', $string);
}
