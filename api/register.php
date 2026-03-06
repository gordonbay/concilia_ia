<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type");
header("Content-type: application/json; charset=utf-8");
date_default_timezone_set('America/Sao_Paulo');

include $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

// Get JSON data from the request
$data = json_decode(file_get_contents('php://input'), true);

// Validate all required fields
if (!isset($data['registerUser']) || empty($data['registerUser'])) {
    respondWithError("Preencha o campo usuário.");
}

if (strlen($data['registerUser']) > 15) {
    respondWithError("Nome de usuário não pode ser superior a 15 caracteres.");
}

if (!isset($data['registerName']) || empty($data['registerName'])) {
    respondWithError("Preencha o campo com o seu nome.");
}

if (strlen($data['registerName']) > 15) {
    respondWithError("Nome não pode superar 15 caracteres.");
}

if (!isset($data['registerSurName']) || empty($data['registerSurName'])) {
    respondWithError("Preencha o seu sobrenome.");
}

if (strlen($data['registerSurName']) > 15) {
    respondWithError("O sobrenome não pode superar 15 caracteres.");
}

if (!isset($data['registerCompany']) || empty($data['registerCompany'])) {
    respondWithError("Preencha o campo da empresa na qual trabalha.");
}

if (strlen($data['registerCompany']) > 15) {
    respondWithError("Nome da empresa precisa ser inferior a 15 caracteres.");
}

if (!isset($data['registerPassword']) || empty($data['registerPassword'])) {
    respondWithError("Preencha o campo senha.");
}

if (strlen($data['registerPassword']) > 15) {
    respondWithError("O tamanho da senha precisa ser inferior a 15 caracteres.");
}

if (!isset($data['registerEmail']) || empty($data['registerEmail'])) {
    respondWithError("Preencha o campo email.");
}

if (!filter_var($data['registerEmail'], FILTER_VALIDATE_EMAIL)) {
    respondWithError("Email inválido.");
}

if (strlen($data['registerEmail']) > 90) {
    respondWithError("O campo email não pode superar 90 caracteres.");
}

if (!isset($data['registerTos']) || $data['registerTos'] == "0") {
    respondWithError("Para registrar é necessário concordar com os Termos de Serviço.");
}

if (!isset($data['registerIntelectual']) || $data['registerIntelectual'] == "0") {
    respondWithError("Para registrar é necessário concordar com os termos de Propriedade Intelectual.");
}

// Create database connection
$mysqliGlobalLocal = new mysqli($enderecoLocal, $usuarioRoot, $senhaRoot, $dbGlobal);

// Check connection
if ($mysqliGlobalLocal->connect_error) {
    respondWithError("Falha na conexão com o banco de dados: " . $mysqliGlobalLocal->connect_error);
}

// Sanitize inputs
$registerUser = $mysqliGlobalLocal->real_escape_string($data['registerUser']);
$registerPassword = $mysqliGlobalLocal->real_escape_string($data['registerPassword']);
$registerEmail = $mysqliGlobalLocal->real_escape_string($data['registerEmail']);
$registerName = $mysqliGlobalLocal->real_escape_string($data['registerName']);
$registerSurName = $mysqliGlobalLocal->real_escape_string($data['registerSurName']);
$registerCompany = $mysqliGlobalLocal->real_escape_string($data['registerCompany']);
$registerPhone = isset($data['registerPhone']) ? $mysqliGlobalLocal->real_escape_string($data['registerPhone']) : '';

// Verificar se username ou email já existem
$result = $mysqliGlobalLocal->query("SELECT * FROM usuarios WHERE usuario = '$registerUser' OR email = '$registerEmail'");
if ($result && $result->num_rows >= 1) {
    respondWithError("Usuário ou email já está em uso.");
}

// Hash the password
$hashedPassword = password_hash($registerPassword, PASSWORD_DEFAULT);

// Generate API key
$apiKey = substr(md5(uniqid(mt_rand(), true)), 0, 8);

// Insert the new user
$insertQuery = "INSERT INTO usuarios (usuario, senha, email, nome, sobrenome, celular, ultimovisto, empresa, ativado, permissoes, apiKey) 
                VALUES ('$registerUser', '$hashedPassword', '$registerEmail', '$registerName', '$registerSurName', '$registerPhone', '" . time() . "', '$registerCompany', '0', 'ZEUS,ZEUS_FORNECEDOR', '$apiKey')";

if (!$mysqliGlobalLocal->query($insertQuery)) {
    respondWithError("Erro ao registrar usuário: " . $mysqliGlobalLocal->error);
}

$newUserId = $mysqliGlobalLocal->insert_id;

// Send alert to ROOT users for activation
if ($newUserId > 0) {
    // This script already includes conn.php and has $mysqliGlobalLocal initialized
    // No need to re-connect $mysqliGlobalAlert

    $descritivo_id_alerta = 15; // "Novo usuário registrado: %s. Ativar?"
    // Variavel format: username|Nome Completo|Empresa|Email
    $variavel_alerta = "{$registerUser}|{$registerName} {$registerSurName}|{$registerCompany}|{$registerEmail}";
    $data_alerta = time();
    $permissao_alerta = "ROOT";
    $tipo_id_alerta = 2; // Warning, as it requires action
    $icon_id_alerta = 4; // ph-user-circle-plus
    $link_alerta = "#ativarUsuario_{$newUserId}";

    $stmtAlert = $mysqliGlobalLocal->prepare("INSERT INTO alertas (descritivo_id, variavel, data, permissao, tipo_id, icon_id, link) VALUES (?, ?, ?, ?, ?, ?, ?)");
    if ($stmtAlert) {
        $stmtAlert->bind_param("isissis", $descritivo_id_alerta, $variavel_alerta, $data_alerta, $permissao_alerta, $tipo_id_alerta, $icon_id_alerta, $link_alerta);
        if (!$stmtAlert->execute()) {
            // Log error, but don't fail the registration for this
            error_log("Erro ao inserir alerta de ativação para usuário ID {$newUserId}: " . $stmtAlert->error);
        }
        $stmtAlert->close();
    } else {
        error_log("Erro ao preparar statement de alerta de ativação: " . $mysqliGlobalLocal->error);
    }
}


// Envia alerta para o Discord sobre o novo registro
$message = "**Novo usuário registrado!**\n";
$message .= "**Usuário**: " . $registerUser . "\n";
$message .= "**Nome**: " . $registerName . " " . $registerSurName . "\n";
$message .= "**Empresa**: " . $registerCompany . "\n";
$message .= "**Email**: " . $registerEmail . "\n";
if (!empty($registerPhone)) {
    $message .= "**Telefone**: " . $registerPhone . "\n";
}

// Tenta enviar o alerta para o Discord
// include_once $_SERVER['DOCUMENT_ROOT'] . '/conn.php'; // Already included
if (function_exists('sendDiscordAlert')) {
    sendDiscordAlert($message, "Sistema de Cadastro");
}

// Close connection
$mysqliGlobalLocal->close();

// Return success response
$response = array(
    "error" => 0,
    "errorDesc" => "Usuário registrado com sucesso. Em até 24h o administrador irá ativar a sua conta."
);
echo json_encode($response);

// Helper function to respond with error
function respondWithError($message) {
    $response = array(
        "error" => 1,
        "errorDesc" => $message
    );
    echo json_encode($response);
    exit;
}
?>