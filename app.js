/**
 * Application UI Logic
 * Handles user interactions and connects UI to the SLS service
 */

// Tab Navigation
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Refresh status if status tab is opened
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
        let errorMessage = `Error fetching from URL: ${error.message}`;
        
        // Check if it's a CORS error
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorMessage += '\n\nNote: This is likely a CORS (Cross-Origin Resource Sharing) issue. ' +
                'The URL you are trying to access does not allow requests from this browser origin.\n' +
                'Solutions:\n' +
                '1. Use the Docker deployment (no CORS restrictions)\n' +
                '2. Download the JSON file and paste it directly into the textarea\n' +
                '3. Use a CORS proxy service (e.g., https://corsproxy.io/?url=YOUR_URL)';
        }
        
        output.textContent = errorMessage;
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
        const outcome = await slsService.processValueSetBundle(bundle);
        
        output.textContent = JSON.stringify(outcome, null, 2);
        output.className = outcome.issue[0].severity === 'error' ? 'output error' : 'output success';
        
        // Show success message
        if (outcome.issue[0].severity === 'success') {
            const successMsg = '✓ ValueSets processed successfully! You can now analyze resources in API 2.';
            output.textContent = successMsg + '\n\n' + JSON.stringify(outcome, null, 2);
        }
        
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.className = 'output error';
    }
}

// Clear ValueSets
function clearValueSets() {
    if (confirm('Are you sure you want to clear all ValueSets and rules? This cannot be undone.')) {
        slsService.clearAllData();
        const output = document.getElementById('valuesetOutput');
        output.textContent = '✓ All data cleared successfully.\n\nAll ValueSets and rules have been cleared.';
        output.className = 'output success';
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
        let errorMessage = `Error fetching from URL: ${error.message}`;
        
        // Check if it's a CORS error
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorMessage += '\n\nNote: This is likely a CORS (Cross-Origin Resource Sharing) issue. ' +
                'The URL you are trying to access does not allow requests from this browser origin.\n' +
                'Solutions:\n' +
                '1. Use the Docker deployment (no CORS restrictions)\n' +
                '2. Download the JSON file and paste it directly into the textarea\n' +
                '3. Use a CORS proxy service (e.g., https://corsproxy.io/?url=YOUR_URL)';
        }
        
        output.textContent = errorMessage;
        output.className = 'output error';
    }
}

// API 2: Analyze Resources
function analyzeResources() {
    const input = document.getElementById('resourceInput').value.trim();
    const output = document.getElementById('resourceOutput');
    
    if (!input) {
        output.textContent = 'Please provide a FHIR Bundle with clinical resources.';
        output.className = 'output error';
        return;
    }
    
    try {
        const bundle = JSON.parse(input);
        const batchBundle = slsService.analyzeResourceBundle(bundle);
        
        // Show summary
        const summary = batchBundle.extension[0].extension;
        const analyzed = summary.find(e => e.url === 'analyzed').valueInteger;
        const labeled = summary.find(e => e.url === 'labeled').valueInteger;
        const skipped = summary.find(e => e.url === 'skipped').valueInteger;
        
        const summaryMsg = `✓ Analysis complete! Analyzed: ${analyzed} | Labeled: ${labeled} | Skipped: ${skipped}`;
        output.textContent = summaryMsg + '\n\n' + JSON.stringify(batchBundle, null, 2);
        output.className = 'output success';
        
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.className = 'output error';
    }
}

// Refresh Status Display
function refreshStatus() {
    const valueSets = slsService.getValueSets();
    const rules = slsService.getRules();
    const stats = slsService.getStats();
    const earliestDate = slsService.getEarliestDate();
    
    // ValueSet Status
    const vsStatus = document.getElementById('valuesetStatus');
    if (!valueSets || valueSets.length === 0) {
        vsStatus.innerHTML = '<p class="warning">No ValueSets loaded. Use API 1 to load ValueSets.</p>';
    } else {
        let html = `<p><strong>Total ValueSets:</strong> ${valueSets.length}</p>`;
        html += `<p><strong>Earliest Date:</strong> ${earliestDate || 'N/A'}</p>`;
        html += '<ul>';
        valueSets.forEach(vs => {
            const topicCoding = slsService.extractTopicCoding(vs);
            const topicDisplay = topicCoding
                ? (topicCoding.display || topicCoding.code)
                : 'No topic';
            html += `<li><strong>${vs.id}</strong> - ${topicDisplay} (${vs.date || 'No date'})</li>`;
        });
        html += '</ul>';
        vsStatus.innerHTML = html;
    }
    
    // Rules Status
    const rulesStatus = document.getElementById('rulesStatus');
    if (!rules || Object.keys(rules).length === 0) {
        rulesStatus.innerHTML = '<p class="warning">No rules loaded. Process ValueSets first.</p>';
    } else {
        const topicCounts = {};
        for (const key in rules) {
            const topic = rules[key].display || rules[key].code;
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
        
        let html = `<p><strong>Total Codes:</strong> ${Object.keys(rules).length}</p>`;
        html += '<p><strong>By Topic:</strong></p><ul>';
        for (const topic in topicCounts) {
            html += `<li>${topic}: ${topicCounts[topic]} codes</li>`;
        }
        html += '</ul>';
        rulesStatus.innerHTML = html;
    }
    
    // Statistics
    const statsStatus = document.getElementById('statsStatus');
    if (stats) {
        let html = `<ul>`;
        html += `<li><strong>ValueSets Processed:</strong> ${stats.totalValueSetsProcessed}</li>`;
        html += `<li><strong>Resources Analyzed:</strong> ${stats.totalResourcesAnalyzed}</li>`;
        html += `<li><strong>Resources Labeled:</strong> ${stats.totalResourcesLabeled}</li>`;
        html += `<li><strong>Resources Skipped:</strong> ${stats.totalResourcesSkipped}</li>`;
        html += `<li><strong>Last Processed:</strong> ${stats.lastProcessed || 'Never'}</li>`;
        html += `</ul>`;
        statsStatus.innerHTML = html;
    }
}

// Export Data
function exportData() {
    const data = slsService.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sls-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Import Data
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                slsService.importData(data);
                const statsStatus = document.getElementById('statsStatus');
                statsStatus.innerHTML = '<p class="success">✓ Data imported successfully!</p>' + statsStatus.innerHTML;
                refreshStatus();
            } catch (error) {
                const statsStatus = document.getElementById('statsStatus');
                statsStatus.innerHTML = `<p class="error">✗ Import failed: ${error.message}</p>` + statsStatus.innerHTML;
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

// Sample Data Loaders
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
});
