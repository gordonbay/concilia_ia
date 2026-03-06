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
    respondWithError("Preencha o campo de email.");
}

$email = $data['email'];

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respondWithError("Formato de email inválido.");
}

// Create database connection
$mysqliGlobalLocal = new mysqli($enderecoLocal, $usuarioRoot, $senhaRoot, $dbGlobal);

// Check connection
if ($mysqliGlobalLocal->connect_error) {
    respondWithError("Falha na conexão com o banco de dados: " . $mysqliGlobalLocal->connect_error);
}

// Sanitize input
$email = $mysqliGlobalLocal->real_escape_string($email);

// Check if email exists in database
$result = $mysqliGlobalLocal->query("SELECT * FROM usuarios WHERE email = '$email'");

if (!$result || $result->num_rows == 0) {
    respondWithError("Email não encontrado em nossa base de dados.");
}

// Generate a random verification code (6 digits)
$verificationCode = mt_rand(100000, 999999);

// Store the verification code in the database
// First check if the recovery_code column exists, if not, add it
$checkColumnQuery = "SHOW COLUMNS FROM usuarios LIKE 'recovery_code'";
$columnResult = $mysqliGlobalLocal->query($checkColumnQuery);

if ($columnResult && $columnResult->num_rows == 0) {
    // Add the column if it doesn't exist
    $addColumnQuery = "ALTER TABLE usuarios ADD COLUMN recovery_code VARCHAR(10) NULL, 
                       ADD COLUMN recovery_expiry BIGINT NULL";
    if (!$mysqliGlobalLocal->query($addColumnQuery)) {
        respondWithError("Erro ao configurar a recuperação de senha: " . $mysqliGlobalLocal->error);
    }
}

// Set expiry time (30 minutes from now)
$expiryTime = time() + (30 * 60);

// Update the user record with the verification code and expiry time
$updateQuery = "UPDATE usuarios SET recovery_code = '$verificationCode', recovery_expiry = '$expiryTime' WHERE email = '$email'";

if (!$mysqliGlobalLocal->query($updateQuery)) {
    respondWithError("Erro ao processar solicitação: " . $mysqliGlobalLocal->error);
}

// Send email with verification code
// Note: In a real environment, you would integrate with an email service
// For this example, we'll simulate a successful email sending
$mailSent = sendRecoveryEmail($email, $verificationCode);

if (!$mailSent) {
    respondWithError("Erro ao enviar email de recuperação.");
}

// Close connection
$mysqliGlobalLocal->close();

// Return success response
$response = array(
    "error" => 0,
    "message" => "Código de verificação enviado para o seu email."
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

/**
 * Helper function for password recovery emails specifically
 * 
 * @param string $email Recipient email address
 * @param string $code Verification code
 * @return boolean Result of email sending
 */
function sendRecoveryEmail($email, $code) {
    $subject = 'Recuperação de Senha';
    
    $message = "Código de Verificação para Recuperação de Senha" . PHP_EOL . PHP_EOL;
    $message .= "Seu código de verificação é: " . $code . PHP_EOL . PHP_EOL;
    $message .= "Este código expirará em 30 minutos." . PHP_EOL;
    $message .= "Se você não solicitou esta recuperação de senha, por favor ignore este email." . PHP_EOL;
    $message .= "Esse é um email automático, não responder.";
    
    // Log the code for development/testing
    error_log("Recovery code for $email: $code");
    
    // Use the general email sending function
    return sendEmail($email, $subject, $message);
}
?>