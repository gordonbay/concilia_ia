<?php
header('Content-Type: application/json; charset=utf-8');
include_once '../../../conn.php';

// Auth simplificada (adicione a validação de token completa se necessário)
$headers = function_exists('getallheaders') ? getallheaders() : [];
$token = null;
foreach ($headers as $k => $v) {
    if (strtolower($k) === 'authorization') $token = str_replace('Bearer ', '', $v);
}
if (!$token) { http_response_code(401); exit; }

$url = "https://brasilapi.com.br/api/banks/v1";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 || !$response) {
    echo json_encode(['status' => 'error', 'message' => 'Erro ao contatar BrasilAPI']);
    exit;
}

$bancos = json_decode($response, true);
if (!is_array($bancos)) {
    echo json_encode(['status' => 'error', 'message' => 'JSON inválido da API']);
    exit;
}

$db = new PDO("mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbKaisan']};charset=utf8mb4", $GLOBALS['usuarioRoot'], $GLOBALS['senhaRoot']);

$db->beginTransaction();
try {
    // Limpa tabela atual ou usa ON DUPLICATE KEY UPDATE. Vamos limpar para garantir sincronia.
    $db->exec("TRUNCATE TABLE bancos");

    $stmt = $db->prepare("INSERT INTO bancos (code, name, ispb, fullName) VALUES (?, ?, ?, ?)");

    $count = 0;
    foreach ($bancos as $b) {
        $stmt->execute([
            $b['code'] ?? null,
            $b['name'],
            $b['ispb'],
            $b['fullName'] ?? $b['name']
        ]);
        $count++;
    }

    $db->commit();
    echo json_encode(['status' => 'success', 'message' => "$count bancos atualizados com sucesso."]);
} catch (Exception $e) {
    $db->rollBack();
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>