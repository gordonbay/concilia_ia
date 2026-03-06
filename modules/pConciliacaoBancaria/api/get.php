<?php
header('Content-Type: application/json; charset=utf-8');
include_once '../../../conn.php';

// ─── Auth ────────────────────────────────────────────────────────────────────
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

// Conexão Global
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
$perms = array_map('trim', explode(',', $userAuth['permissoes']));

// ─── Permissões ──────────────────────────────────────────────────────────────
$isAdmin     = in_array('conciliacao_adm',        $perms);
$canEdit     = in_array('conciliacao_editor',      $perms) || in_array('conciliacao_pagar', $perms) || in_array('conciliacao_aprovar', $perms) || $isAdmin;
$canFinalize = in_array('conciliacao_pagar',       $perms) || in_array('conciliacao_aprovar', $perms) || $isAdmin;
$canAprove   = in_array('conciliacao_aprovar',     $perms) || $isAdmin;
$canViewAll  = in_array('conciliacao_ver_tudo',    $perms) || $isAdmin;
$canPagar    = in_array('conciliacao_pagar',       $perms) || $isAdmin;
$canCreate   = in_array('conciliacao_criar_nova',  $perms) || in_array('conciliacao_aprovar', $perms) || $isAdmin;

// ─── Grupo de visibilidade ───────────────────────────────────────────────────
$grupoUserIds = [];
if (!$canViewAll) {
    $grupoVer = null;
    foreach ($perms as $p) {
        if (str_starts_with($p, 'conciliacao_ver_grupo_')) {
            $grupoVer = $p;
            break;
        }
    }
    if ($grupoVer) {
        $stmtGrupo = $dbGlobal->prepare(
            "SELECT id FROM usuarios WHERE FIND_IN_SET(?, REPLACE(permissoes, ' ', ''))"
        );
        $stmtGrupo->execute([$grupoVer]);
        while ($g = $stmtGrupo->fetch(PDO::FETCH_ASSOC)) {
            $grupoUserIds[] = (int)$g['id'];
        }
    }
}

// ─── Sem permissão funcional = retorna vazio ──────────────────────────────────
$hasAnyFunctional = $isAdmin || $canEdit || $canFinalize || $canAprove
                  || $canViewAll || $canPagar || $canCreate || !empty($grupoUserIds);

if (!$hasAnyFunctional) {
    echo json_encode([
        'status' => 'success',
        'data' => [],
        'empresas' => [],
        'activeUsers' => [],
        'currentUser' => [
            'id'          => $userId,
            'isAdmin'     => false,
            'canEdit'     => false,
            'canFinalize' => false,
            'canAprove'   => false,
            'canViewAll'  => false,
            'canPagar'    => false,
            'canCreate'   => false,
        ]
    ]);
    exit;
}

// ─── Mapa de Usuários ────────────────────────────────────────────────────────
$userMap = [];
try {
    $stmtUsers = $dbGlobal->query("SELECT id, nome, sobrenome FROM usuarios");
    while ($u = $stmtUsers->fetch(PDO::FETCH_ASSOC)) {
        $userMap[$u['id']] = [
            'nome' => $u['nome'],
            'sobrenome' => $u['sobrenome']
        ];
    }
} catch (Exception $e) {}

// ─── Conexão Kaisan ──────────────────────────────────────────────────────────
$db = new PDO("mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbKaisan']};charset=utf8mb4", $GLOBALS['usuarioRoot'], $GLOBALS['senhaRoot']);

// ─── Filtros Request (FIX: Sanitização de strings 'null' e 'undefined') ──────
$startDate = $_GET['start'] ?? '';
if ($startDate === 'null' || $startDate === 'undefined' || empty($startDate)) $startDate = date('Y-m-d', strtotime('-30 days'));

$endDate = $_GET['end'] ?? '';
if ($endDate === 'null' || $endDate === 'undefined' || empty($endDate)) $endDate = date('Y-m-d');

$fStatus    = $_GET['status']     ?? '';
$fUsuario   = $_GET['usuario']    ?? '';
$fEmpresa   = $_GET['empresa']    ?? '';
$fOperacao  = $_GET['operacao']   ?? '';
$fRecebedor = $_GET['recebedor']  ?? '';
$fDoc       = $_GET['doc']        ?? '';
$fValorRaw  = $_GET['valor']      ?? '';

// Sanitize venc dates
$fVencStart = $_GET['venc_start'] ?? '';
if ($fVencStart === 'null' || $fVencStart === 'undefined') $fVencStart = '';

$fVencEnd   = $_GET['venc_end']   ?? '';
if ($fVencEnd === 'null' || $fVencEnd === 'undefined') $fVencEnd = '';

// ─── Config Empresas ─────────────────────────────────────────────────────────
$empresasList = [];
$empresaLookup = [];
if (isset($GLOBALS['CONFIG_EMPRESAS'])) {
    $empresas = json_decode($GLOBALS['CONFIG_EMPRESAS'], true);
    if (is_array($empresas)) {
        foreach ($empresas as $emp) {
            $id = (int)$emp['id'];
            $nf = $emp['nome_fantasia'] ?? $emp['razao_social'] ?? ('Empresa ' . $id);
            $cnpj = $emp['cnpj'] ?? '';
            $contas = [];
            if (!empty($emp['contas_bancarias'])) {
                foreach ($emp['contas_bancarias'] as $cb) {
                    $contas[] = [
                        'banco_id'     => (string)($cb['banco_id'] ?? ''),
                        'banco_nome'   => $cb['banco_nome'] ?? '',
                        'agencia'      => $cb['agencia'] ?? '',
                        'conta'        => $cb['conta'] ?? '',
                        'conta_padrao' => $cb['conta_padrao'] ?? 0
                    ];
                }
            }
            $empresasList[] = ['id' => $id, 'nome' => $nf, 'cnpj' => $cnpj, 'contas' => $contas];
            $empresaLookup[$id] = $nf;
        }
    }
}

// ─── Usuários Ativos ─────────────────────────────────────────────────────────
$activeUsers = [];
try {
    $stmtAct = $db->query("SELECT DISTINCT usuario FROM conciliacao_bancaria");
    while ($row = $stmtAct->fetch(PDO::FETCH_ASSOC)) {
        $uid = $row['usuario'];
        if (isset($userMap[$uid])) {
            $activeUsers[] = [
                'id'   => $uid,
                'nome' => $userMap[$uid]['nome'] . ' ' . $userMap[$uid]['sobrenome']
            ];
        }
    }
    usort($activeUsers, fn($a, $b) => strcmp($a['nome'], $b['nome']));
} catch (Exception $e) {}

// ─── Query Principal ─────────────────────────────────────────────────────────
if (isset($_GET['id']) && is_numeric($_GET['id'])) {
    // Busca registro único (por ID)
    $sql = "
    SELECT
        c.*,
        nf.descricao AS natureza_descricao,
        nf.instrucoes AS natureza_instrucoes
    FROM conciliacao_bancaria c
    LEFT JOIN naturezas_financeiras nf ON c.natureza_financeira = nf.id
    WHERE c.id = ?
    ";
    $params = [$_GET['id']];

    if (!$canViewAll) {
        if (!empty($grupoUserIds)) {
            $placeholders = implode(',', array_fill(0, count($grupoUserIds), '?'));
            $sql .= " AND c.usuario IN ($placeholders)";
            $params = array_merge($params, $grupoUserIds);
        } else {
            $sql .= " AND c.usuario = ?";
            $params[] = $userId;
        }
    }

} else {
    // Busca lista (por filtros)
    $sql = "
    SELECT
        c.*,
        nf.descricao AS natureza_descricao,
        nf.instrucoes AS natureza_instrucoes
    FROM conciliacao_bancaria c
    LEFT JOIN naturezas_financeiras nf ON c.natureza_financeira = nf.id
    WHERE (DATE(c.data_criacao) >= ? AND DATE(c.data_criacao) <= ?)
    ";

    $params = [$startDate, $endDate];

    if (!$canViewAll) {
        if (!empty($grupoUserIds)) {
            $placeholders = implode(',', array_fill(0, count($grupoUserIds), '?'));
            $sql .= " AND c.usuario IN ($placeholders)";
            $params = array_merge($params, $grupoUserIds);
        } else {
            $sql .= " AND c.usuario = ?";
            $params[] = $userId;
        }
    }
    elseif ($fUsuario !== '') {
        $sql .= " AND c.usuario = ?";
        $params[] = $fUsuario;
    }

    if ($fStatus === 'pendente') {
        $sql .= " AND (c.aprovado = 0 AND c.finalizado = 0)";
    } elseif ($fStatus === 'aprovado') {
        $sql .= " AND c.aprovado = 1";
    } elseif ($fStatus === 'finalizado') {
        $sql .= " AND c.finalizado = 1";
    } elseif ($fStatus === 'pago_adiantamento') {
        $sql .= " AND c.finalizado = 1 AND c.adiantamento = 1";
    }

    if ($fOperacao !== '') {
        $sql .= " AND c.operacao = ?";
        $params[] = $fOperacao;
    }

    if ($fRecebedor !== '') {
        $sql .= " AND (c.recebedor_nome LIKE ? OR c.recebedor_doc LIKE ?)";
        $params[] = "%$fRecebedor%";
        $params[] = "%$fRecebedor%";
    }

    if ($fDoc !== '') {
        $sql .= " AND (c.operacao_extra LIKE ? OR c.anexos LIKE ?)";
        $params[] = "%$fDoc%";
        $params[] = "%$fDoc%";
    }

    if ($fEmpresa !== '') {
        if (str_starts_with($fEmpresa, 'ACC|')) {
            $parts = explode('|', $fEmpresa);
            $cnpjRaw = $parts[1] ?? '';
            $bid     = $parts[2] ?? '';
            $cc      = $parts[3] ?? '';
            $cnpjParts = explode('/', $cnpjRaw);
            $cnpjLike = "%" . $cnpjParts[0] . "%" . ($cnpjParts[1] ?? '') . "%";

            $sql .= " AND c.empresa LIKE ? AND c.empresa LIKE ? AND c.empresa LIKE ?";
            $params[] = $cnpjLike;
            $params[] = '%"banco_id":"' . $bid . '"%';
            $params[] = '%"conta":"' . $cc . '"%';
        } elseif (is_numeric($fEmpresa)) {
            $sql .= " AND (c.empresa = ? OR c.empresa LIKE ?)";
            $params[] = $fEmpresa;
            $params[] = "%\"id\":$fEmpresa%";
        } else {
            $targetId = null;
            foreach ($empresasList as $emp) {
                if ($emp['cnpj'] === $fEmpresa) {
                    $targetId = $emp['id'];
                    break;
                }
            }
            $cnpjParts = explode('/', $fEmpresa);
            $cnpjLike = "%" . $cnpjParts[0] . "%" . ($cnpjParts[1] ?? '') . "%";

            $sql .= " AND (c.empresa LIKE ?";
            $params[] = $cnpjLike;
            if ($targetId !== null) {
                $sql .= " OR c.empresa = ? OR c.empresa LIKE ?";
                $params[] = $targetId;
                $params[] = "%\"id\":$targetId%";
            }
            $sql .= ")";
        }
    }

    if ($fVencStart !== '' && $fVencEnd !== '') {
        $sql .= " AND (
        (c.data_vencimento BETWEEN ? AND ?)
        OR
        EXISTS (
        SELECT 1
        FROM JSON_TABLE(
        COALESCE(c.parcelas, '[]'),
        '$[*]' COLUMNS (p_venc DATE PATH '$.data_vencimento')
        ) as pt
        WHERE pt.p_venc BETWEEN ? AND ?
        )
        )";
        $params[] = $fVencStart;
        $params[] = $fVencEnd;
        $params[] = $fVencStart;
        $params[] = $fVencEnd;
    }

    if ($fDoc !== '') {
        $sql .= " AND (c.operacao_extra LIKE ? OR c.anexos LIKE ?)";
        $params[] = "%$fDoc%";
        $params[] = "%$fDoc%";
    }

    // --- NOVA LÓGICA DE FILTRO POR VALOR ---
    if ($fValorRaw !== '') {
        // Converte formato BR (1.000,00) para SQL (1000.00)
        // Remove pontos de milhar e troca vírgula por ponto
        $valSql = str_replace('.', '', $fValorRaw);
        $valSql = str_replace(',', '.', $valSql);

        if (is_numeric($valSql)) {
            // Busca no valor_total OU dentro do array JSON de parcelas
            // Nota: JSON_TABLE requer MySQL 8.0+ (O servidor roda MySQL 8.4 conforme conn.php)
            $sql .= " AND (
                ABS(c.valor_total - ?) < 0.01
                OR
                EXISTS (
                    SELECT 1 
                    FROM JSON_TABLE(
                        COALESCE(c.parcelas, '[]'),
                        '$[*]' COLUMNS (pval DECIMAL(15,2) PATH '$.valor')
                    ) as pt 
                    WHERE ABS(pt.pval - ?) < 0.01
                )
            )";
            // Adiciona o parametro duas vezes (uma para valor_total, uma para parcelas)
            $params[] = $valSql;
            $params[] = $valSql;
        }
    }

    $sql .= " ORDER BY c.data_criacao DESC";
}

try {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        $empVal  = $row['empresa'];
        $empNome = null;
        if (!empty($empVal)) {
            $empDecoded = json_decode($empVal, true);
            if (is_array($empDecoded) && isset($empDecoded['cnpj'])) {
                foreach ($empresasList as $el) {
                    if ($el['cnpj'] === $empDecoded['cnpj']) {
                        $bankNome = '';
                        foreach ($el['contas'] as $cb) {
                            if ((string)$cb['banco_id'] === (string)($empDecoded['banco_id'] ?? '')) {
                                $bankNome = $cb['banco_nome'];
                                break;
                            }
                        }
                        $empNome = $el['nome'] . ($bankNome ? ' - ' . $bankNome : '');
                        break;
                    }
                }
                $empNome = $empNome ?? ('CNPJ ' . $empDecoded['cnpj']);
            } else {
                $empNome = $empresaLookup[(int)$empVal] ?? 'Empresa ' . $empVal;
            }
        }
        $row['empresa_nome'] = $empNome ?? '';

        $uid = $row['usuario'];
        if (isset($userMap[$uid])) {
            $row['usuario_nome']      = $userMap[$uid]['nome'];
            $row['usuario_sobrenome'] = $userMap[$uid]['sobrenome'];
        } else {
            $row['usuario_nome']      = 'Usuário';
            $row['usuario_sobrenome'] = $uid;
        }

        if (!empty($row['parcelas']))      $row['parcelas']      = json_decode($row['parcelas'], true);
        if (!empty($row['fatura']))        $row['fatura']        = json_decode($row['fatura'], true);
        if (!empty($row['operacao_extra'])) $row['operacao_extra'] = json_decode($row['operacao_extra'], true);
        if (!empty($row['modificacao']))   $row['modificacao']   = json_decode($row['modificacao'], true);
        if (!empty($row['anexos']))        $row['anexos']        = json_decode($row['anexos'], true);

        // --- ADICIONE ESTAS LINHAS AQUI: ---
        if (!empty($row['baixas']))        $row['baixas']        = json_decode($row['baixas'], true);
        if (!is_array($row['baixas']))     $row['baixas']        = [];
        // -----------------------------------

        $row['anotacao']    = $row['anotacao']    ?? '';
        $row['finalizado']  = (int)($row['finalizado']  ?? 0);
        $row['adiantamento'] = (int)($row['adiantamento'] ?? 0);
    }
    unset($row);

    echo json_encode([
        'status'      => 'success',
        'data'        => $rows,
        'empresas'    => $empresasList,
        'activeUsers' => $activeUsers,
        'currentUser' => [
            'id'          => $userId,
            'isAdmin'     => $isAdmin,
            'canEdit'     => $canEdit,
            'canFinalize' => $canFinalize,
            'canAprove'   => $canAprove,
            'canViewAll'  => $canViewAll,
            'canPagar'    => $canPagar,
            'canCreate'   => $canCreate,
        ]
    ]);
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>