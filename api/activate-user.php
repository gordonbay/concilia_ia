<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization");
header("Content-type: application/json; charset=utf-8");
date_default_timezone_set('America/Sao_Paulo');

include $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

$response = ['success' => false, 'message' => 'Ação não permitida.'];

// Get token from Authorization header
$headers = getallheaders();
$token = null;
// Case-insensitive search for Authorization header
if (is_array($headers)) {
    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'authorization') {
            if (preg_match('/Bearer\s(\S+)/i', $value, $matches)) {
                $token = $matches[1];
            }
            break;
        }
    }
}


if (empty($token)) {
    http_response_code(401);
    $response['message'] = 'Token não fornecido.';
    echo json_encode($response);
    exit;
}

// Connect to global DB for authentication
$mysqliGlobal = new mysqli($GLOBALS['enderecoLocal'], $GLOBALS['usuarioRoot'], $GLOBALS['senhaRoot'], $GLOBALS['dbGlobal']);
if ($mysqliGlobal->connect_error) {
    http_response_code(500);
    $response['message'] = 'Erro de conexão com o banco de dados (global).';
    error_log("activate-user.php DB Global Connection Error: " . $mysqliGlobal->connect_error);
    echo json_encode($response);
    exit;
}
$mysqliGlobal->set_charset("utf8mb4");

$token_esc = $mysqliGlobal->real_escape_string($token);
$userQuery = $mysqliGlobal->query("SELECT id, permissoes FROM usuarios WHERE token = '$token_esc'");

if (!$userQuery || $userQuery->num_rows === 0) {
    http_response_code(401);
    $response['message'] = 'Token inválido ou expirado.';
    $mysqliGlobal->close();
    echo json_encode($response);
    exit;
}

$currentUserData = $userQuery->fetch_assoc();
$permissions = explode(',', $currentUserData['permissoes'] ?? '');

if (!in_array('ROOT', $permissions)) {
    http_response_code(403);
    $response['message'] = 'Permissão negada. Apenas administradores ROOT podem ativar usuários.';
    $mysqliGlobal->close();
    echo json_encode($response);
    exit;
}

// Get userIdToActivate from POST data
$data = json_decode(file_get_contents('php://input'), true);
$userIdToActivate = isset($data['userIdToActivate']) ? (int)$data['userIdToActivate'] : 0;

if ($userIdToActivate <= 0) {
    http_response_code(400);
    $response['message'] = 'ID de usuário para ativação inválido.';
    $mysqliGlobal->close();
    echo json_encode($response);
    exit;
}

// Fetch user details to activate (including email)
$stmtFetchUser = $mysqliGlobal->prepare("SELECT email, nome, ativado FROM usuarios WHERE id = ?");
if (!$stmtFetchUser) {
    $response['message'] = "Erro ao preparar consulta do usuário: " . $mysqliGlobal->error;
    error_log("activate-user.php Prepare StmtFetchUser Error: " . $mysqliGlobal->error);
    $mysqliGlobal->close();
    echo json_encode($response);
    exit;
}
$stmtFetchUser->bind_param("i", $userIdToActivate);
$stmtFetchUser->execute();
$resultUserToActivate = $stmtFetchUser->get_result();
if ($resultUserToActivate->num_rows === 0) {
    $response['message'] = "Usuário ID {$userIdToActivate} não encontrado.";
    $stmtFetchUser->close();
    $mysqliGlobal->close();
    echo json_encode($response);
    exit;
}
$userToActivateData = $resultUserToActivate->fetch_assoc();
$stmtFetchUser->close();

if ($userToActivateData['ativado'] == 1) {
    $response['success'] = true; // Consider it a success if already active
    $response['message'] = "Usuário ID {$userIdToActivate} já está ativo.";
    $mysqliGlobal->close();
    echo json_encode($response);
    exit;
}


// Activate the user
$stmtActivate = $mysqliGlobal->prepare("UPDATE usuarios SET ativado = 1 WHERE id = ?");
if (!$stmtActivate) {
    $response['message'] = "Erro ao preparar ativação: " . $mysqliGlobal->error;
    error_log("activate-user.php Prepare StmtActivate Error: " . $mysqliGlobal->error);
    $mysqliGlobal->close();
    echo json_encode($response);
    exit;
}
$stmtActivate->bind_param("i", $userIdToActivate);

if ($stmtActivate->execute()) {
    if ($stmtActivate->affected_rows > 0) {
        $response['success'] = true;
        $response['message'] = "Usuário ID {$userIdToActivate} ativado com sucesso!";

        // Send activation email
        $userEmail = $userToActivateData['email'];
        $userName = $userToActivateData['nome'];
        if (!empty($userEmail)) {
            $emailSubject = "Sua conta foi ativada!";
            $emailBody = "Olá {$userName},\n\nSua conta no Sistema de Gestão YUTA foi ativada.\n\nVocê já pode fazer login.\n\nAtenciosamente,\nEquipe YUTA";
            
            if (function_exists('sendEmail')) {
                if (sendEmail($userEmail, $emailSubject, $emailBody)) {
                    $response['message'] .= " Email de notificação enviado para {$userEmail}.";
                } else {
                    $response['message'] .= " Falha ao enviar email de notificação para {$userEmail}.";
                    error_log("Falha ao enviar email de ativação para {$userEmail} (ID: {$userIdToActivate})");
                }
            } else {
                 $response['message'] .= " Função sendEmail não disponível. Email não enviado.";
                 error_log("Função sendEmail não disponível ao tentar notificar ativação para {$userEmail} (ID: {$userIdToActivate})");
            }
        } else {
            $response['message'] .= " Email do usuário não encontrado, notificação não enviada.";
        }
    } else {
        $response['message'] = "Usuário ID {$userIdToActivate} não necessitou de atualização (possivelmente já ativo ou não encontrado).";
    }
} else {
    $response['message'] = "Erro ao ativar usuário ID {$userIdToActivate}: " . $stmtActivate->error;
    error_log("activate-user.php Execute StmtActivate Error: " . $stmtActivate->error);
}

$stmtActivate->close();
$mysqliGlobal->close();
echo json_encode($response);
?>