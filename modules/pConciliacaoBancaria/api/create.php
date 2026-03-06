<?php
header('Content-Type: application/json; charset=utf-8');
include_once '../../../conn.php';

// ... (autenticação mantida igual) ...
$headers = function_exists('getallheaders') ? getallheaders() :[];
$token   = null;
foreach ($headers as $k => $v) {
    if (strtolower($k) === 'authorization') { $token = str_replace('Bearer ', '', $v); break; }
}
if (!$token && isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $token = str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION']);
}
if (!$token) { http_response_code(401); exit; }

$dbGlobal = new PDO(
    "mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbGlobal']};charset=utf8mb4",
    $GLOBALS['usuarioRoot'],
    $GLOBALS['senhaRoot']
);
$stmtAuth = $dbGlobal->prepare("SELECT id, permissoes FROM usuarios WHERE token = ?");
$stmtAuth->execute([$token]);
$userAuth = $stmtAuth->fetch(PDO::FETCH_ASSOC);

if (!$userAuth) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Não autorizado']);
    exit;
}

$userId  = $userAuth['id'];
$perms   = array_map('trim', explode(',', $userAuth['permissoes']));
$isAdmin = in_array('conciliacao_adm',        $perms);
$canEdit = in_array('conciliacao_criar_nova', $perms)
        || in_array('conciliacao_aprovar',    $perms)
        || $isAdmin;

if (!$canEdit) {
    echo json_encode(['status' => 'error', 'message' => 'Sem permissão para criar conciliações.']);
    exit;
}

$db = new PDO(
    "mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbKaisan']};charset=utf8mb4",
    $GLOBALS['usuarioRoot'],
    $GLOBALS['senhaRoot']
);

$input = json_decode(file_get_contents('php://input'), true);

$empresa             = $input['empresa']             ?? null;
$operacao            = $input['operacao']            ?? null;
$valor_total         = $input['valor_total']         ?? 0;
$data_vencimento     = $input['data_vencimento']     ?? null;
$natureza_financeira = $input['natureza_financeira'] ?? null;
$observacao          = $input['observacao']          ?? null;
$anotacao            = $input['anotacao']            ?? null;
$recebedor_doc       = $input['recebedor_doc']       ?? null;
$recebedor_nome      = $input['recebedor_nome']      ?? null;
$adiantamento        = isset($input['adiantamento']) ? (int)$input['adiantamento'] : 0;
// NOVO
$tipo_lancamento      = $input['tipo_lancamento']      ?? null;
$dados_fiscais_manual = $input['dados_fiscais_manual'] ?? null;

$parcelas = (isset($input['parcelas']) && is_array($input['parcelas']) && !empty($input['parcelas']))
    ? json_encode($input['parcelas'])
    : null;

$fatura = (isset($input['fatura']) && is_array($input['fatura']) && !empty($input['fatura']))
    ? json_encode($input['fatura'])
    : null;

$anexos = (isset($input['anexos']) && is_array($input['anexos']) && !empty($input['anexos']))
    ? json_encode($input['anexos'])
    : null;

$operacao_extra = isset($input['operacao_extra'])
    ? (is_string($input['operacao_extra']) ? $input['operacao_extra'] : json_encode($input['operacao_extra']))
    : null;

$data_criacao = date('Y-m-d H:i:s');

// Garante colunas existem (idempotente)
try { $db->exec("ALTER TABLE conciliacao_bancaria ADD COLUMN anexos JSON DEFAULT NULL"); } catch (Exception $e) {}
try { $db->exec("ALTER TABLE conciliacao_bancaria ADD COLUMN anotacao TEXT DEFAULT NULL"); } catch (Exception $e) {}
try { $db->exec("ALTER TABLE conciliacao_bancaria ADD COLUMN recebedor_doc VARCHAR(50) DEFAULT NULL"); } catch (Exception $e) {}
try { $db->exec("ALTER TABLE conciliacao_bancaria ADD COLUMN recebedor_nome VARCHAR(255) DEFAULT NULL"); } catch (Exception $e) {}
try { $db->exec("ALTER TABLE conciliacao_bancaria ADD COLUMN finalizado TINYINT(1) NOT NULL DEFAULT 0"); } catch (Exception $e) {}
try { $db->exec("ALTER TABLE conciliacao_bancaria ADD COLUMN finalizador INT DEFAULT NULL"); } catch (Exception $e) {}
try { $db->exec("ALTER TABLE conciliacao_bancaria ADD COLUMN adiantamento TINYINT(1) DEFAULT 0"); } catch (Exception $e) {}
try { $db->exec("ALTER TABLE conciliacao_bancaria ADD COLUMN tipo_lancamento VARCHAR(50) DEFAULT NULL"); } catch (Exception $e) {}
try { $db->exec("ALTER TABLE conciliacao_bancaria ADD COLUMN dados_fiscais_manual JSON DEFAULT NULL"); } catch (Exception $e) {}

$sql = "
    INSERT INTO conciliacao_bancaria
        (empresa, usuario, data_criacao, operacao, valor_total, data_vencimento,
         parcelas, fatura, natureza_financeira, observacao, operacao_extra, anexos, 
         anotacao, recebedor_doc, recebedor_nome, adiantamento,
         tipo_lancamento, dados_fiscais_manual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
";

$stmt = $db->prepare($sql);
try {
    $stmt->execute([
        $empresa, $userId, $data_criacao, $operacao, $valor_total, $data_vencimento,
        $parcelas, $fatura, $natureza_financeira, $observacao, $operacao_extra, $anexos, 
        $anotacao, $recebedor_doc, $recebedor_nome, $adiantamento,
        $tipo_lancamento, $dados_fiscais_manual
    ]);
    echo json_encode(['status' => 'success', 'id' => $db->lastInsertId()]);
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>