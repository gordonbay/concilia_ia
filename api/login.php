<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type");
header("Content-type: application/json; charset=utf-8");
date_default_timezone_set('America/Sao_Paulo');

include $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

// Get JSON data from the request
$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['loginUsuario']) || empty($data['loginUsuario'])) {
    respondWithError("Preencha o campo de usuário, email ou celular.");
}

if (!isset($data['loginSenha']) || empty($data['loginSenha'])) {
    respondWithError("Preencha o campo senha.");
}

$loginIdentifier = $data['loginUsuario'];
$loginSenha = $data['loginSenha'];

// Create database connection
$mysqliGlobalLocal = new mysqli($enderecoLocal, $usuarioRoot, $senhaRoot, $dbGlobal);

// Check connection
if ($mysqliGlobalLocal->connect_error) {
    respondWithError("Falha na conexão com o banco de dados: " . $mysqliGlobalLocal->connect_error);
}

// Sanitize the main identifier for email and username checks
$loginIdentifier_esc = $mysqliGlobalLocal->real_escape_string($loginIdentifier);

// Create a numbers-only version for the phone number check
$loginIdentifierNumeric_esc = somenteNumeros($loginIdentifier);


// Prepare query to check against username, email, and phone number
$stmt = $mysqliGlobalLocal->prepare("SELECT * FROM usuarios WHERE usuario = ? OR email = ? OR celular = ?");
if (!$stmt) {
     respondWithError("Erro ao preparar a consulta: " . $mysqliGlobalLocal->error);
}

$stmt->bind_param("sss", $loginIdentifier_esc, $loginIdentifier_esc, $loginIdentifierNumeric_esc);
$stmt->execute();
$result = $stmt->get_result();


if ($result && $result->num_rows >= 1) {
    $row = $result->fetch_assoc();
    $hashed_password = $row["senha"];
    $userId = $row["id"];
    $ativado = $row["ativado"];
    $existingToken = $row["token"];
    $tokenGeneratedDate = isset($row["token_generated_date"]) ? $row["token_generated_date"] : 0;
    $currentTime = time();

    if (password_verify($loginSenha, $hashed_password)) {
        if ($ativado != 1) {
            respondWithError("Usuário não ativado. Aguarde a ativação pelo administrador.");
        }

        // Check if there's a valid token (less than 30 days old)
        $thirtyDaysInSeconds = 30 * 24 * 60 * 60; // 30 days in seconds
        $isTokenValid = !empty($existingToken) && ($currentTime - $tokenGeneratedDate) < $thirtyDaysInSeconds;

        if ($isTokenValid) {
            // Use existing token
            $token = $existingToken;
            
            // Only update last seen timestamp
            $updateQuery = "UPDATE usuarios SET ultimovisto = $currentTime WHERE id = $userId";
        } else {
            // Generate a new token
            $token = bin2hex(random_bytes(32));
            
            // Update token, token generation date and last seen timestamp
            $updateQuery = "UPDATE usuarios SET token = '$token', token_generated_date = $currentTime, ultimovisto = $currentTime WHERE id = $userId";
        }
        
        // Execute the update query
        if (!$mysqliGlobalLocal->query($updateQuery)) {
            respondWithError("Erro ao atualizar token: " . $mysqliGlobalLocal->error);
        }

        // Return success response with token
        $response = array(
            "error" => 0,
            "token" => $token,
            "userId" => $userId,
            "name" => $row["nome"],
            "surname" => $row["sobrenome"]
        );
        
        echo json_encode($response);
    } else {
        respondWithError("Senha incorreta.");
    }
} else {
    respondWithError("Usuário, email ou celular não localizado.");
}

$stmt->close();
$mysqliGlobalLocal->close();

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