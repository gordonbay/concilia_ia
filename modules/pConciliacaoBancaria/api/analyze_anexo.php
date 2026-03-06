<?php
/**
 * analyze_anexo.php — v4 (Queue via MySQL)
 *
 * Fluxo:
 *   1. Recebe o upload do arquivo.
 *   2. Salva o blob do arquivo + metadados na tabela `conciliacao_jobs_ia`
 *      com tipo = 'aguardando_analise'.
 *   3. Fica em polling a cada 2 s aguardando um registro tipo = 'resposta_ia'
 *      com o mesmo job_id.
 *   4. Quando encontrar, retorna o JSON da resposta ao cliente e encerra.
 *
 * Resiliência:
 *   - Todas as operações MySQL são envolvidas em try/catch com retry automático
 *     usando getPDO() que reconecta em caso de queda.
 *   - Timeout de 120 s para não deixar o browser pendurado para sempre.
 */

header('Content-Type: application/json; charset=utf-8');
include_once '../../../conn.php';

// ─── Auth ─────────────────────────────────────────────────────────────────────
$headers = function_exists('getallheaders') ? getallheaders() : [];
$token   = null;
foreach ($headers as $k => $v) {
    if (strtolower($k) === 'authorization') { $token = str_replace('Bearer ', '', $v); break; }
}
if (!$token && isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $token = str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION']);
}
if (!$token) { http_response_code(401); exit; }

// ─── Configurações ────────────────────────────────────────────────────────────
define('POLL_INTERVAL_SECONDS', 2);
define('MAX_WAIT_SECONDS',      120);  // timeout total de espera

// ─── Função de conexão resiliente ────────────────────────────────────────────
$pdoInstance = null;

function getPDO(): PDO {
    global $pdoInstance;
    // Testa se a conexão ainda está viva; se não, reconecta.
    if ($pdoInstance !== null) {
        try {
            $pdoInstance->query('SELECT 1');
            return $pdoInstance;
        } catch (Exception $e) {
            $pdoInstance = null;
        }
    }
    $tentativas = 0;
    while (true) {
        $tentativas++;
        try {
            $pdo = new PDO(
                "mysql:host={$GLOBALS['enderecoLocal']};dbname={$GLOBALS['dbKaisan']};charset=utf8mb4",
                $GLOBALS['usuarioRoot'],
                $GLOBALS['senhaRoot'],
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
                ]
            );
            $pdoInstance = $pdo;
            return $pdo;
        } catch (Exception $e) {
            if ($tentativas >= 5) {
                http_response_code(503);
                echo json_encode(['status' => 'error', 'message' => 'Banco indisponível: ' . $e->getMessage()]);
                exit;
            }
            sleep(2);
        }
    }
}

// ─── Garante que a tabela existe ─────────────────────────────────────────────
function garantirTabela(): void {
    $pdo = getPDO();
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `conciliacao_jobs_ia` (
            `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `job_id`       VARCHAR(64)  NOT NULL,
            `tipo`         VARCHAR(50)  NOT NULL COMMENT 'aguardando_analise | resposta_ia',
            `arquivo_nome` VARCHAR(255) DEFAULT NULL,
            `arquivo_mime` VARCHAR(100) DEFAULT NULL,
            `empresas_json` MEDIUMTEXT  DEFAULT NULL,
            `arquivo_blob` LONGBLOB     DEFAULT NULL   COMMENT 'apagado após resposta',
            `resposta_json` LONGTEXT    DEFAULT NULL,
            `criado_em`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            INDEX `idx_job_tipo` (`job_id`, `tipo`),
            INDEX `idx_tipo_criado` (`tipo`, `criado_em`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

// ─── Upload ───────────────────────────────────────────────────────────────────
if (!isset($_FILES['arquivo']) || $_FILES['arquivo']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['status' => 'error', 'message' => 'Erro no upload do arquivo']);
    exit;
}

$file        = $_FILES['arquivo'];
$ext         = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$hash        = md5_file($file['tmp_name']);
$newFileName = $hash . '.' . $ext;
$mimeType    = mime_content_type($file['tmp_name']);
$fileBytes   = file_get_contents($file['tmp_name']);

if ($fileBytes === false) {
    echo json_encode(['status' => 'error', 'message' => 'Falha ao ler o arquivo']);
    exit;
}

// ─── Verifica hash duplicado em conciliações existentes ──────────────────────
// Busca em conciliacao_bancaria qualquer registro cujo campo `anexos` (JSON)
// contenha um anexo com o mesmo hash — em ambos os formatos de estrutura.
try {
    $pdo      = getPDO();
    $stmtHash = $pdo->prepare("
        SELECT id
        FROM   conciliacao_bancaria
        WHERE  JSON_SEARCH(anexos, 'one', :hash,  NULL, '$[*].hash')       IS NOT NULL
            OR JSON_SEARCH(anexos, 'one', :hash2, NULL, '$[*].dados.hash') IS NOT NULL
        LIMIT  1
    ");
    $stmtHash->execute([':hash' => $hash, ':hash2' => $hash]);
    $duplicadoId = $stmtHash->fetchColumn();

    if ($duplicadoId) {
        echo json_encode([
            'status'  => 'error',
            'message' => "⚠️ Este arquivo já foi anexado na conciliação <strong>#$duplicadoId</strong>. Envio bloqueado para evitar duplicidade.",
        ]);
        exit;
    }
} catch (Exception $e) {
    // Não bloqueia o fluxo por erro de consulta (ex: tabela sem dados ainda)
}

// Salva no disco (mantém compatibilidade com o restante do sistema)
$uploadDir = $_SERVER['DOCUMENT_ROOT'] . '/uploads/conciliacao_bancaria/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);
$destPath = $uploadDir . $newFileName;
move_uploaded_file($file['tmp_name'], $destPath);   // silencioso se falhar — blob é o canal principal

// ─── Monta lista de empresas ──────────────────────────────────────────────────
$empresasList = [];
if (!empty($GLOBALS['CONFIG_EMPRESAS'])) {
    $empParsed = json_decode($GLOBALS['CONFIG_EMPRESAS'], true);
    if (is_array($empParsed)) {
        foreach ($empParsed as $emp) {
            $empresasList[] = [
                'id'   => $emp['id'],
                'nome' => $emp['nome_fantasia'],
                'cnpj' => $emp['cnpj'] ?? '',
            ];
        }
    }
}
$empresasJson = json_encode($empresasList, JSON_UNESCAPED_UNICODE);

// ─── Insere job na fila ───────────────────────────────────────────────────────
garantirTabela();

$jobId = uniqid('job_', true);

$tentativas = 0;
while (true) {
    $tentativas++;
    try {
        $pdo  = getPDO();
        $stmt = $pdo->prepare("
            INSERT INTO conciliacao_jobs_ia
                (job_id, tipo, arquivo_nome, arquivo_mime, empresas_json, arquivo_blob)
            VALUES
                (:job_id, 'aguardando_analise', :nome, :mime, :empresas, :blob)
        ");
        $stmt->bindValue(':job_id',   $jobId);
        $stmt->bindValue(':nome',     $newFileName);
        $stmt->bindValue(':mime',     $mimeType);
        $stmt->bindValue(':empresas', $empresasJson);
        $stmt->bindValue(':blob',     $fileBytes,   PDO::PARAM_LOB);
        $stmt->execute();
        break;
    } catch (Exception $e) {
        if ($tentativas >= 5) {
            echo json_encode(['status' => 'error', 'message' => 'Erro ao enfileirar: ' . $e->getMessage()]);
            exit;
        }
        $pdoInstance = null;
        sleep(2);
    }
}

// ─── Polling: aguarda resposta do Python ─────────────────────────────────────
$inicio = time();

while (true) {
    $esperado = time() - $inicio;
    if ($esperado >= MAX_WAIT_SECONDS) {
        // Remove o job pendente para não acumular lixo
        try {
            getPDO()->prepare("DELETE FROM conciliacao_jobs_ia WHERE job_id = ?")->execute([$jobId]);
        } catch (Exception $ignored) {}

        echo json_encode(['status' => 'error', 'message' => 'Timeout: a análise IA demorou mais que ' . MAX_WAIT_SECONDS . 's']);
        exit;
    }

    sleep(POLL_INTERVAL_SECONDS);

    try {
        $pdo  = getPDO();
        $stmt = $pdo->prepare("
            SELECT resposta_json
            FROM   conciliacao_jobs_ia
            WHERE  job_id = ? AND tipo = 'resposta_ia'
            LIMIT  1
        ");
        $stmt->execute([$jobId]);
        $row = $stmt->fetch();

        if ($row) {
            $analysis = json_decode($row['resposta_json'], true);
            if (!is_array($analysis)) {
                $analysis = [
                    'fatura' => [], 'parcelas' => [], 'codigos_pagamentos' => [],
                    'transcricao' => '', 'solucoes_ia' => [], 'solucoes_count' => 0,
                ];
            }

            // ─── Monta objeto final do anexo ──────────────────────────────────
            $novoAnexo = [
                // Estrutura nova
                'dados' => [
                    'hash'          => $hash,
                    'arquivo'       => $newFileName,
                    'nome_original' => $file['name'],
                    'formato'       => $ext,
                    'mime'          => $mimeType,
                    'data_analise'  => date('Y-m-d H:i:s'),
                ],
                'codigos'        => $analysis['codigos_pagamentos'] ?? [],
                'transcricao'    => $analysis['transcricao']        ?? '',
                'solucoes_ia'    => $analysis['solucoes_ia']         ?? [
                    'solucao_geral' => null, 'solucao_financeira' => [],
                    'solucao_fatura' => null, 'anotacao' => '',
                ],
                'solucoes_count' => $analysis['solucoes_count']      ?? 0,

                // Legado (compatibilidade)
                'hash'               => $hash,
                'arquivo'            => $newFileName,
                'nome_original'      => $file['name'],
                'data_analise'       => date('Y-m-d H:i:s'),
                'fatura'             => $analysis['fatura']              ?? [],
                'parcelas'           => $analysis['parcelas']            ?? [],
                'codigos_pagamentos' => $analysis['codigos_pagamentos']  ?? [],
            ];

            echo json_encode(['status' => 'success', 'anexo' => $novoAnexo]);
            exit;
        }
    } catch (Exception $e) {
        // Queda de conexão — zera a instância e tenta reconectar no próximo ciclo
        $pdoInstance = null;
        // Não interrompe o loop; tenta de novo após POLL_INTERVAL_SECONDS
    }
}
?>