<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization");
header("Content-type: application/json; charset=utf-8");
date_default_timezone_set('America/Sao_Paulo');

include_once $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

// Get the token from the Authorization header - UPDATED for case-insensitive header handling
$headers = getallheaders();
$token = null;

// Case-insensitive search for Authorization header
foreach ($headers as $key => $value) {
    if (strtolower($key) === 'authorization') {
        $token = str_replace('Bearer ', '', $value);
        break;
    }
}

// If token is not in headers, check if it was sent in the request body
if (empty($token)) {
    $data = json_decode(file_get_contents('php://input'), true);
    $token = isset($data['token']) ? $data['token'] : null;
}

// If still no token, return error
if (empty($token)) {
    $response = [
        'success' => false,
        'message' => 'Token não fornecido'
    ];
    echo json_encode($response);
    exit;
}

// Connect to database with improved error handling
try {
    $mysqliGlobalLocal = new mysqli($enderecoLocal, $usuarioRoot, $senhaRoot, $dbGlobal);
    
    if ($mysqliGlobalLocal->connect_error) {
        throw new Exception("Erro de conexão: " . $mysqliGlobalLocal->connect_error);
    }
    
    $mysqliGlobalLocal->set_charset("utf8mb4");
    
} catch (Exception $e) {
    $response = [
        'success' => false,
        'message' => $e->getMessage()
    ];
    echo json_encode($response);
    exit;
}

// Sanitize token
$token = $mysqliGlobalLocal->real_escape_string($token);

// Get user data based on token - use prepared statement for security
$stmt = $mysqliGlobalLocal->prepare("SELECT * FROM usuarios WHERE token = ?");
$stmt->bind_param("s", $token);
$stmt->execute();
$result = $stmt->get_result();

if (!$result || $result->num_rows === 0) {
    $response = [
        'success' => false,
        'message' => 'Token inválido ou expirado'
    ];
    echo json_encode($response);
    $mysqliGlobalLocal->close();
    exit;
}

// Get user ID
$user = $result->fetch_assoc();
$userId = $user['id'];

// Update user's alerta_data timestamp to current time
$currentTime = time();

// Use prepared statement to update
$updateStmt = $mysqliGlobalLocal->prepare("UPDATE usuarios SET alerta_data = ? WHERE id = ?");
$updateStmt->bind_param("ii", $currentTime, $userId);

// Execute the update
if ($updateStmt->execute()) {
    $response = [
        'success' => true,
        'message' => 'Timestamp de alerta atualizado',
        'timestamp' => $currentTime
    ];
} else {
    $response = [
        'success' => false,
        'message' => 'Erro ao atualizar timestamp de alerta: ' . $updateStmt->error
    ];
}

echo json_encode($response);

// Close statements and connection
$stmt->close();
$updateStmt->close();
$mysqliGlobalLocal->close();
?>