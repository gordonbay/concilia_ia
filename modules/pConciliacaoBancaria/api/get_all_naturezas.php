<?php
header('Content-Type: application/json; charset=utf-8');
include_once '../../../conn.php';

$headers = getallheaders();
$token = null;
foreach ($headers as $k => $v) {
    if (strtolower($k) === 'authorization') $token = str_replace('Bearer ', '', $v);
}
if (!$token) { http_response_code(401); exit; }

$db = new PDO("mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbKaisan']};charset=utf8mb4", $GLOBALS['usuarioRoot'], $GLOBALS['senhaRoot']);

// ALTERADO: Retorna ID como chave primária e instrucoes para uso no frontend
// Ordenação por descricao
$sql = "SELECT id, descricao as text, instrucoes
        FROM naturezas_financeiras 
        ORDER BY descricao ASC";

try {
    $stmt = $db->query($sql);
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['status' => 'success', 'items' => $results]);
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'items' => []]);
}
?>