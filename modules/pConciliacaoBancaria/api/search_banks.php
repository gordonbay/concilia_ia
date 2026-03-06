<?php
header('Content-Type: application/json; charset=utf-8');
include_once '../../../conn.php';

// Auth simples
$headers = function_exists('getallheaders') ? getallheaders() : [];
$token = null;
foreach ($headers as $k => $v) {
    if (strtolower($k) === 'authorization') $token = str_replace('Bearer ', '', $v);
}
if (!$token && isset($_GET['token'])) $token = $_GET['token']; // Fallback para Typeahead GET
if (!$token) { http_response_code(401); exit; }

$q = $_GET['q'] ?? '';
$db = new PDO("mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbKaisan']};charset=utf8mb4", $GLOBALS['usuarioRoot'], $GLOBALS['senhaRoot']);

// Busca por Código ou Nome
$sql = "SELECT code, name, fullName 
        FROM bancos 
        WHERE (name LIKE ? OR fullName LIKE ? OR code LIKE ?) 
        ORDER BY code ASC LIMIT 20";

$stmt = $db->prepare($sql);
$term = "%$q%";
$stmt->execute([$term, $term, "$q%"]); // Code começa com...
$results = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Formata para o Typeahead
$items = [];
foreach ($results as $r) {
    $display = ($r['code'] ? str_pad($r['code'], 3, '0', STR_PAD_LEFT) . ' - ' : '') . $r['name'];
    $items[] = [
        'id'   => $r['code'], // Usaremos o CODE como ID principal
        'text' => $display,
        'full' => $r
    ];
}

echo json_encode(['items' => $items]);
?>