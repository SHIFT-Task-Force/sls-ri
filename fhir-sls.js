/**
 * FHIR Security Labeling Service (SLS) - Core Engine
 * Reference Implementation for client-side processing
 * 
 * This module handles:
 * - ValueSet storage and management
 * - Code analysis against sensitive topic rules
 * - Security label application
 * - FHIR Bundle generation
 */

class FHIRSecurityLabelingService {
    constructor() {
        this.DB_KEY_VALUESETS = 'sls_valuesets';
        this.DB_KEY_RULES = 'sls_rules';
        this.DB_KEY_LATEST_DATE = 'sls_latest_date';
        this.DB_KEY_EARLIEST_DATE = 'sls_earliest_date';
        this.DB_KEY_STATS = 'sls_stats';
        
        // Supported US Core clinical resources that may contain sensitive data
        this.SUPPORTED_RESOURCES = [
            'AllergyIntolerance', 'Condition', 'Procedure', 'Immunization',
            'MedicationRequest', 'Medication', 'CarePlan', 'CareTeam', 'Goal',
            'Observation', 'DiagnosticReport', 'DocumentReference', 
            'QuestionnaireResponse', 'Specimen', 'Encounter', 'ServiceRequest'
        ];
        
        this.LAST_SOURCE_SYNC_URL = 'http://hl7.org/fhir/StructureDefinition/lastSourceSync';
        
        this.initializeStats();
    }

    /**
     * Initialize or load statistics from storage
     */
    initializeStats() {
        const stats = this.getStats();
        if (!stats) {
            this.saveStats({
                totalValueSetsProcessed: 0,
                totalResourcesAnalyzed: 0,
                totalResourcesLabeled: 0,
                totalResourcesSkipped: 0,
                lastProcessed: null
            });
        }
    }

    /**
     * API 1: Process ValueSet Bundle or single ValueSet
     * Loads ValueSets and builds internal rule set for sensitive topic detection
     * 
     * @param {Object} input - FHIR Bundle or single ValueSet resource
     * @returns {Promise<Object>} - FHIR OperationOutcome
     */
    async processValueSetBundle(input) {
        try {
            let valueSets = [];
            let errors = [];
            let latestDate = null;

            // Handle single ValueSet
            if (input && input.resourceType === 'ValueSet') {
                // Expand if needed
                if (!input.expansion || !input.expansion.contains) {
                    const expanded = await this.expandValueSet(input);
                    if (expanded) {
                        input = expanded;
                    } else {
                        return this.createOperationOutcome('error', `Failed to expand ValueSet ${input.id || 'unknown'}`);
                    }
                }

                const validation = this.validateValueSet(input);
                if (validation.errors.length > 0) {
                    return this.createOperationOutcome('error', 'Invalid ValueSet', validation.errors);
                }
                
                valueSets.push(input);
                // Prefer expansion.timestamp over date
                const vsDate = this.getValueSetDate(input);
                if (vsDate) {
                    latestDate = vsDate;
                }
            }
            // Handle Bundle
            else if (input && input.resourceType === 'Bundle') {
                if (!input.entry || input.entry.length === 0) {
                    return this.createOperationOutcome('warning', 'Bundle contains no entries');
                }

                // Process each entry in the bundle
                for (const entry of input.entry) {
                    let resource = entry.resource;
                    
                    // Validate resource type
                    if (!resource || resource.resourceType !== 'ValueSet') {
                        errors.push(`Skipping non-ValueSet resource: ${resource?.resourceType || 'unknown'}`);
                        continue;
                    }

                    // Expand if needed
                    if (!resource.expansion || !resource.expansion.contains) {
                        const expanded = await this.expandValueSet(resource);
                        if (expanded) {
                            resource = expanded;
                        } else {
                            errors.push(`Failed to expand ValueSet ${resource.id || 'unknown'}`);
                            continue;
                        }
                    }

                    const validation = this.validateValueSet(resource);
                    if (validation.errors.length > 0) {
                        errors.push(...validation.errors);
                        continue;
                    }

                    // Prefer expansion.timestamp over date
                    const vsDate = this.getValueSetDate(resource);
                    if (vsDate) {
                        if (!latestDate || vsDate > latestDate) {
                            latestDate = vsDate;
                        }
                    }

                    valueSets.push(resource);
                }
            }
            // Invalid input
            else {
                return this.createOperationOutcome('error', 'Invalid input: resourceType must be "Bundle" or "ValueSet"');
            }

            if (valueSets.length === 0) {
                return this.createOperationOutcome('error', 'No valid ValueSets found', errors);
            }

            // Store ValueSets and build rules
            this.storeValueSets(valueSets, latestDate);
            this.buildRules(valueSets);

            // Update statistics
            const stats = this.getStats();
            stats.totalValueSetsProcessed += valueSets.length;
            stats.lastProcessed = new Date().toISOString();
            this.saveStats(stats);

            return this.createOperationOutcome(
                'success',
                `Successfully processed ${valueSets.length} ValueSet(s)`,
                errors.length > 0 ? errors : null
            );

        } catch (error) {
            return this.createOperationOutcome('error', `Processing failed: ${error.message}`);
        }
    }

    /**
     * Expand a ValueSet using tx.fhir.org if no expansion present
     */
    async expandValueSet(valueSet) {
        try {
            console.log(`Expanding ValueSet ${valueSet.id || 'unknown'} using tx.fhir.org...`);
            
            const url = 'https://tx.fhir.org/r4/ValueSet/$expand';
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/fhir+json',
                    'Accept': 'application/fhir+json'
                },
                body: JSON.stringify({
                    resourceType: 'Parameters',
                    parameter: [
                        {
                            name: 'valueSet',
                            resource: valueSet
                        }
                    ]
                })
            });

            if (!response.ok) {
                console.error(`Expansion failed with status ${response.status}`);
                return null;
            }

            const result = await response.json();
            
            // Extract expanded ValueSet from Parameters response
            let expandedValueSet = null;
            if (result.resourceType === 'ValueSet' && result.expansion) {
                expandedValueSet = result;
            } else if (result.resourceType === 'Parameters' && result.parameter) {
                const valueSetParam = result.parameter.find(p => p.name === 'return' && p.resource);
                if (valueSetParam && valueSetParam.resource.expansion) {
                    expandedValueSet = valueSetParam.resource;
                }
            }

            if (!expandedValueSet) {
                console.error('Unexpected expansion response format');
                return null;
            }

            // Preserve essential fields from original ValueSet
            // tx.fhir.org may not return all original fields
            if (!expandedValueSet.id && valueSet.id) {
                expandedValueSet.id = valueSet.id;
            }
            if (!expandedValueSet.date && valueSet.date) {
                expandedValueSet.date = valueSet.date;
            }
            if (!expandedValueSet.topic && valueSet.topic) {
                expandedValueSet.topic = valueSet.topic;
            }
            if (!expandedValueSet.useContext && valueSet.useContext) {
                expandedValueSet.useContext = valueSet.useContext;
            }

            return expandedValueSet;

        } catch (error) {
            console.error(`Error expanding ValueSet: ${error.message}`);
            return null;
        }
    }

    /**
     * Get the effective date of a ValueSet, preferring expansion.timestamp over date
     */
    getValueSetDate(valueSet) {
        // Prefer expansion.timestamp if available
        if (valueSet.expansion && valueSet.expansion.timestamp) {
            return new Date(valueSet.expansion.timestamp);
        }
        // Fall back to date
        if (valueSet.date) {
            return new Date(valueSet.date);
        }
        return null;
    }

    /**
     * Validate a ValueSet resource
     */
    validateValueSet(resource) {
        const errors = [];

        if (!resource.id) {
            errors.push('ValueSet missing required field: id');
        }

        // Check for topic in either topic element or useContext with focus
        const topicCoding = this.extractTopicCoding(resource);
        if (!topicCoding) {
            errors.push(`ValueSet ${resource.id || 'unknown'} missing topic: must have either topic[0].coding[0] or useContext with code=focus`);
        }

        if (!resource.expansion || !resource.expansion.contains) {
            errors.push(`ValueSet ${resource.id || 'unknown'} missing expansion.contains`);
        }

        return { errors };
    }

    /**
     * Extract topic coding from either topic element or useContext
     */
    extractTopicCoding(resource) {
        // Try topic element first
        if (resource.topic && resource.topic.length > 0) {
            const topicCoding = resource.topic[0].coding ? resource.topic[0].coding[0] : null;
            if (topicCoding && topicCoding.code) {
                return topicCoding;
            }
        }

        // Try useContext with focus
        if (resource.useContext && resource.useContext.length > 0) {
            const focusContext = resource.useContext.find(
                ctx => ctx.code && ctx.code.code === 'focus'
            );
            if (focusContext && focusContext.valueCodeableConcept && focusContext.valueCodeableConcept.coding) {
                const coding = focusContext.valueCodeableConcept.coding[0];
                if (coding && coding.code) {
                    return coding;
                }
            }
        }

        return null;
    }

    /**
     * Store ValueSets in browser storage
     */
    storeValueSets(valueSets, latestDate) {
        const existing = this.getValueSets() || [];
        
        // Merge with existing (replace if same ID)
        const merged = [...existing];
        for (const vs of valueSets) {
            const index = merged.findIndex(e => e.id === vs.id);
            if (index >= 0) {
                merged[index] = vs;
            } else {
                merged.push(vs);
            }
        }

        localStorage.setItem(this.DB_KEY_VALUESETS, JSON.stringify(merged));
        
        // Update latest date if needed
        const currentLatest = this.getLatestDate();
        if (latestDate && (!currentLatest || latestDate > new Date(currentLatest))) {
            localStorage.setItem(this.DB_KEY_LATEST_DATE, latestDate.toISOString());
        }
    }

    /**
     * Build internal rule set from ValueSets
     * Maps codes to their sensitive topics
     */
    buildRules(valueSets) {
        const rules = this.getRules() || {};

        for (const vs of valueSets) {
            // Get the sensitive topic from the ValueSet
            const topicCoding = this.extractTopicCoding(vs);
            if (!topicCoding) continue; // Should not happen if validation passed

            const topicCode = topicCoding.code;
            const topicSystem = topicCoding.system;
            const topicDisplay = topicCoding.display || topicCode;

            // Extract all codes from expansion
            if (vs.expansion && vs.expansion.contains) {
                this.extractCodesFromExpansion(vs.expansion.contains, rules, {
                    code: topicCode,
                    system: topicSystem,
                    display: topicDisplay
                });
            }
        }

        localStorage.setItem(this.DB_KEY_RULES, JSON.stringify(rules));
    }

    /**
     * Recursively extract codes from ValueSet expansion
     */
    extractCodesFromExpansion(contains, rules, topic) {
        for (const item of contains) {
            if (item.code && item.system) {
                const key = `${item.system}|${item.code}`;
                rules[key] = topic;
            }

            // Recursively process nested contains
            if (item.contains) {
                this.extractCodesFromExpansion(item.contains, rules, topic);
            }
        }
    }

    /**
     * API 2: Analyze and Tag Resources
     * Analyzes FHIR resources for sensitive content and applies security labels
     * 
     * @param {Object} bundle - FHIR Bundle containing resources to analyze
     * @returns {Object} - FHIR Batch Bundle with update actions
     */
    analyzeResourceBundle(bundle) {
        try {
            // Validate bundle
            if (!bundle || bundle.resourceType !== 'Bundle') {
                throw new Error('Invalid Bundle: resourceType must be "Bundle"');
            }

            if (!bundle.entry || bundle.entry.length === 0) {
                throw new Error('Bundle contains no entries');
            }

            // Check if ValueSets have been loaded
            const rules = this.getRules();
            if (!rules || Object.keys(rules).length === 0) {
                throw new Error('No sensitive topic rules loaded. Please process ValueSets first (API 1).');
            }

            const latestDate = this.getLatestDate();
            const batchEntries = [];
            const stats = this.getStats();
            let analyzed = 0;
            let labeled = 0;
            let skipped = 0;

            // Process each resource in the bundle
            for (const entry of bundle.entry) {
                const resource = entry.resource;
                
                // Skip non-supported resources
                if (!resource || !this.SUPPORTED_RESOURCES.includes(resource.resourceType)) {
                    continue;
                }

                // Check if resource needs re-analysis based on lastSourceSync
                if (this.shouldSkipResource(resource, latestDate)) {
                    skipped++;
                    continue;
                }

                analyzed++;

                // Analyze resource for sensitive codes
                const matchedTopics = this.analyzeResource(resource, rules);

                // Apply security labels if sensitive topics detected
                if (matchedTopics.length > 0) {
                    this.applySecurityLabels(resource, matchedTopics);
                    labeled++;
                }

                // Add lastSourceSync extension
                this.addLastSourceSync(resource);

                // Create batch entry for update
                batchEntries.push(this.createBatchEntry(resource));
            }

            // Update statistics
            stats.totalResourcesAnalyzed += analyzed;
            stats.totalResourcesLabeled += labeled;
            stats.totalResourcesSkipped += skipped;
            stats.lastProcessed = new Date().toISOString();
            this.saveStats(stats);

            // Create and return batch bundle
            return this.createBatchBundle(batchEntries, {
                analyzed,
                labeled,
                skipped
            });

        } catch (error) {
            throw new Error(`Analysis failed: ${error.message}`);
        }
    }

    /**
     * Check if resource should be skipped based on lastSourceSync
     */
    shouldSkipResource(resource, latestDate) {
        if (!latestDate || !resource.meta || !resource.meta.extension) {
            return false;
        }

        const syncExt = resource.meta.extension.find(
            ext => ext.url === this.LAST_SOURCE_SYNC_URL
        );

        if (!syncExt || !syncExt.valueDateTime) {
            return false;
        }

        const syncDate = new Date(syncExt.valueDateTime);
        return syncDate >= new Date(latestDate);
    }

    /**
     * Analyze resource for sensitive codes
     * Returns array of matched sensitive topics
     */
    analyzeResource(resource, rules) {
        const matchedTopics = new Set();
        
        // Recursively search for code/coding/codeableConcept elements
        this.findAndCheckCodes(resource, rules, matchedTopics);
        
        return Array.from(matchedTopics);
    }

    /**
     * Recursively traverse resource to find and check codes
     */
    findAndCheckCodes(obj, rules, matchedTopics) {
        if (!obj || typeof obj !== 'object') {
            return;
        }

        // Check if this is a Coding
        if (obj.system && obj.code) {
            const key = `${obj.system}|${obj.code}`;
            if (rules[key]) {
                matchedTopics.add(JSON.stringify(rules[key]));
            }
        }

        // Check if this is a CodeableConcept
        if (obj.coding && Array.isArray(obj.coding)) {
            for (const coding of obj.coding) {
                this.findAndCheckCodes(coding, rules, matchedTopics);
            }
        }

        // Recursively check all properties
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (Array.isArray(obj[key])) {
                    for (const item of obj[key]) {
                        this.findAndCheckCodes(item, rules, matchedTopics);
                    }
                } else if (typeof obj[key] === 'object') {
                    this.findAndCheckCodes(obj[key], rules, matchedTopics);
                }
            }
        }
    }

    /**
     * Apply security labels to resource
     */
    applySecurityLabels(resource, matchedTopics) {
        // Initialize meta if not present
        if (!resource.meta) {
            resource.meta = {};
        }

        // Initialize security array if not present
        if (!resource.meta.security) {
            resource.meta.security = [];
        }

        // Add confidentiality code 'R' (restricted)
        const hasRestricted = resource.meta.security.some(
            sec => sec.system === 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality' && sec.code === 'R'
        );

        if (!hasRestricted) {
            resource.meta.security.push({
                system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
                code: 'R',
                display: 'restricted'
            });
        }

        // Add sensitive topic labels
        for (const topicJson of matchedTopics) {
            const topic = JSON.parse(topicJson);
            
            const hasTopic = resource.meta.security.some(
                sec => sec.system === topic.system && sec.code === topic.code
            );

            if (!hasTopic) {
                resource.meta.security.push({
                    system: topic.system,
                    code: topic.code,
                    display: topic.display
                });
            }
        }
    }

    /**
     * Add lastSourceSync extension to resource meta
     */
    addLastSourceSync(resource) {
        if (!resource.meta) {
            resource.meta = {};
        }

        if (!resource.meta.extension) {
            resource.meta.extension = [];
        }

        // Remove existing lastSourceSync if present
        resource.meta.extension = resource.meta.extension.filter(
            ext => ext.url !== this.LAST_SOURCE_SYNC_URL
        );

        // Add new lastSourceSync
        resource.meta.extension.push({
            url: this.LAST_SOURCE_SYNC_URL,
            valueDateTime: new Date().toISOString()
        });
    }

    /**
     * Create batch entry for resource update
     */
    createBatchEntry(resource) {
        return {
            request: {
                method: 'PUT',
                url: `${resource.resourceType}/${resource.id}`
            },
            resource: resource
        };
    }

    /**
     * Create FHIR Batch Bundle
     */
    createBatchBundle(entries, stats) {
        // Collect distinct security labels from all resources in the bundle
        const securityLabels = this.collectDistinctSecurityLabels(entries);
        
        const bundle = {
            resourceType: 'Bundle',
            type: 'batch',
            meta: {
                lastUpdated: new Date().toISOString(),
                tag: [{
                    system: 'http://example.org/fhir/CodeSystem/sls-processing',
                    code: 'sls-tagged',
                    display: 'SLS Security Labeled'
                }]
            },
            entry: entries,
            // Add processing summary as extension (not standard FHIR, but helpful for debugging)
            extension: [{
                url: 'http://example.org/fhir/StructureDefinition/processing-summary',
                extension: [
                    { url: 'analyzed', valueInteger: stats.analyzed },
                    { url: 'labeled', valueInteger: stats.labeled },
                    { url: 'skipped', valueInteger: stats.skipped }
                ]
            }]
        };
        
        // Add distinct security labels to Bundle.meta.security if any exist
        if (securityLabels.length > 0) {
            bundle.meta.security = securityLabels;
        }
        
        return bundle;
    }

    /**
     * Collect distinct security labels from all resources in batch entries
     */
    collectDistinctSecurityLabels(entries) {
        const securityMap = new Map();
        
        for (const entry of entries) {
            const resource = entry.resource;
            
            // Check if resource has security labels
            if (resource.meta && resource.meta.security && Array.isArray(resource.meta.security)) {
                for (const security of resource.meta.security) {
                    // Create a unique key for deduplication
                    const key = `${security.system}|${security.code}`;
                    
                    // Only add if not already present
                    if (!securityMap.has(key)) {
                        securityMap.set(key, {
                            system: security.system,
                            code: security.code,
                            display: security.display
                        });
                    }
                }
            }
        }
        
        // Convert map values to array
        return Array.from(securityMap.values());
    }

    /**
     * Create FHIR OperationOutcome
     */
    createOperationOutcome(severity, message, details = null) {
        const outcome = {
            resourceType: 'OperationOutcome',
            issue: [{
                severity: severity,
                code: severity === 'success' ? 'informational' : 'processing',
                diagnostics: message
            }]
        };

        if (details && details.length > 0) {
            for (const detail of details) {
                outcome.issue.push({
                    severity: 'warning',
                    code: 'processing',
                    diagnostics: detail
                });
            }
        }

        return outcome;
    }

    /**
     * Storage helper methods
     */
    getValueSets() {
        const data = localStorage.getItem(this.DB_KEY_VALUESETS);
        return data ? JSON.parse(data) : null;
    }

    getRules() {
        const data = localStorage.getItem(this.DB_KEY_RULES);
        return data ? JSON.parse(data) : null;
    }

    getLatestDate() {
        return localStorage.getItem(this.DB_KEY_LATEST_DATE)
            || localStorage.getItem(this.DB_KEY_EARLIEST_DATE);
    }

    getEarliestDate() {
        return this.getLatestDate();
    }

    getStats() {
        const data = localStorage.getItem(this.DB_KEY_STATS);
        return data ? JSON.parse(data) : null;
    }

    saveStats(stats) {
        localStorage.setItem(this.DB_KEY_STATS, JSON.stringify(stats));
    }

    clearAllData() {
        localStorage.removeItem(this.DB_KEY_VALUESETS);
        localStorage.removeItem(this.DB_KEY_RULES);
        localStorage.removeItem(this.DB_KEY_LATEST_DATE);
        localStorage.removeItem(this.DB_KEY_EARLIEST_DATE);
        this.initializeStats();
    }

    /**
     * Export all data for backup
     */
    exportData() {
        return {
            valueSets: this.getValueSets(),
            rules: this.getRules(),
            latestDate: this.getLatestDate(),
            stats: this.getStats(),
            exportDate: new Date().toISOString()
        };
    }

    /**
     * Import data from backup
     */
    importData(data) {
        if (data.valueSets) {
            localStorage.setItem(this.DB_KEY_VALUESETS, JSON.stringify(data.valueSets));
        }
        if (data.rules) {
            localStorage.setItem(this.DB_KEY_RULES, JSON.stringify(data.rules));
        }
        const importedLatestDate = data.latestDate || data.earliestDate;
        if (importedLatestDate) {
            localStorage.setItem(this.DB_KEY_LATEST_DATE, importedLatestDate);
        }
        if (data.stats) {
            localStorage.setItem(this.DB_KEY_STATS, JSON.stringify(data.stats));
        }
    }
}

// Initialize global service instance
const slsService = new FHIRSecurityLabelingService();
