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
if (!$token && isset($_GET['token'])) {
    $token = $_GET['token'];
}

if (!$token) { http_response_code(401); exit; }

$db = new PDO("mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbKaisan']};charset=utf8mb4", $GLOBALS['usuarioRoot'], $GLOBALS['senhaRoot']);

$q = $_GET['q'] ?? '';

// ALTERADO: Busca nas 3 colunas (id, descricao, instrucoes) + codigo_natureza
// A chave principal retornada agora é o ID (para salvar)
// Retorna instrucoes para exibição elegante no frontend
// Limite aumentado para 100
$sql = "SELECT id, descricao as text, instrucoes 
        FROM naturezas_financeiras 
        WHERE (id LIKE ? OR descricao LIKE ? OR instrucoes LIKE ? OR codigo_natureza LIKE ?) 
        ORDER BY descricao ASC 
        LIMIT 100";

$stmt = $db->prepare($sql);
$term = "%$q%";
$stmt->execute([$term, $term, $term, $term]);
$results = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(['items' => $results]);
?>