<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization");
header("Content-type: application/json; charset=utf-8");
date_default_timezone_set('America/Sao_Paulo');

include_once $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

// Get the token from the Authorization header with case-insensitive search
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
    $response = array(
        'authenticated' => false,
        'message' => 'Token não fornecido'
    );
    echo json_encode($response);
    exit;
}

// Connect to database
$mysqliGlobalLocal = new mysqli($enderecoLocal, $usuarioRoot, $senhaRoot, $dbGlobal);

// Check connection
if ($mysqliGlobalLocal->connect_error) {
    $response = array(
        'authenticated' => false,
        'message' => 'Erro de conexão com o banco de dados: ' . $mysqliGlobalLocal->connect_error
    );
    echo json_encode($response);
    exit;
}

// Sanitize token
$token = $mysqliGlobalLocal->real_escape_string($token);

// Check if token exists in the database
$query = "SELECT * FROM usuarios WHERE token = '$token'";
$result = $mysqliGlobalLocal->query($query);

if (!$result || $result->num_rows === 0) {
    $response = array(
        'authenticated' => false,
        'message' => 'Token inválido ou expirado'
    );
    echo json_encode($response);
    $mysqliGlobalLocal->close();
    exit;
}

// Get user data
$user = $result->fetch_assoc();
$userId = $user['id'];

// Update last seen timestamp (APENAS SE PASSOU MAIS DE 5 MINUTOS)
// Isso evita Lock Wait Timeout em conexões lentas ou concorrentes
$ultimoVistoDb = intval($user['ultimovisto']);
$agora = time();

if (($agora - $ultimoVistoDb) > 300) { 
    $updateQuery = "UPDATE usuarios SET ultimovisto = " . $agora . " WHERE id = $userId";
    $mysqliGlobalLocal->query($updateQuery);
}

// Convert permissions string to array
$permissoes = explode(',', $user['permissoes']);

// Prepare user data to return
$userData = array(
    'id' => $user['id'],
    'nome' => $user['nome'],
    'sobrenome' => $user['sobrenome'],
    'email' => $user['email'],
    'empresa' => $user['empresa'],
    'permissoes' => $permissoes
);

// Return success response
$response = array(
    'authenticated' => true,
    'user' => $userData
);

echo json_encode($response);
$mysqliGlobalLocal->close();
?>