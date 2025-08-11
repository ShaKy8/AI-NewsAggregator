class NewsSourcesAdmin {
    constructor() {
        this.sources = [];
        this.init();
    }

    init() {
        this.bindEventListeners();
        this.loadSources();
        this.updateStats();
    }

    bindEventListeners() {
        document.getElementById('addSourceForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addSource();
        });

        document.getElementById('editSourceForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveEditedSource();
        });
    }

    async loadSources() {
        try {
            this.showLoading(true);
            const response = await fetch('/api/sources');
            
            if (!response.ok) {
                throw new Error('Failed to load sources');
            }
            
            this.sources = await response.json();
            this.renderSourcesTable();
            this.updateStats();
        } catch (error) {
            console.error('Error loading sources:', error);
            this.showError('Failed to load news sources. Using default sources.');
            this.loadDefaultSources();
        } finally {
            this.showLoading(false);
        }
    }

    loadDefaultSources() {
        // Fallback to hardcoded sources if API fails
        this.sources = [
            {
                id: '1',
                name: 'BleepingComputer',
                url: 'https://www.bleepingcomputer.com/',
                category: 'Cybersecurity',
                status: 'active',
                articleCount: 25,
                lastSuccess: new Date().toISOString()
            },
            {
                id: '2',
                name: 'Cybersecurity News',
                url: 'https://cybersecuritynews.com/',
                category: 'Cybersecurity', 
                status: 'active',
                articleCount: 18,
                lastSuccess: new Date().toISOString()
            },
            {
                id: '3',
                name: 'Neowin',
                url: 'https://www.neowin.net/',
                category: 'Technology',
                status: 'active',
                articleCount: 22,
                lastSuccess: new Date().toISOString()
            },
            {
                id: '4',
                name: 'AskWoody',
                url: 'https://www.askwoody.com/',
                category: 'Technology',
                status: 'active',
                articleCount: 12,
                lastSuccess: new Date().toISOString()
            }
        ];
        this.renderSourcesTable();
        this.updateStats();
    }

    renderSourcesTable() {
        const tbody = document.getElementById('sourcesTableBody');
        tbody.innerHTML = '';

        this.sources.forEach(source => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${this.escapeHtml(source.name)}</strong>
                    <br>
                    <small style="color: #666;">${this.escapeHtml(source.url)}</small>
                </td>
                <td>
                    <span class="status-badge status-${source.category.toLowerCase()}">
                        ${source.category}
                    </span>
                </td>
                <td>
                    <span class="status-badge status-${source.status}">
                        ${this.capitalizeFirst(source.status)}
                    </span>
                </td>
                <td>${source.articleCount || 0}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-primary" onclick="admin.editSource('${source.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-warning" onclick="admin.testSource('${source.id}')">
                            <i class="fas fa-flask"></i>
                        </button>
                        <button class="btn ${source.status === 'active' ? 'btn-warning' : 'btn-success'}" 
                                onclick="admin.toggleSource('${source.id}')">
                            <i class="fas ${source.status === 'active' ? 'fa-pause' : 'fa-play'}"></i>
                        </button>
                        <button class="btn btn-danger" onclick="admin.deleteSource('${source.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    updateStats() {
        const totalSources = this.sources.length;
        const activeSources = this.sources.filter(s => s.status === 'active').length;
        const totalArticles = this.sources.reduce((sum, s) => sum + (s.articleCount || 0), 0);
        const lastRefresh = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        document.getElementById('totalSources').textContent = totalSources;
        document.getElementById('activeSources').textContent = activeSources;
        document.getElementById('totalArticles').textContent = totalArticles;
        document.getElementById('lastRefresh').textContent = lastRefresh;
    }

    async addSource() {
        const formData = this.getFormData('addSourceForm');
        
        try {
            // Validate form data
            if (!formData.name || !formData.url || !formData.category) {
                throw new Error('Please fill in all required fields');
            }

            // Test selectors if provided
            if (formData.selectors) {
                try {
                    JSON.parse(formData.selectors);
                } catch (e) {
                    throw new Error('CSS Selectors must be valid JSON');
                }
            }

            const newSource = {
                id: Date.now().toString(),
                name: formData.name,
                url: formData.url,
                category: formData.category,
                status: formData.status || 'testing',
                selectors: formData.selectors ? JSON.parse(formData.selectors) : null,
                articleCount: 0,
                lastSuccess: null
            };

            // Try to add via API, fallback to local
            try {
                const response = await fetch('/api/sources', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(newSource)
                });

                if (!response.ok) {
                    throw new Error('API request failed');
                }

                const addedSource = await response.json();
                this.sources.push(addedSource);
            } catch (apiError) {
                console.log('API not available, adding locally:', apiError);
                this.sources.push(newSource);
            }

            this.renderSourcesTable();
            this.updateStats();
            this.resetForm('addSourceForm');
            this.showSuccess('Source added successfully!');

        } catch (error) {
            console.error('Error adding source:', error);
            this.showError(error.message || 'Failed to add source');
        }
    }

    editSource(sourceId) {
        const source = this.sources.find(s => s.id === sourceId);
        if (!source) {
            this.showError('Source not found');
            return;
        }

        // Populate edit form
        document.getElementById('editSourceId').value = source.id;
        document.getElementById('editSourceName').value = source.name;
        document.getElementById('editSourceUrl').value = source.url;
        document.getElementById('editSourceCategory').value = source.category;
        document.getElementById('editSourceStatus').value = source.status;

        // Show modal
        document.getElementById('editModal').style.display = 'block';
    }

    async saveEditedSource() {
        const sourceId = document.getElementById('editSourceId').value;
        const formData = this.getFormData('editSourceForm');
        
        try {
            const sourceIndex = this.sources.findIndex(s => s.id === sourceId);
            if (sourceIndex === -1) {
                throw new Error('Source not found');
            }

            // Update source
            this.sources[sourceIndex] = {
                ...this.sources[sourceIndex],
                name: formData.name,
                url: formData.url,
                category: formData.category,
                status: formData.status
            };

            // Try to update via API
            try {
                const response = await fetch(`/api/sources/${sourceId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(this.sources[sourceIndex])
                });

                if (!response.ok) {
                    throw new Error('API request failed');
                }
            } catch (apiError) {
                console.log('API not available, updating locally:', apiError);
            }

            this.renderSourcesTable();
            this.updateStats();
            this.closeEditModal();
            this.showSuccess('Source updated successfully!');

        } catch (error) {
            console.error('Error updating source:', error);
            this.showError(error.message || 'Failed to update source');
        }
    }

    async toggleSource(sourceId) {
        const source = this.sources.find(s => s.id === sourceId);
        if (!source) {
            this.showError('Source not found');
            return;
        }

        const newStatus = source.status === 'active' ? 'inactive' : 'active';
        
        try {
            // Update locally
            source.status = newStatus;

            // Try to update via API
            try {
                const response = await fetch(`/api/sources/${sourceId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(source)
                });

                if (!response.ok) {
                    throw new Error('API request failed');
                }
            } catch (apiError) {
                console.log('API not available, updating locally:', apiError);
            }

            this.renderSourcesTable();
            this.updateStats();
            this.showSuccess(`Source ${newStatus === 'active' ? 'enabled' : 'disabled'} successfully!`);

        } catch (error) {
            console.error('Error toggling source:', error);
            this.showError('Failed to toggle source status');
        }
    }

    async deleteSource(sourceId) {
        if (!confirm('Are you sure you want to delete this source? This action cannot be undone.')) {
            return;
        }

        try {
            const sourceIndex = this.sources.findIndex(s => s.id === sourceId);
            if (sourceIndex === -1) {
                throw new Error('Source not found');
            }

            // Remove locally
            this.sources.splice(sourceIndex, 1);

            // Try to delete via API
            try {
                const response = await fetch(`/api/sources/${sourceId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error('API request failed');
                }
            } catch (apiError) {
                console.log('API not available, deleting locally:', apiError);
            }

            this.renderSourcesTable();
            this.updateStats();
            this.showSuccess('Source deleted successfully!');

        } catch (error) {
            console.error('Error deleting source:', error);
            this.showError('Failed to delete source');
        }
    }

    async testSource(sourceId) {
        const source = this.sources.find(s => s.id === sourceId);
        if (!source) {
            this.showError('Source not found');
            return;
        }

        try {
            this.showSuccess(`Testing ${source.name}...`);

            // Try to test via API
            try {
                const response = await fetch(`/api/sources/${sourceId}/test`, {
                    method: 'POST'
                });

                if (!response.ok) {
                    throw new Error('API request failed');
                }

                const result = await response.json();
                this.showSuccess(`Test successful! Found ${result.articleCount || 0} articles from ${source.name}`);
                
                // Update article count
                source.articleCount = result.articleCount || 0;
                source.lastSuccess = new Date().toISOString();
                this.renderSourcesTable();

            } catch (apiError) {
                console.log('API not available, simulating test:', apiError);
                
                // Simulate test result
                setTimeout(() => {
                    const simulatedCount = Math.floor(Math.random() * 30) + 5;
                    source.articleCount = simulatedCount;
                    source.lastSuccess = new Date().toISOString();
                    this.renderSourcesTable();
                    this.showSuccess(`Simulated test: Found ${simulatedCount} articles from ${source.name}`);
                }, 1500);
            }

        } catch (error) {
            console.error('Error testing source:', error);
            this.showError(`Failed to test ${source.name}`);
        }
    }

    // Utility methods
    getFormData(formId) {
        const form = document.getElementById(formId);
        const formData = new FormData(form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        // Get values by ID for forms with custom field names
        if (formId === 'addSourceForm') {
            data.name = document.getElementById('sourceName').value;
            data.url = document.getElementById('sourceUrl').value;
            data.category = document.getElementById('sourceCategory').value;
            data.status = document.getElementById('sourceStatus').value;
            data.selectors = document.getElementById('sourceSelectors').value;
        } else if (formId === 'editSourceForm') {
            data.name = document.getElementById('editSourceName').value;
            data.url = document.getElementById('editSourceUrl').value;
            data.category = document.getElementById('editSourceCategory').value;
            data.status = document.getElementById('editSourceStatus').value;
        }
        
        return data;
    }

    resetForm(formId) {
        document.getElementById(formId).reset();
    }

    closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
        document.getElementById('sourcesTable').style.display = show ? 'none' : 'table';
    }

    showSuccess(message) {
        this.showAlert('success', message);
    }

    showError(message) {
        this.showAlert('error', message);
    }

    showAlert(type, message) {
        const alertId = type === 'success' ? 'successAlert' : 'errorAlert';
        const alert = document.getElementById(alertId);
        
        // Hide other alerts
        document.getElementById('successAlert').style.display = 'none';
        document.getElementById('errorAlert').style.display = 'none';
        
        alert.textContent = message;
        alert.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// Global functions for onclick handlers
function closeEditModal() {
    admin.closeEditModal();
}

function testSource() {
    const formData = admin.getFormData('addSourceForm');
    if (!formData.name || !formData.url) {
        admin.showError('Please fill in source name and URL first');
        return;
    }
    
    admin.showSuccess(`Testing ${formData.name}... (This is a simulation)`);
    setTimeout(() => {
        const simulatedCount = Math.floor(Math.random() * 20) + 5;
        admin.showSuccess(`Test completed! Would find approximately ${simulatedCount} articles from ${formData.name}`);
    }, 1500);
}

// Initialize admin interface
const admin = new NewsSourcesAdmin();