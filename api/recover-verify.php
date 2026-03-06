<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type");
header("Content-type: application/json; charset=utf-8");
date_default_timezone_set('America/Sao_Paulo');

include $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

// Get JSON data from the request
$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['email']) || empty($data['email'])) {
    respondWithError("Email não informado.");
}

if (!isset($data['code']) || empty($data['code'])) {
    respondWithError("Código de verificação não informado.");
}

$email = $data['email'];
$code = $data['code'];

// Create database connection
$mysqliGlobalLocal = new mysqli($enderecoLocal, $usuarioRoot, $senhaRoot, $dbGlobal);

// Check connection
if ($mysqliGlobalLocal->connect_error) {
    respondWithError("Falha na conexão com o banco de dados: " . $mysqliGlobalLocal->connect_error);
}

// Sanitize inputs
$email = $mysqliGlobalLocal->real_escape_string($email);
$code = $mysqliGlobalLocal->real_escape_string($code);

// Get the user record
$query = "SELECT * FROM usuarios WHERE email = '$email'";
$result = $mysqliGlobalLocal->query($query);

if (!$result || $result->num_rows == 0) {
    respondWithError("Email não encontrado.");
}

$user = $result->fetch_assoc();

// Check if recovery code exists and is not expired
if (empty($user['recovery_code'])) {
    respondWithError("Nenhum código de recuperação solicitado para este email.");
}

if ($user['recovery_expiry'] < time()) {
    respondWithError("Código de verificação expirado. Por favor, solicite um novo código.");
}

// Verify the code
if ($user['recovery_code'] !== $code) {
    respondWithError("Código de verificação inválido.");
}

// Close connection
$mysqliGlobalLocal->close();

// Return success response
$response = array(
    "error" => 0,
    "message" => "Código verificado com sucesso."
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