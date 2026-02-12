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
        
        const response = await fetch(`${API_BASE_URL}/$sls-load-valuesets`, {
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
            const successMsg = '✓ ValueSets processed successfully! You can now analyze resources in API 2.';
            output.textContent = successMsg + '\n\n' + JSON.stringify(outcome, null, 2);
        }
        
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.className = 'output error';
    }
}

// Clear ValueSets and rules from server-side persistence
async function clearValueSets() {
    const output = document.getElementById('valuesetOutput');

    if (!confirm('Are you sure you want to clear all ValueSets and rules? This cannot be undone.')) {
        return;
    }

    try {
        output.textContent = 'Clearing all server-side data...';
        output.className = 'output';

        const response = await fetch(`${API_BASE_URL}/admin/clear-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const outcome = await response.json();
        if (!response.ok || outcome.issue?.[0]?.severity === 'error') {
            throw new Error(outcome.issue?.[0]?.diagnostics || `Clear failed with status ${response.status}`);
        }

        output.textContent = '✓ All data cleared successfully.\n\nAll ValueSets and rules have been cleared from the server database.';
        output.className = 'output success';
    } catch (error) {
        output.textContent = `Error clearing data: ${error.message}`;
        output.className = 'output error';
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

// API 2: Analyze Resources - Full Bundle (includes all resources)
async function analyzeResourcesFull() {
    const input = document.getElementById('resourceInput').value.trim();
    const output = document.getElementById('resourceOutput');
    const outputTitle = document.getElementById('resourceOutputTitle');
    
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
        outputTitle.textContent = 'Bundle Result:';
        
        const response = await fetch(`${API_BASE_URL}/$sls-tag?mode=full`, {
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
        
        const resultBundle = await response.json();
        
        // Show summary
        const summary = resultBundle.extension[0].extension;
        const analyzed = summary.find(e => e.url === 'analyzed').valueInteger;
        const labeled = summary.find(e => e.url === 'labeled').valueInteger;
        const skipped = summary.find(e => e.url === 'skipped').valueInteger;
        
        // Store bundle for clipboard
        const bundleJson = JSON.stringify(resultBundle, null, 2);
        output.dataset.bundleJson = bundleJson;
        
        const summaryMsg = `✓ Analysis complete! Analyzed: ${analyzed} | Labeled: ${labeled} | Skipped: ${skipped}`;
        output.textContent = summaryMsg + '\n\n' + bundleJson;
        output.className = 'output success';
        outputTitle.textContent = 'Full Bundle (with security labels):';
        
        // Show the copy button
        document.getElementById('copyAnalysisBtn').style.display = 'inline-block';
        
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.className = 'output error';
        outputTitle.textContent = 'Bundle Result:';
        delete output.dataset.bundleJson;
        // Hide the copy button on error
        document.getElementById('copyAnalysisBtn').style.display = 'none';
    }
}

// API 2: Analyze Resources - Batch Bundle (only updated resources)
async function analyzeResources() {
    const input = document.getElementById('resourceInput').value.trim();
    const output = document.getElementById('resourceOutput');
    const outputTitle = document.getElementById('resourceOutputTitle');
    
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
        outputTitle.textContent = 'Bundle Result:';
        
        const response = await fetch(`${API_BASE_URL}/$sls-tag?mode=batch`, {
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
        
        // Show summary
        const summary = batchBundle.extension[0].extension;
        const analyzed = summary.find(e => e.url === 'analyzed').valueInteger;
        const labeled = summary.find(e => e.url === 'labeled').valueInteger;
        const skipped = summary.find(e => e.url === 'skipped').valueInteger;
        
        // Store bundle for clipboard
        const bundleJson = JSON.stringify(batchBundle, null, 2);
        output.dataset.bundleJson = bundleJson;
        
        const summaryMsg = `✓ Analysis complete! Analyzed: ${analyzed} | Labeled: ${labeled} | Skipped: ${skipped}`;
        output.textContent = summaryMsg + '\n\n' + bundleJson;
        output.className = 'output success';
        outputTitle.textContent = 'Batch Bundle (with update actions):';
        
        // Show the copy button
        document.getElementById('copyAnalysisBtn').style.display = 'inline-block';
        
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
        output.className = 'output error';
        outputTitle.textContent = 'Bundle Result:';
        delete output.dataset.bundleJson;
        // Hide the copy button on error
        document.getElementById('copyAnalysisBtn').style.display = 'none';
    }
}

// Copy Analysis Output to Clipboard
async function copyAnalysisOutput() {
    const output = document.getElementById('resourceOutput');
    const button = document.getElementById('copyAnalysisBtn');
    
    // Get the stored bundle JSON (without summary text)
    const bundleJson = output.dataset.bundleJson;
    
    if (!bundleJson) {
        button.textContent = '✗ No output';
        setTimeout(() => { button.textContent = '📋 Copy to Clipboard'; }, 2000);
        return;
    }
    
    try {
        await navigator.clipboard.writeText(bundleJson);
        
        // Visual feedback
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.style.backgroundColor = '#27ae60';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
        }, 2000);
        
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = bundleJson;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            button.textContent = '✓ Copied!';
            button.style.backgroundColor = '#27ae60';
            
            setTimeout(() => {
                button.textContent = '📋 Copy to Clipboard';
                button.style.backgroundColor = '';
            }, 2000);
        } catch (err) {
            button.textContent = '✗ Copy failed';
            setTimeout(() => { button.textContent = '📋 Copy to Clipboard'; }, 2000);
        }
        
        document.body.removeChild(textArea);
    }
}

// Refresh Status Display from backend /status endpoint
async function refreshStatus() {
    const valueSetStatus = document.getElementById('valuesetStatus');
    const rulesStatus = document.getElementById('rulesStatus');
    const statsStatus = document.getElementById('statsStatus');

    const loadingMsg = '<p class="info">Loading status...</p>';
    valueSetStatus.innerHTML = loadingMsg;
    rulesStatus.innerHTML = loadingMsg;
    statsStatus.innerHTML = loadingMsg;

    try {
        const response = await fetch(`${API_BASE_URL}/status`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const status = await response.json();
        const valueSets = Array.isArray(status.valueSets) ? status.valueSets : [];
        const rulesByTopic = Array.isArray(status.rulesByTopic) ? status.rulesByTopic : [];
        const stats = status.stats || {};

        if (valueSets.length === 0) {
            valueSetStatus.innerHTML = '<p class="warning">No ValueSets loaded. Use API 1 to load ValueSets.</p>';
        } else {
            let html = `<p><strong>Total ValueSets:</strong> ${valueSets.length}</p>`;
            html += `<p><strong>Earliest Date:</strong> ${status.earliestDate || 'N/A'}</p>`;
            html += '<ul>';
            for (const vs of valueSets) {
                html += `<li><strong>${vs.id}</strong> (${vs.date || 'No date'})</li>`;
            }
            html += '</ul>';
            valueSetStatus.innerHTML = html;
        }

        if ((status.rulesCount || 0) === 0) {
            rulesStatus.innerHTML = '<p class="warning">No rules loaded. Process ValueSets first.</p>';
        } else {
            let html = `<p><strong>Total Rules:</strong> ${status.rulesCount}</p>`;
            if (rulesByTopic.length > 0) {
                html += '<p><strong>By Topic:</strong></p><ul>';
                for (const topic of rulesByTopic) {
                    html += `<li>${topic.display || topic.code}: ${topic.codeCount} codes</li>`;
                }
                html += '</ul>';
            }
            rulesStatus.innerHTML = html;
        }

        let statsHtml = '<ul>';
        statsHtml += `<li><strong>ValueSets Processed:</strong> ${stats.totalValueSetsProcessed || 0}</li>`;
        statsHtml += `<li><strong>Resources Analyzed:</strong> ${stats.totalResourcesAnalyzed || 0}</li>`;
        statsHtml += `<li><strong>Resources Labeled:</strong> ${stats.totalResourcesLabeled || 0}</li>`;
        statsHtml += `<li><strong>Resources Skipped:</strong> ${stats.totalResourcesSkipped || 0}</li>`;
        statsHtml += '</ul>';
        statsStatus.innerHTML = statsHtml;
    } catch (error) {
        const errorMsg = `<p class="error">Unable to load status: ${error.message}</p>`;
        valueSetStatus.innerHTML = errorMsg;
        rulesStatus.innerHTML = errorMsg;
        statsStatus.innerHTML = errorMsg;
    }
}

// Export Data - Not implemented in FHIR operations
async function exportData() {
    alert('Export functionality not available. This reference implementation focuses on FHIR operations only.');
    return;
    try {
        const response = null; // Disabled
        const data = {};
        
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
        
        const statsStatus = document.getElementById('statsStatus');
        statsStatus.innerHTML = '<p class="success">✓ Data exported successfully!</p>' + statsStatus.innerHTML;
        
    } catch (error) {
        const statsStatus = document.getElementById('statsStatus');
        statsStatus.innerHTML = `<p class="error">✗ Export failed: ${error.message}</p>` + statsStatus.innerHTML;
    }
}

// Import Data (note: would need backend endpoint to restore)
function importData() {
    const statsStatus = document.getElementById('statsStatus');
    statsStatus.innerHTML = '<p class="warning">⚠ Import functionality requires database restoration. Please contact your administrator.</p>' + statsStatus.innerHTML;
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
                            },
                            {
                                "system": "http://snomed.info/sct",
                                "code": "66214007",
                                "display": "Substance abuse (disorder)"
                            }
                        ]
                    }
                }
            },
            {
                "resource": {
                    "resourceType": "ValueSet",
                    "id": "behavioral-health-multi-topic",
                    "url": "http://example.org/fhir/ValueSet/behavioral-health-multi-topic",
                    "version": "1.0.0",
                    "name": "BehavioralHealthMultiTopic",
                    "title": "Behavioral Health - Multiple Topics",
                    "status": "active",
                    "date": "2024-01-01T00:00:00Z",
                    "useContext": [
                        {
                            "code": {
                                "system": "http://terminology.hl7.org/CodeSystem/usage-context-type",
                                "code": "focus"
                            },
                            "valueCodeableConcept": {
                                "coding": [
                                    {
                                        "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                                        "code": "PSYTHPN",
                                        "display": "Psychotherapy Note"
                                    }
                                ]
                            }
                        },
                        {
                            "code": {
                                "system": "http://terminology.hl7.org/CodeSystem/usage-context-type",
                                "code": "focus"
                            },
                            "valueCodeableConcept": {
                                "coding": [
                                    {
                                        "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                                        "code": "SUD",
                                        "display": "Substance Use Disorder"
                                    }
                                ]
                            }
                        },
                        {
                            "code": {
                                "system": "http://terminology.hl7.org/CodeSystem/usage-context-type",
                                "code": "focus"
                            },
                            "valueCodeableConcept": {
                                "coding": [
                                    {
                                        "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                                        "code": "BH",
                                        "display": "Behavioral Health"
                                    }
                                ]
                            }
                        }
                    ],
                    "expansion": {
                        "timestamp": "2024-01-01T00:00:00Z",
                        "contains": [
                            {
                                "system": "http://snomed.info/sct",
                                "code": "66214007",
                                "display": "Substance abuse (disorder)"
                            },
                            {
                                "system": "http://snomed.info/sct",
                                "code": "74732009",
                                "display": "Mental disorder"
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
                        ],
                        "text": "Matches only mental-health-conditions ValueSet (PSY)"
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
                                "code": "66214007",
                                "display": "Substance abuse (disorder)"
                            }
                        ],
                        "text": "Matches TWO ValueSets: substance-abuse (ETH) AND behavioral-health-multi-topic (PSYTHPN, SUD, BH)"
                    },
                    "subject": {
                        "reference": "Patient/example"
                    }
                }
            },
            {
                "resource": {
                    "resourceType": "Condition",
                    "id": "condition-3",
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
                                "code": "74732009",
                                "display": "Mental disorder"
                            }
                        ],
                        "text": "Matches behavioral-health-multi-topic with MULTIPLE topics (PSYTHPN, SUD, BH)"
                    },
                    "subject": {
                        "reference": "Patient/example"
                    }
                }
            },
            {
                "resource": {
                    "resourceType": "Condition",
                    "id": "condition-4",
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
                        ],
                        "text": "Does NOT match any ValueSet - not sensitive"
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
            },
            {
                "resource": {
                    "resourceType": "MedicationRequest",
                    "id": "med-1",
                    "status": "active",
                    "intent": "order",
                    "medicationCodeableConcept": {
                        "coding": [
                            {
                                "system": "http://snomed.info/sct",
                                "code": "191816009",
                                "display": "Alcohol abuse"
                            }
                        ],
                        "text": "Matches substance-abuse ValueSet (ETH)"
                    },
                    "subject": {
                        "reference": "Patient/example"
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
            console.warn('Warning: Unable to connect to backend service. Please ensure the server is running.');
        });
});
