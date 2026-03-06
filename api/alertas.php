<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Authorization");
header("Content-type: application/json; charset=utf-8");
date_default_timezone_set('America/Sao_Paulo');

include_once $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

/**
 * Define array maps for alert elements
 * This reduces database storage and improves performance
 */

// Icon mapping (icon_id => icon class)
$ICON_MAP = [
    1 => 'ph-bell',                    // Default
    2 => 'ph-currency-circle-dollar',  // Finance
    3 => 'ph-warning-circle',          // Warning / Revisão de Credor (Pode ser usado para o descritivo_id 14)
    4 => 'ph-user-circle-plus',        // User
    5 => 'ph-hourglass',               // Time/Wait
    6 => 'ph-gear',                    // System/Settings
    7 => 'ph-check-circle',            // Success/Confirmation
    8 => 'ph-info',                    // Information
    9 => 'ph-x-circle',                // Error/Denial
    10 => 'ph-calendar',               // Calendar/Schedule
    11 => 'ph-file-text',              // Document
    12 => 'ph-shopping-cart'           // Purchase/Order
    // Se precisar de um ícone específico para "Revisão de Credor", adicione aqui. Ex: 15 => 'ph-users-three'
];

// Alert type mapping (tipo_id => tipo name)
$TIPO_MAP = [
    1 => 'info',      // Default blue
    2 => 'warning',   // Yellow (Pode ser usado para o descritivo_id 14)
    3 => 'success',   // Green
    4 => 'danger'     // Red
];

// Description templates mapping (descritivo_id => template)
$DESCRITIVO_MAP = [
    1 => 'Nova previsão financeira disponível para o %s',
    2 => 'Alerta: Orçamento excedido em %s no projeto %s',
    3 => '%s novos contatos adicionados ao LinkedIn',
    4 => 'Cotação #%s necessita de aprovação',
    5 => 'Nova atualização do sistema disponível',
    6 => 'Relatório %s foi finalizado',
    7 => 'Solicitação #%s foi %s',
    8 => 'Documento #%s recebeu comentários',
    9 => 'Reunião agendada: %s',
    10 => 'Lembrete: %s',
    11 => 'Solicitação #%s aprovada pel@ engenheir@ da obra',
    12 => 'Solicitação #%s aprovada pel@ diretor de engenharia',
    13 => 'Previsão de entrega para o Pedido #%s (item %s): %s',
    14 => 'Possível credor incorreto para NF XML ID %s (NF %s). NF Sienge ID %s (NF %s) tem fornecedor similar.',
    15 => 'Novo usuário registrado: %s. Ativar?'
];

// Get the token from the Authorization header - UPDATED for case-insensitive header handling
$headers = getallheaders();
$token = null;

// Case-insensitive search for Authorization header
if (is_array($headers)) { // Adicionado para evitar erro se getallheaders() não retornar array
    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'authorization') {
            // Use preg_match to correctly extract the token part after "Bearer "
            if (preg_match('/Bearer\s(\S+)/i', $value, $matches)) {
                $token = $matches[1];
            }
            break;
        }
    }
}


// If token is not in headers, check if it was sent in the request body
if (empty($token)) {
    $data = json_decode(file_get_contents('php://input'), true);
    $token = isset($data['token']) ? $data['token'] : null;
}

// If still no token, return error
if (empty($token)) {
    $response = [
        'success' => false,
        'message' => 'Token não fornecido'
    ];
    echo json_encode($response);
    exit;
}

// Connect to database with improved error handling
try {
    $mysqliGlobalLocal = new mysqli($enderecoLocal, $usuarioRoot, $senhaRoot, $dbGlobal);

    if ($mysqliGlobalLocal->connect_error) {
        throw new Exception("Erro de conexão: " . $mysqliGlobalLocal->connect_error);
    }

    $mysqliGlobalLocal->set_charset("utf8mb4");

} catch (Exception $e) {
    $response = [
        'success' => false,
        'message' => $e->getMessage()
    ];
    echo json_encode($response);
    exit;
}

// Sanitize token
$token = $mysqliGlobalLocal->real_escape_string($token);

// Get user data based on token - use prepared statement for security
$stmt = $mysqliGlobalLocal->prepare("SELECT * FROM usuarios WHERE token = ?");
$stmt->bind_param("s", $token);
$stmt->execute();
$result = $stmt->get_result();

if (!$result || $result->num_rows === 0) {
    $response = [
        'success' => false,
        'message' => 'Token inválido ou expirado'
    ];
    echo json_encode($response);
    $mysqliGlobalLocal->close();
    exit;
}

// Get user data and permissions
$user = $result->fetch_assoc();
$permissoes = explode(',', $user['permissoes']);
$userId = $user['id'];
$lastAlertaData = intval($user['alerta_data'] ?? 0);

// Prepare IN clause for SQL using user permissions - use prepared statement
if (empty($permissoes)) { // Handle case where user might have no permissions explicitly listed
    $permissoes = ['__NO_PERMISSION__']; // Add a dummy value to prevent SQL error with empty IN ()
}
$placeholders = str_repeat('?,', count($permissoes) - 1) . '?';
$types = str_repeat('s', count($permissoes));

// Get alerts from the last 5 days
$fiveDaysAgo = time() - (5 * 24 * 60 * 60);

$alertsQuery = "SELECT * FROM alertas 
                WHERE data >= ? 
                AND permissao IN ($placeholders)
                ORDER BY data DESC";

$stmtAlerts = $mysqliGlobalLocal->prepare($alertsQuery); // Renomeado para evitar conflito com $stmt anterior

// Create parameter array starting with five days ago timestamp
$params = array_merge([$fiveDaysAgo], $permissoes);

// Bind parameters dynamically
$bindTypes = 'i' . $types; // 'i' for fiveDaysAgo + types for permissions
$stmtAlerts->bind_param($bindTypes, ...$params);
$stmtAlerts->execute();
$alertsResult = $stmtAlerts->get_result();

if (!$alertsResult) {
    $response = [
        'success' => false,
        'message' => 'Erro ao buscar alertas: ' . $mysqliGlobalLocal->error
    ];
    echo json_encode($response);
    $stmt->close(); // Fechar o statement original
    $stmtAlerts->close(); // Fechar o statement de alertas
    $mysqliGlobalLocal->close();
    exit;
}

// Process alerts and apply mappings
$alerts = [];
$unreadCount = 0;

while ($alert = $alertsResult->fetch_assoc()) {
    // Determine if this alert is unread
    $isUnread = intval($alert['data']) > $lastAlertaData;
    if ($isUnread) {
        $unreadCount++;
    }

    // Get icon class from map
    $iconClass = isset($ICON_MAP[$alert['icon_id']])
        ? $ICON_MAP[$alert['icon_id']]
        : $ICON_MAP[1]; // Default to bell icon

    // Get alert type from map
    $tipoName = isset($TIPO_MAP[$alert['tipo_id']])
        ? $TIPO_MAP[$alert['tipo_id']]
        : $TIPO_MAP[1]; // Default to info type

    // Get description template and apply variables
    $descritivoTemplate = isset($DESCRITIVO_MAP[$alert['descritivo_id']])
        ? $DESCRITIVO_MAP[$alert['descritivo_id']]
        : 'Alerta: %s'; // Default template, mais genérico

    // Format the description by replacing placeholders with variables
    // Ensure variavel is treated as string for explode
    $alertVariavel = (string)($alert['variavel'] ?? '');
    $descritivo = $alertVariavel !== ''
        ? vsprintf($descritivoTemplate, explode('|', $alertVariavel))
        : sprintf($descritivoTemplate, ''); // Handle cases where template expects a var but none given

    // Add to alerts array
    $alerts[] = [
        'id' => $alert['id'],
        'descritivo' => $descritivo,
        'data' => $alert['data'],
        'data_formatada' => date('d/m/Y H:i', (int)$alert['data']), // Cast to int
        'time_ago' => timeAgo((int)$alert['data']), // Cast to int
        'tipo' => $tipoName,
        'unread' => $isUnread,
        'link' => $alert['link'],
        'icon' => $iconClass
    ];
}

// Return success response
$response = [
    'success' => true,
    'total' => count($alerts),
    'unread' => $unreadCount,
    'alerts' => $alerts,
    'userId' => $userId,
    'lastReadTime' => $lastAlertaData
];

echo json_encode($response);

// Fechar todos os statements e a conexão
$stmt->close();
$stmtAlerts->close();
$mysqliGlobalLocal->close();

/**
 * Convert timestamp to human-readable "time ago" format
 *
 * @param int $timestamp Unix timestamp
 * @return string Human readable time difference
 */
function timeAgo($timestamp) {
    $diff = time() - $timestamp;

    if ($diff < 60) {
        return "Agora";
    } else if ($diff < 3600) {
        $mins = floor($diff / 60);
        return $mins . " min atrás";
    } else if ($diff < 86400) {
        $hours = floor($diff / 3600);
        return $hours . " h atrás";
    } else if ($diff < 172800) { // Changed from $diff < (2 * 86400) to cover full 24-48h range as "Ontem"
        return "Ontem";
    } else {
        $days = floor($diff / 86400);
        return $days . " dias atrás";
    }
}
?>