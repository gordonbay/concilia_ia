<?php
header('Content-Type: application/json; charset=utf-8');
include_once '../../../conn.php';

$headers = function_exists('getallheaders') ? getallheaders() : [];
$token = null;
foreach ($headers as $k => $v) {
    if (strtolower($k) === 'authorization') {
        $token = str_replace('Bearer ', '', $v);
        break;
    }
}
if (!$token && isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $token = str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION']);
}
if (!$token) { http_response_code(401); exit; }

$dbGlobal = new PDO("mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbGlobal']};charset=utf8mb4", $GLOBALS['usuarioRoot'], $GLOBALS['senhaRoot']);
$stmtAuth = $dbGlobal->prepare("SELECT id, permissoes FROM usuarios WHERE token = ?");
$stmtAuth->execute([$token]);
$userAuth = $stmtAuth->fetch(PDO::FETCH_ASSOC);

if (!$userAuth) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Não autorizado']);
    exit;
}

$userId = $userAuth['id'];
$perms  = array_map('trim', explode(',', $userAuth['permissoes']));

// Permissão: conciliacao_aprovar (substitui o antigo conciliacao_adm)
$canAprove = in_array('conciliacao_aprovar', $perms);

if (!$canAprove) {
    echo json_encode(['status' => 'error', 'message' => 'Sem permissão para aprovar']); exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$id = $input['id'] ?? null;

if (!$id) { echo json_encode(['status' => 'error', 'message' => 'ID não fornecido']); exit; }

$db = new PDO("mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbKaisan']};charset=utf8mb4", $GLOBALS['usuarioRoot'], $GLOBALS['senhaRoot']);

$stmt = $db->prepare("UPDATE conciliacao_bancaria SET aprovado = 1, aprovador = ? WHERE id = ?");
try {
    $stmt->execute([$userId, $id]);
    echo json_encode(['status' => 'success']);
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>