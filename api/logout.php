<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization");
header("Content-type: application/json; charset=utf-8");
date_default_timezone_set('America/Sao_Paulo');

include $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

// Get JSON data from the request
$data = json_decode(file_get_contents('php://input'), true);

// Get Authorization header
$headers = getallheaders();
$token = isset($headers['Authorization']) ? str_replace('Bearer ', '', $headers['Authorization']) : null;

// If token is not in headers, check if it was sent in the request
if (empty($token) && isset($data['token'])) {
    $token = $data['token'];
}

// If still no token, return error
if (empty($token)) {
    respondWithError("Token não fornecido");
}

// Create database connection
$mysqliGlobalLocal = new mysqli($enderecoLocal, $usuarioRoot, $senhaRoot, $dbGlobal);

// Check connection
if ($mysqliGlobalLocal->connect_error) {
    respondWithError("Falha na conexão com o banco de dados: " . $mysqliGlobalLocal->connect_error);
}

// Sanitize token
$token = $mysqliGlobalLocal->real_escape_string($token);

// Update the user's token to NULL
$updateQuery = "UPDATE usuarios SET token = NULL WHERE token = '$token'";

$mysqliGlobalLocal->query($updateQuery);

// Close connection
$mysqliGlobalLocal->close();

// Return success response
$response = array(
    "error" => 0,
    "message" => "Logout realizado com sucesso."
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