/**
 * Notifications handler for MA Projetos dashboard
 * Loads and displays alerts in the notifications panel
 */

// Load notifications when document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initial load
    loadNotifications();
    
    // Set up refresh interval (every 5 minutes)
    setInterval(loadNotifications, 300000); // 5 minutes = 300000 ms
    
    // Mark notifications as read when panel is opened
    const notificationToggle = document.querySelector('[data-bs-target="#notifications"]');
    if (notificationToggle) {
        notificationToggle.addEventListener('click', function() {
            markNotificationsAsRead();
        });
    }

    // Global alert action handler (delegated from the container)
    const notificationsContainer = document.querySelector('#notifications .offcanvas-body');
    if (notificationsContainer) {
        notificationsContainer.addEventListener('click', function(event) {
            const activateButton = event.target.closest('.activate-user-btn');
            if (activateButton) {
                event.preventDefault();
                const userIdToActivate = activateButton.dataset.userId;
                const permissionsRaw = localStorage.getItem('permission');
                const permissions = permissionsRaw ? JSON.parse(permissionsRaw) : [];

                if (permissions.includes('ROOT')) {
                    if (confirm(`Deseja ativar o usuário ID ${userIdToActivate}?`)) {
                        fetch('/api/activate-user.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                            body: JSON.stringify({ userIdToActivate: userIdToActivate })
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                showAlertGlobally(data.message, false); // Use a global showAlert if available
                                loadNotifications(); // Refresh notifications to update the activated alert
                            } else {
                                showAlertGlobally(data.message || 'Erro ao ativar usuário.', true);
                            }
                        })
                        .catch(error => {
                            console.error('Erro ao ativar usuário:', error);
                            showAlertGlobally('Erro de comunicação ao tentar ativar usuário.', true);
                        });
                    }
                } else {
                    showAlertGlobally('Você não tem permissão para ativar usuários.', true);
                }
            }
        });
    }
});

// Helper function to show global alerts (assuming one exists in index.js or similar)
function showAlertGlobally(message, isError = true) {
    // This function should call the global alert mechanism, e.g., the one in index.js
    // For simplicity, we'll log to console if it's not available,
    // but ideally, it would trigger the modal.
    if (typeof showAlert === 'function' && showAlert.name !== 'showAlertGlobally') { // Avoid recursion if showAlert is this one
        showAlert(message, isError);
    } else {
        console.warn(`Global showAlert not available. Message (${isError ? 'Error' : 'Success'}): ${message}`);
        alert(message); // Fallback to browser alert
    }
}


/**
 * Load notifications from the server
 */
function loadNotifications() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        // console.warn('User not authenticated, cannot load notifications');
        return;
    }
    
    fetch('/api/alertas.php', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // console.log('Notifications data received:', data);
            updateNotificationsUI(data);
        } else {
            console.error('Error loading notifications:', data.message);
        }
    })
    .catch(error => {
        console.error('Error fetching notifications:', error);
    });
}

/**
 * Update the UI with notifications data
 * @param {Object} data - The notifications data from the server
 */
function updateNotificationsUI(data) {
    // DIRECT UPDATE: Find the badge and set its value directly
    const badge = document.querySelector('[data-bs-target="#notifications"] .badge');
    
    if (badge) {
        // console.log('Badge found, updating to:', data.unread);
        
        // Set the text content to the unread count
        badge.textContent = data.unread;
        
        // Show/hide based on unread count
        if (data.unread > 0) {
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    } else {
        // console.error('Badge element not found in DOM');
        // Attempt to find any badge element for debugging
        // const allBadges = document.querySelectorAll('.badge');
        // console.log('All badge elements found:', allBadges);
    }
    
    // Get the notifications container
    const notificationsContainer = document.querySelector('#notifications .offcanvas-body');
    
    if (!notificationsContainer) {
        console.error('Notifications container not found');
        return;
    }
    
    // Clear the "New notifications" section
    let newNotificationsSection = notificationsContainer.querySelector('.new-notifications-container');
    if (!newNotificationsSection) {
        // Create the section if it doesn't exist
        notificationsContainer.innerHTML = `
            <div class="bg-light fw-medium py-2 px-3">Novos alertas</div>
            <div class="new-notifications-container p-3"></div>
        `;
        newNotificationsSection = notificationsContainer.querySelector('.new-notifications-container');
    } else {
        newNotificationsSection.innerHTML = ''; // Clear only the dynamic part
    }
    
    // If no notifications, show a message
    if (data.total === 0) {
        newNotificationsSection.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="ph-bell-slash ph-2x mb-2"></i>
                <p>Nenhum alerta nos últimos 5 dias</p>
            </div>
        `;
        return;
    }
    
    // Add notifications to the container
    data.alerts.forEach(alert => {
        // Create notification element
        const alertElement = document.createElement('div');
        alertElement.className = `d-flex align-items-start mb-3 ${alert.unread ? 'fw-semibold' : ''}`;
        alertElement.dataset.alertId = alert.id;
        
        // Determine alert color class for the icon (not for the button itself)
        let iconColorClass = 'bg-primary'; // Default for the icon's background
        switch (alert.tipo) {
            case 'danger':
                iconColorClass = 'bg-danger';
                break;
            case 'warning':
                iconColorClass = 'bg-warning';
                break;
            case 'success':
                iconColorClass = 'bg-success';
                break;
            case 'info':
            default:
                iconColorClass = 'bg-primary';
        }
        
        let alertTextPart = `<div>${alert.descritivo}</div>`; // Main description

        // Check for activation link
        let buttonsHTML = '';
        if (alert.link && alert.link.startsWith('#ativarUsuario_')) {
            const userIdToActivate = alert.link.substring('#ativarUsuario_'.length);
            const permissionsRaw = localStorage.getItem('permission');
            const permissions = permissionsRaw ? JSON.parse(permissionsRaw) : [];

            // Only show button if user has ROOT permission
            if (permissions.includes('ROOT')) {
                 buttonsHTML = `
                    <div class="my-2">
                        <button class="btn btn-success btn-sm activate-user-btn" data-user-id="${userIdToActivate}">
                            <i class="ph-user-check ph-sm me-1"></i>
                            Ativar Usuário
                        </button>
                    </div>`;
            }
        } else if (alert.link) {
            // If it's a general link, make the description text a link
            const escapedLink = alert.link.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            alertTextPart = `<div><a href="${escapedLink}" class="text-body fw-semibold">${alert.descritivo}</a></div>`;
            
            // Make the entire alert item clickable if it has a non-activation general link
            alertElement.style.cursor = 'pointer';
            alertElement.addEventListener('click', function(event) {
                // Prevent click if it's on an internal action button (like the activate button, though not expected here)
                if (event.target.closest('.activate-user-btn') || event.target.closest('.btn')) { 
                    return;
                }
                window.location.href = alert.link; // Navigate to the general link
            });
        }

        // Build the complete HTML for the alert item
        alertElement.innerHTML = `
            <div class="me-3">
                <div class="bg-light rounded-pill p-2 text-center">
                    <i class="${alert.icon} ${iconColorClass} text-white p-1 rounded-pill"></i>
                </div>
            </div>
            <div class="flex-fill">
                ${alertTextPart}
                ${buttonsHTML}
                <div class="fs-sm text-muted mt-1">${alert.time_ago}</div>
            </div>
        `;
        
        // Add to the container
        newNotificationsSection.appendChild(alertElement);
    });
}

/**
 * Mark all notifications as read by updating the user's alerta_data timestamp
 */
function markNotificationsAsRead() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        return;
    }
    
    // Check if there are unread messages before making the API call
    const badge = document.querySelector('[data-bs-target="#notifications"] .badge');
    if (badge && parseInt(badge.textContent, 10) === 0) {
        // console.log('No unread notifications to mark as read.');
        return;
    }
    
    fetch('/api/mark-read.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the notification badge - direct approach
            // const badge = document.querySelector('[data-bs-target="#notifications"] .badge'); // Already defined above
            if (badge) {
                badge.textContent = '0';
                badge.style.display = 'none';
            }
            
            // Update the notification items to remove bold styling
            const notificationItems = document.querySelectorAll('.new-notifications-container .fw-semibold');
            notificationItems.forEach(item => {
                item.classList.remove('fw-semibold');
            });
            
            // Store the current timestamp locally
            localStorage.setItem('lastAlertRead', data.timestamp);
        } else {
            console.error('Error marking notifications as read:', data.message);
        }
    })
    .catch(error => {
        console.error('Error calling mark-read API:', error);
    });
}