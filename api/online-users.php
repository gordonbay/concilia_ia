<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization");
header("Content-type: application/json; charset=utf-8");
date_default_timezone_set('America/Sao_Paulo');

include_once $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

// Authentication check - UPDATED for case-insensitive header handling
$headers = getallheaders();
$token = null;

// Case-insensitive search for Authorization header
foreach ($headers as $key => $value) {
    if (strtolower($key) === 'authorization') {
        $token = str_replace('Bearer ', '', $value);
        break;
    }
}

if (empty($token)) {
    $response = array(
        'error' => 1,
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
        'error' => 1,
        'message' => 'Erro de conexão com o banco de dados: ' . $mysqliGlobalLocal->connect_error
    );
    echo json_encode($response);
    exit;
}

// Sanitize token
$token = $mysqliGlobalLocal->real_escape_string($token);

// Verify token validity
$tokenQuery = "SELECT id FROM usuarios WHERE token = '$token'";
$tokenResult = $mysqliGlobalLocal->query($tokenQuery);

if (!$tokenResult || $tokenResult->num_rows === 0) {
    $response = array(
        'error' => 1,
        'message' => 'Token inválido ou expirado'
    );
    echo json_encode($response);
    $mysqliGlobalLocal->close();
    exit;
}

// Define the threshold time for online users (e.g., active in the last 15 minutes)
$activeTimeThreshold = time() - (15 * 60);

// Query for online users
$query = "SELECT id, nome, sobrenome, empresa, pic, ultimovisto FROM usuarios 
          WHERE ultimovisto > $activeTimeThreshold AND ativado = 1 
          ORDER BY ultimovisto DESC 
          LIMIT 10";

$result = $mysqliGlobalLocal->query($query);

if (!$result) {
    $response = array(
        'error' => 1,
        'message' => 'Erro ao buscar usuários online: ' . $mysqliGlobalLocal->error
    );
    echo json_encode($response);
    $mysqliGlobalLocal->close();
    exit;
}

// Process the results
$users = array();
while ($row = $result->fetch_assoc()) {
    // Determine user status based on last activity time
    $lastSeen = (int)$row['ultimovisto'];
    $timeDiff = time() - $lastSeen;
    
    // Define status color based on activity time
    $statusColor = 'verde'; // Online (active within 5 minutes)
    
    if ($timeDiff > 5 * 60 && $timeDiff <= 15 * 60) {
        $statusColor = 'amarelo'; // Away (active 5-15 minutes ago)
    } else if ($timeDiff > 15 * 60) {
        $statusColor = 'vermelho'; // Offline (inactive for more than 15 minutes)
    }
    
    // Prepare user data
    $userData = array(
        'id' => $row['id'],
        'nome' => $row['nome'] . ' ' . $row['sobrenome'],
        'empresa' => $row['empresa'],
        'pic' => !empty($row['pic']) ? $row['pic'] : 'default',
        'cor' => $statusColor,
        'ultimovisto' => $row['ultimovisto']
    );
    
    $users[] = $userData;
}

// Send the response
echo json_encode($users);

// Close the database connection
$mysqliGlobalLocal->close();
?>