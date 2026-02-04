/**
 * Application UI Logic - Backend API Version
 * Updated to call backend APIs instead of client-side processing
 */

// API Configuration
const API_BASE_URL = window.location.origin;

// Tab Navigation
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'status') {
        refreshStatus();
    }
}

// Fetch ValueSet Bundle/ValueSet from URL
async function fetchValueSetFromUrl() {
    const url = document.getElementById('valuesetUrl').value.trim();
    const output = document.getElementById('valuesetOutput');
    
    if (!url) {
        output.textContent = 'Please provide a URL.';
        output.className = 'output error';
        return;
    }
    
    try {
        output.textContent = 'Fetching from URL...';
        output.className = 'output';
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        document.getElementById('valuesetInput').value = JSON.stringify(data, null, 2);
        
        output.textContent = 'Successfully fetched from URL. Click "Process ValueSets" to continue.';
        output.className = 'output success';
        
    } catch (error) {
        output.textContent = `Error fetching from URL: ${error.message}`;
        output.className = 'output error';
    }
}

// API 1: Process ValueSets
async function processValueSets() {
    const input = document.getElementById('valuesetInput').value.trim();
    const output = document.getElementById('valuesetOutput');
    
    if (!input) {
        output.textContent = 'Please provide a FHIR Bundle with ValueSet resources.';
        output.className = 'output error';
        return;
    }
    
    try {
        const bundle = JSON.parse(input);
        
        // Show loading state
        output.textContent = 'Processing ValueSets...';
        output.className = 'output';
        
        const response = await fetch(`${API_BASE_URL}/api/v1/valuesets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bundle)
        });
        
        const outcome = await response.json();
        
        output.textContent = JSON.stringify(outcome, null, 2);
        output.className = outcome.issue[0].severity === 'error' ? 'output error' : 'output success';
        
        if (outcome.issue[0].severity === 'success') {
            alert('ValueSets processed successfully! You can now analyze resources in API 2.');
        }
        
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.className = 'output error';
    }
}

// Clear ValueSets
async function clearValueSets() {
    if (confirm('Are you sure you want to clear all ValueSets and rules? This cannot be undone.')) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/data`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            document.getElementById('valuesetOutput').textContent = result.message || 'All ValueSets and rules have been cleared.';
            document.getElementById('valuesetOutput').className = 'output success';
            alert('All data cleared successfully.');
            
        } catch (error) {
            alert(`Error clearing data: ${error.message}`);
        }
    }
}

// Fetch Resource Bundle from URL
async function fetchResourceFromUrl() {
    const url = document.getElementById('resourceUrl').value.trim();
    const output = document.getElementById('resourceOutput');
    
    if (!url) {
        output.textContent = 'Please provide a URL.';
        output.className = 'output error';
        return;
    }
    
    try {
        output.textContent = 'Fetching from URL...';
        output.className = 'output';
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        document.getElementById('resourceInput').value = JSON.stringify(data, null, 2);
        
        output.textContent = 'Successfully fetched from URL. Click "Analyze & Tag Resources" to continue.';
        output.className = 'output success';
        
    } catch (error) {
        output.textContent = `Error fetching from URL: ${error.message}`;
        output.className = 'output error';
    }
}

// API 2: Analyze Resources
async function analyzeResources() {
    const input = document.getElementById('resourceInput').value.trim();
    const output = document.getElementById('resourceOutput');
    
    if (!input) {
        output.textContent = 'Please provide a FHIR Bundle with clinical resources.';
        output.className = 'output error';
        return;
    }
    
    try {
        const bundle = JSON.parse(input);
        
        // Show loading state
        output.textContent = 'Analyzing resources...';
        output.className = 'output';
        
        const response = await fetch(`${API_BASE_URL}/api/v1/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bundle)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.issue ? error.issue[0].diagnostics : 'Analysis failed');
        }
        
        const batchBundle = await response.json();
        
        output.textContent = JSON.stringify(batchBundle, null, 2);
        output.className = 'output success';
        
        // Show summary
        const summary = batchBundle.extension[0].extension;
        const analyzed = summary.find(e => e.url === 'analyzed').valueInteger;
        const labeled = summary.find(e => e.url === 'labeled').valueInteger;
        const skipped = summary.find(e => e.url === 'skipped').valueInteger;
        
        alert(`Analysis complete!\nAnalyzed: ${analyzed}\nLabeled: ${labeled}\nSkipped: ${skipped}`);
        
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.className = 'output error';
    }
}

// Refresh Status Display
async function refreshStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/v1/status`);
        const status = await response.json();
        
        // ValueSet Status
        const vsStatus = document.getElementById('valuesetStatus');
        if (!status.valueSets || status.valueSets.length === 0) {
            vsStatus.innerHTML = '<p class="warning">No ValueSets loaded. Use API 1 to load ValueSets.</p>';
        } else {
            let html = `<p><strong>Total ValueSets:</strong> ${status.valueSets.length}</p>`;
            html += `<p><strong>Earliest Date:</strong> ${status.earliestDate || 'N/A'}</p>`;
            html += '<ul>';
            status.valueSets.forEach(vs => {
                html += `<li><strong>${vs.id}</strong> (${vs.date || 'No date'})</li>`;
            });
            html += '</ul>';
            vsStatus.innerHTML = html;
        }
        
        // Rules Status
        const rulesStatus = document.getElementById('rulesStatus');
        if (!status.rulesCount || status.rulesCount === 0) {
            rulesStatus.innerHTML = '<p class="warning">No rules loaded. Process ValueSets first.</p>';
        } else {
            let html = `<p><strong>Total Codes:</strong> ${status.rulesCount}</p>`;
            rulesStatus.innerHTML = html;
        }
        
        // Statistics
        const statsStatus = document.getElementById('statsStatus');
        if (status.stats) {
            let html = `<ul>`;
            html += `<li><strong>ValueSets Processed:</strong> ${status.stats.totalValueSetsProcessed || 0}</li>`;
            html += `<li><strong>Resources Analyzed:</strong> ${status.stats.totalResourcesAnalyzed || 0}</li>`;
            html += `<li><strong>Resources Labeled:</strong> ${status.stats.totalResourcesLabeled || 0}</li>`;
            html += `<li><strong>Resources Skipped:</strong> ${status.stats.totalResourcesSkipped || 0}</li>`;
            html += `</ul>`;
            statsStatus.innerHTML = html;
        }
        
    } catch (error) {
        console.error('Error refreshing status:', error);
        alert('Failed to refresh status. Is the server running?');
    }
}

// Export Data (note: export from backend DB)
async function exportData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/v1/status`);
        const data = await response.json();
        
        const exportData = {
            ...data,
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sls-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        alert(`Export failed: ${error.message}`);
    }
}

// Import Data (note: would need backend endpoint to restore)
function importData() {
    alert('Import functionality requires database restoration. Please contact your administrator.');
}

// Sample Data Loaders (same as before)
function loadSampleValueSet() {
    const sample = {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [
            {
                "resource": {
                    "resourceType": "ValueSet",
                    "id": "mental-health-conditions",
                    "url": "http://example.org/fhir/ValueSet/mental-health-conditions",
                    "version": "1.0.0",
                    "name": "MentalHealthConditions",
                    "title": "Mental Health Conditions",
                    "status": "active",
                    "date": "2024-01-01T00:00:00Z",
                    "topic": [
                        {
                            "coding": [
                                {
                                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                                    "code": "PSY",
                                    "display": "Psychiatry"
                                }
                            ]
                        }
                    ],
                    "expansion": {
                        "timestamp": "2024-01-01T00:00:00Z",
                        "contains": [
                            {
                                "system": "http://snomed.info/sct",
                                "code": "35489007",
                                "display": "Depressive disorder"
                            },
                            {
                                "system": "http://snomed.info/sct",
                                "code": "197480006",
                                "display": "Anxiety disorder"
                            },
                            {
                                "system": "http://snomed.info/sct",
                                "code": "58214004",
                                "display": "Schizophrenia"
                            }
                        ]
                    }
                }
            },
            {
                "resource": {
                    "resourceType": "ValueSet",
                    "id": "substance-abuse",
                    "url": "http://example.org/fhir/ValueSet/substance-abuse",
                    "version": "1.0.0",
                    "name": "SubstanceAbuse",
                    "title": "Substance Abuse Conditions",
                    "status": "active",
                    "date": "2024-01-01T00:00:00Z",
                    "topic": [
                        {
                            "coding": [
                                {
                                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                                    "code": "ETH",
                                    "display": "Substance Abuse"
                                }
                            ]
                        }
                    ],
                    "expansion": {
                        "timestamp": "2024-01-01T00:00:00Z",
                        "contains": [
                            {
                                "system": "http://snomed.info/sct",
                                "code": "191816009",
                                "display": "Alcohol abuse"
                            },
                            {
                                "system": "http://snomed.info/sct",
                                "code": "191820008",
                                "display": "Drug abuse"
                            }
                        ]
                    }
                }
            }
        ]
    };
    
    document.getElementById('valuesetInput').value = JSON.stringify(sample, null, 2);
}

function loadSampleResources() {
    const sample = {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [
            {
                "resource": {
                    "resourceType": "Condition",
                    "id": "condition-1",
                    "clinicalStatus": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                                "code": "active"
                            }
                        ]
                    },
                    "code": {
                        "coding": [
                            {
                                "system": "http://snomed.info/sct",
                                "code": "35489007",
                                "display": "Depressive disorder"
                            }
                        ]
                    },
                    "subject": {
                        "reference": "Patient/example"
                    }
                }
            },
            {
                "resource": {
                    "resourceType": "Condition",
                    "id": "condition-2",
                    "clinicalStatus": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                                "code": "active"
                            }
                        ]
                    },
                    "code": {
                        "coding": [
                            {
                                "system": "http://snomed.info/sct",
                                "code": "38341003",
                                "display": "Hypertension"
                            }
                        ]
                    },
                    "subject": {
                        "reference": "Patient/example"
                    }
                }
            },
            {
                "resource": {
                    "resourceType": "Observation",
                    "id": "obs-1",
                    "status": "final",
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "8867-4",
                                "display": "Heart rate"
                            }
                        ]
                    },
                    "subject": {
                        "reference": "Patient/example"
                    },
                    "valueQuantity": {
                        "value": 80,
                        "unit": "beats/minute"
                    }
                }
            }
        ]
    };
    
    document.getElementById('resourceInput').value = JSON.stringify(sample, null, 2);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    refreshStatus();
    
    // Check if backend is available
    fetch(`${API_BASE_URL}/health`)
        .then(response => response.json())
        .then(data => {
            console.log('✓ Backend service is healthy:', data);
        })
        .catch(error => {
            console.error('✗ Backend service is not available:', error);
            alert('Warning: Unable to connect to backend service. Please ensure the server is running.');
        });
});
