/**
 * FHIR Security Labeling Service - Backend Core Logic
 * Adapted from client-side implementation for server use
 */

const Database = require('better-sqlite3');
const path = require('path');

class FHIRSecurityLabelingService {
    constructor(dbPath = ':memory:') {
        // Initialize database
        this.db = new Database(dbPath);
        this.initializeDatabase();
        
        // Supported US Core clinical resources
        this.SUPPORTED_RESOURCES = [
            'AllergyIntolerance', 'Condition', 'Procedure', 'Immunization',
            'MedicationRequest', 'Medication', 'CarePlan', 'CareTeam', 'Goal',
            'Observation', 'DiagnosticReport', 'DocumentReference',
            'QuestionnaireResponse', 'Specimen', 'Encounter', 'ServiceRequest'
        ];
        
        this.LAST_SOURCE_SYNC_URL = 'http://hl7.org/fhir/StructureDefinition/lastSourceSync';
    }

    /**
     * Initialize database schema
     */
    initializeDatabase() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS valuesets (
                id TEXT PRIMARY KEY,
                resource TEXT NOT NULL,
                date TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS rules (
                code_key TEXT PRIMARY KEY,
                topic_code TEXT NOT NULL,
                topic_system TEXT NOT NULL,
                topic_display TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS stats (
                key TEXT PRIMARY KEY,
                value INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Initialize stats
        const statsInit = this.db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)');
        statsInit.run('totalValueSetsProcessed', 0);
        statsInit.run('totalResourcesAnalyzed', 0);
        statsInit.run('totalResourcesLabeled', 0);
        statsInit.run('totalResourcesSkipped', 0);
    }

    /**
     * API 1: Process ValueSet Bundle or single ValueSet
     */
    async processValueSetBundle(input) {
        try {
            let valueSets = [];
            let errors = [];
            let earliestDate = null;

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
                    earliestDate = vsDate;
                }
            }
            // Handle Bundle
            else if (input && input.resourceType === 'Bundle') {
                if (!input.entry || input.entry.length === 0) {
                    return this.createOperationOutcome('warning', 'Bundle contains no entries');
                }

                for (const entry of input.entry) {
                    let resource = entry.resource;
                    
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
                        if (!earliestDate || vsDate < earliestDate) {
                            earliestDate = vsDate;
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
            this.storeValueSets(valueSets, earliestDate);
            this.buildRules(valueSets);

            // Update statistics
            this.incrementStat('totalValueSetsProcessed', valueSets.length);

            return this.createOperationOutcome(
                'success',
                `Successfully processed ${valueSets.length} ValueSet(s)`,
                errors.length > 0 ? errors : null
            );

        } catch (error) {
            console.error('Error processing ValueSet:', error);
            return this.createOperationOutcome('error', `Processing failed: ${error.message}`);
        }
    }

    /**
     * Expand a ValueSet using tx.fhir.org if no expansion present
     */
    async expandValueSet(valueSet) {
        try {
            console.log(`\n=== Expanding ValueSet ${valueSet.id || 'unknown'} using tx.fhir.org ===`);
            
            const url = 'https://tx.fhir.org/r4/ValueSet/$expand';
            const requestBody = {
                resourceType: 'Parameters',
                parameter: [
                    {
                        name: 'valueSet',
                        resource: valueSet
                    }
                ]
            };
            
            console.log('TX Server Request:');
            console.log(`  URL: ${url}`);
            console.log(`  Method: POST`);
            console.log(`  ValueSet ID: ${valueSet.id}`);
            console.log(`  ValueSet URL: ${valueSet.url || 'not specified'}`);
            console.log(`  Request Body (truncated):`);
            console.log(JSON.stringify(requestBody, null, 2).substring(0, 500) + '...');
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/fhir+json',
                    'Accept': 'application/fhir+json'
                },
                body: JSON.stringify(requestBody)
            });

            console.log('\nTX Server Response:');
            console.log(`  Status: ${response.status} ${response.statusText}`);
            console.log(`  Headers: ${JSON.stringify(Object.fromEntries(response.headers), null, 2)}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`  Error Body: ${errorText}`);
                console.error(`=== Expansion failed for ${valueSet.id || 'unknown'} ===\n`);
                return null;
            }

            const result = await response.json();
            console.log(`  Response Body (first 1000 chars):`);
            console.log(JSON.stringify(result, null, 2).substring(0, 1000) + '...');
            
            // Extract expanded ValueSet from Parameters response
            let expandedValueSet = null;
            if (result.resourceType === 'ValueSet' && result.expansion) {
                console.log(`  Response structure: Direct ValueSet with expansion`);
                console.log(`  Expansion contains ${result.expansion.contains?.length || 0} codes`);
                expandedValueSet = result;
            } else if (result.resourceType === 'Parameters' && result.parameter) {
                console.log(`  Response structure: Parameters wrapper`);
                const valueSetParam = result.parameter.find(p => p.name === 'return' && p.resource);
                if (valueSetParam && valueSetParam.resource.expansion) {
                    console.log(`  Expansion contains ${valueSetParam.resource.expansion.contains?.length || 0} codes`);
                    expandedValueSet = valueSetParam.resource;
                } else {
                    console.log(`  Parameters response but no valid ValueSet with expansion found`);
                }
            } else {
                console.log(`  Unexpected response type: ${result.resourceType}`);
            }

            if (!expandedValueSet) {
                console.error('  ERROR: Unexpected expansion response format - no valid expanded ValueSet found');
                console.error(`=== Expansion failed for ${valueSet.id || 'unknown'} ===\n`);
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

            console.log(`\n  SUCCESS: ValueSet ${expandedValueSet.id} expanded successfully`);
            console.log(`  Final expansion contains ${expandedValueSet.expansion?.contains?.length || 0} codes`);
            console.log(`=== Expansion complete for ${valueSet.id || 'unknown'} ===\n`);
            
            return expandedValueSet;

        } catch (error) {
            console.error(`\n  ERROR: Exception during ValueSet expansion`);
            console.error(`  Error type: ${error.name}`);
            console.error(`  Error message: ${error.message}`);
            console.error(`  Stack trace: ${error.stack}`);
            console.error(`=== Expansion failed for ${valueSet.id || 'unknown'} ===\n`);
            return null;
        }
    }

    /**
     * Get the most appropriate date from a ValueSet
     * Prefers expansion.timestamp over date
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
     * Note: expansion.contains is validated after expansion attempt in processValueSetBundle
     */
    validateValueSet(resource) {
        const errors = [];

        if (!resource.id) {
            errors.push('ValueSet missing required field: id');
        }

        // Check for topic in either topic element or useContext with focus
        const topicCodings = this.extractTopicCodings(resource);
        if (topicCodings.length === 0) {
            errors.push(`ValueSet ${resource.id || 'unknown'} missing topic: must have either topic[0].coding[0] or useContext with code=focus`);
        }

        // Note: expansion check is done after expansion attempt in processValueSetBundle
        if (!resource.expansion || !resource.expansion.contains) {
            errors.push(`ValueSet ${resource.id || 'unknown'} missing expansion.contains (expansion will be attempted)`);
        }

        return { errors };
    }

    /**
     * Extract all topic codings from either topic element or useContext (supports multiple focus contexts)
     */
    extractTopicCodings(resource) {
        const topicCodings = [];

        // Try topic element first
        if (resource.topic && resource.topic.length > 0) {
            const topicCoding = resource.topic[0].coding ? resource.topic[0].coding[0] : null;
            if (topicCoding && topicCoding.code) {
                topicCodings.push(topicCoding);
            }
        }

        // Try ALL useContext with focus (not just the first one)
        if (resource.useContext && resource.useContext.length > 0) {
            for (const ctx of resource.useContext) {
                if (ctx.code && ctx.code.code === 'focus') {
                    if (ctx.valueCodeableConcept && ctx.valueCodeableConcept.coding) {
                        // Get all codings from this focus context
                        for (const coding of ctx.valueCodeableConcept.coding) {
                            if (coding && coding.code) {
                                topicCodings.push(coding);
                            }
                        }
                    }
                }
            }
        }

        return topicCodings;
    }

    /**
     * Store ValueSets in database
     */
    storeValueSets(valueSets, earliestDate) {
        const insertStmt = this.db.prepare(
            'INSERT OR REPLACE INTO valuesets (id, resource, date) VALUES (?, ?, ?)'
        );

        for (const vs of valueSets) {
            insertStmt.run(vs.id, JSON.stringify(vs), vs.date || null);
        }

        // Update earliest date if needed
        if (earliestDate) {
            const currentEarliest = this.getMetadata('earliestDate');
            if (!currentEarliest || earliestDate < new Date(currentEarliest)) {
                this.setMetadata('earliestDate', earliestDate.toISOString());
            }
        }
    }

    /**
     * Build internal rule set from ValueSets
     */
    buildRules(valueSets) {
        const insertStmt = this.db.prepare(
            'INSERT OR REPLACE INTO rules (code_key, topic_code, topic_system, topic_display) VALUES (?, ?, ?, ?)'
        );

        for (const vs of valueSets) {
            const topicCodings = this.extractTopicCodings(vs);
            if (topicCodings.length === 0) continue; // Should not happen if validation passed

            // Process each topic coding - if there are multiple focus contexts,
            // all codes in the expansion will be associated with all topics
            for (const topicCoding of topicCodings) {
                const topicCode = topicCoding.code;
                const topicSystem = topicCoding.system;
                const topicDisplay = topicCoding.display || topicCode;

                if (vs.expansion && vs.expansion.contains) {
                    this.extractCodesFromExpansion(
                        vs.expansion.contains,
                        insertStmt,
                        { code: topicCode, system: topicSystem, display: topicDisplay }
                    );
                }
            }
        }
    }

    /**
     * Recursively extract codes from ValueSet expansion
     */
    extractCodesFromExpansion(contains, insertStmt, topic) {
        for (const item of contains) {
            if (item.code && item.system) {
                const key = `${item.system}|${item.code}`;
                insertStmt.run(key, topic.code, topic.system, topic.display);
            }

            if (item.contains) {
                this.extractCodesFromExpansion(item.contains, insertStmt, topic);
            }
        }
    }

    /**
     * API 2: Analyze and Tag Resources
     */
    analyzeResourceBundle(bundle) {
        try {
            if (!bundle || bundle.resourceType !== 'Bundle') {
                throw new Error('Invalid Bundle: resourceType must be "Bundle"');
            }

            if (!bundle.entry || bundle.entry.length === 0) {
                throw new Error('Bundle contains no entries');
            }

            // Check if rules have been loaded
            const rulesCount = this.db.prepare('SELECT COUNT(*) as count FROM rules').get();
            if (rulesCount.count === 0) {
                throw new Error('No sensitive topic rules loaded. Please process ValueSets first (API 1).');
            }

            const rules = this.getAllRules();
            const earliestDate = this.getMetadata('earliestDate');
            const batchEntries = [];
            let analyzed = 0;
            let labeled = 0;
            let skipped = 0;

            for (const entry of bundle.entry) {
                const resource = entry.resource;
                
                if (!resource || !this.SUPPORTED_RESOURCES.includes(resource.resourceType)) {
                    continue;
                }

                if (this.shouldSkipResource(resource, earliestDate)) {
                    skipped++;
                    continue;
                }

                analyzed++;

                const matchedTopics = this.analyzeResource(resource, rules);

                if (matchedTopics.length > 0) {
                    this.applySecurityLabels(resource, matchedTopics);
                    labeled++;
                }

                this.addLastSourceSync(resource);
                batchEntries.push(this.createBatchEntry(resource));
            }

            // Update statistics
            this.incrementStat('totalResourcesAnalyzed', analyzed);
            this.incrementStat('totalResourcesLabeled', labeled);
            this.incrementStat('totalResourcesSkipped', skipped);

            return this.createBatchBundle(batchEntries, {
                analyzed,
                labeled,
                skipped
            });

        } catch (error) {
            console.error('Error analyzing resources:', error);
            throw error;
        }
    }

    /**
     * API 2 Variant: Analyze and Tag Resources - Return Full Bundle
     * Returns a complete bundle with all resources (not just updates)
     */
    analyzeResourceBundleFull(bundle) {
        try {
            if (!bundle || bundle.resourceType !== 'Bundle') {
                throw new Error('Invalid Bundle: resourceType must be "Bundle"');
            }

            if (!bundle.entry || bundle.entry.length === 0) {
                throw new Error('Bundle contains no entries');
            }

            // Check if rules have been loaded
            const rulesCount = this.db.prepare('SELECT COUNT(*) as count FROM rules').get();
            if (rulesCount.count === 0) {
                throw new Error('No sensitive topic rules loaded. Please process ValueSets first (API 1).');
            }

            const rules = this.getAllRules();
            const earliestDate = this.getMetadata('earliestDate');
            const updatedEntries = [];
            let analyzed = 0;
            let labeled = 0;
            let skipped = 0;

            // Process all entries from the input bundle
            for (const entry of bundle.entry) {
                const resource = entry.resource;
                
                // Create a copy of the entry to preserve all original fields
                const newEntry = JSON.parse(JSON.stringify(entry));
                
                if (!resource || !this.SUPPORTED_RESOURCES.includes(resource.resourceType)) {
                    // Keep unsupported resources as-is
                    updatedEntries.push(newEntry);
                    continue;
                }

                if (this.shouldSkipResource(resource, earliestDate)) {
                    // Keep skipped resources as-is
                    updatedEntries.push(newEntry);
                    skipped++;
                    continue;
                }

                analyzed++;

                const matchedTopics = this.analyzeResource(newEntry.resource, rules);

                if (matchedTopics.length > 0) {
                    this.applySecurityLabels(newEntry.resource, matchedTopics);
                    labeled++;
                }

                this.addLastSourceSync(newEntry.resource);
                updatedEntries.push(newEntry);
            }

            // Update statistics
            this.incrementStat('totalResourcesAnalyzed', analyzed);
            this.incrementStat('totalResourcesLabeled', labeled);
            this.incrementStat('totalResourcesSkipped', skipped);

            // Create output bundle preserving original bundle structure
            const outputBundle = {
                resourceType: 'Bundle',
                ...(bundle.id && { id: bundle.id }),
                type: bundle.type || 'collection',
                ...(bundle.identifier && { identifier: bundle.identifier }),
                ...(bundle.timestamp && { timestamp: bundle.timestamp }),
                meta: {
                    lastUpdated: new Date().toISOString(),
                    tag: [{
                        system: 'http://example.org/fhir/CodeSystem/sls-processing',
                        code: 'sls-tagged',
                        display: 'SLS Security Labeled'
                    }]
                },
                ...(bundle.total !== undefined && { total: bundle.total }),
                ...(bundle.link && { link: bundle.link }),
                entry: updatedEntries,
                extension: [{
                    url: 'http://example.org/fhir/StructureDefinition/processing-summary',
                    extension: [
                        { url: 'analyzed', valueInteger: analyzed },
                        { url: 'labeled', valueInteger: labeled },
                        { url: 'skipped', valueInteger: skipped }
                    ]
                }]
            };

            // Add distinct security labels to bundle meta
            const securityLabels = this.collectDistinctSecurityLabels(updatedEntries);
            if (securityLabels.length > 0) {
                outputBundle.meta.security = securityLabels;
            }

            return outputBundle;

        } catch (error) {
            console.error('Error analyzing resources (full bundle):', error);
            throw error;
        }
    }

    /**
     * Get all rules from database
     */
    getAllRules() {
        const rows = this.db.prepare('SELECT * FROM rules').all();
        const rules = {};
        for (const row of rows) {
            rules[row.code_key] = {
                code: row.topic_code,
                system: row.topic_system,
                display: row.topic_display
            };
        }
        return rules;
    }

    /**
     * Check if resource should be skipped
     */
    shouldSkipResource(resource, earliestDate) {
        if (!earliestDate || !resource.meta || !resource.meta.extension) {
            return false;
        }

        const syncExt = resource.meta.extension.find(
            ext => ext.url === this.LAST_SOURCE_SYNC_URL
        );

        if (!syncExt || !syncExt.valueDateTime) {
            return false;
        }

        const syncDate = new Date(syncExt.valueDateTime);
        return syncDate > new Date(earliestDate);
    }

    /**
     * Analyze resource for sensitive codes
     */
    analyzeResource(resource, rules) {
        const matchedTopics = new Set();
        this.findAndCheckCodes(resource, rules, matchedTopics);
        return Array.from(matchedTopics);
    }

    /**
     * Recursively find and check codes
     */
    findAndCheckCodes(obj, rules, matchedTopics) {
        if (!obj || typeof obj !== 'object') {
            return;
        }

        if (obj.system && obj.code) {
            const key = `${obj.system}|${obj.code}`;
            if (rules[key]) {
                matchedTopics.add(JSON.stringify(rules[key]));
            }
        }

        if (obj.coding && Array.isArray(obj.coding)) {
            for (const coding of obj.coding) {
                this.findAndCheckCodes(coding, rules, matchedTopics);
            }
        }

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
        if (!resource.meta) {
            resource.meta = {};
        }

        if (!resource.meta.security) {
            resource.meta.security = [];
        }

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
     * Add lastSourceSync extension
     */
    addLastSourceSync(resource) {
        if (!resource.meta) {
            resource.meta = {};
        }

        if (!resource.meta.extension) {
            resource.meta.extension = [];
        }

        resource.meta.extension = resource.meta.extension.filter(
            ext => ext.url !== this.LAST_SOURCE_SYNC_URL
        );

        resource.meta.extension.push({
            url: this.LAST_SOURCE_SYNC_URL,
            valueDateTime: new Date().toISOString()
        });
    }

    /**
     * Create batch entry
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
            extension: [{
                url: 'http://example.org/fhir/StructureDefinition/processing-summary',
                extension: [
                    { url: 'analyzed', valueInteger: stats.analyzed },
                    { url: 'labeled', valueInteger: stats.labeled },
                    { url: 'skipped', valueInteger: stats.skipped }
                ]
            }]
        };
        
        if (securityLabels.length > 0) {
            bundle.meta.security = securityLabels;
        }
        
        return bundle;
    }

    /**
     * Collect distinct security labels from all resources
     */
    collectDistinctSecurityLabels(entries) {
        const securityMap = new Map();
        
        for (const entry of entries) {
            const resource = entry.resource;
            
            if (resource.meta && resource.meta.security && Array.isArray(resource.meta.security)) {
                for (const security of resource.meta.security) {
                    const key = `${security.system}|${security.code}`;
                    
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
     * Get status information
     */
    getStatus() {
        const valueSets = this.db.prepare('SELECT id, date FROM valuesets').all();
        const rulesCount = this.db.prepare('SELECT COUNT(*) as count FROM rules').get();
        const stats = this.getStats();
        const earliestDate = this.getMetadata('earliestDate');

        return {
            valueSets: valueSets.map(vs => ({
                id: vs.id,
                date: vs.date
            })),
            rulesCount: rulesCount.count,
            earliestDate: earliestDate,
            stats: stats
        };
    }

    /**
     * Database helper methods
     */
    getMetadata(key) {
        const row = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get(key);
        return row ? row.value : null;
    }

    setMetadata(key, value) {
        this.db.prepare('INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
            .run(key, value);
    }

    getStats() {
        const rows = this.db.prepare('SELECT key, value FROM stats').all();
        const stats = {};
        for (const row of rows) {
            stats[row.key] = row.value;
        }
        return stats;
    }

    incrementStat(key, increment = 1) {
        this.db.prepare('UPDATE stats SET value = value + ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?')
            .run(increment, key);
    }

    clearAllData() {
        this.db.exec(`
            DELETE FROM valuesets;
            DELETE FROM rules;
            DELETE FROM metadata;
            UPDATE stats SET value = 0, updated_at = CURRENT_TIMESTAMP;
        `);
    }

    close() {
        this.db.close();
    }
}

module.exports = FHIRSecurityLabelingService;
