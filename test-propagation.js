#!/usr/bin/env node
/**
 * Quick integration test for hierarchical tag propagation
 * Tests Encounter→EpisodeOfCare and Encounter→Condition flows
 */

const FHIRSecurityLabelingService = require('./backend/fhir-sls-service.js');

// Create service instance
const sls = new FHIRSecurityLabelingService(':memory:');

// Set up minimal rule set for mental health
const mentalHealthValueSet = {
    resourceType: 'ValueSet',
    id: 'mental-health',
    url: 'http://example.org/ValueSet/mental-health',
    version: '1.0',
    name: 'MentalHealthConditions',
    title: 'Mental Health Conditions',
    expansion: {
        timestamp: new Date().toISOString(),
        contains: [
            {
                system: 'http://snomed.info/sct',
                code: '426000000',
                display: 'Depression'
            }
        ]
    },
    compose: {
        include: [
            {
                system: 'http://snomed.info/sct',
                concept: [
                    { code: '426000000', display: 'Depression' }
                ]
            }
        ]
    }
};

// Configure sensitive topic for test
const sensitiveTopicValueSet = {
    resourceType: 'ValueSet',
    id: 'sensitive-topics',
    url: 'http://example.org/ValueSet/sensitive-topics',
    version: '1.0',
    expansion: {
        timestamp: new Date().toISOString(),
        contains: [
            {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                code: 'PSY',
                display: 'psychiatry information'
            }
        ]
    },
    compose: {
        include: [
            {
                system: 'http://snomed.info/sct',
                valueset: ['http://example.org/ValueSet/mental-health']
            }
        ]
    }
};

// Load ValueSets
console.log('Loading ValueSets...');
sls.processValueSetBundle(mentalHealthValueSet);
sls.processValueSetBundle(sensitiveTopicValueSet);

// Create test bundle with propagation flow
const testBundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
        // EpisodeOfCare that should receive propagated tags
        {
            resource: {
                resourceType: 'EpisodeOfCare',
                id: 'episode-1',
                meta: {}
            }
        },
        // Condition that should receive propagated tags
        {
            resource: {
                resourceType: 'Condition',
                id: 'condition-1',
                meta: {}
            }
        },
        // Encounter that links to both
        {
            resource: {
                resourceType: 'Encounter',
                id: 'enc-1',
                meta: {},
                episodeOfCare: [
                    { reference: 'EpisodeOfCare/episode-1' }
                ],
                diagnosis: [
                    { condition: { reference: 'Condition/condition-1' } }
                ]
            }
        },
        // Observation with depression that should trigger propagation
        {
            resource: {
                resourceType: 'Observation',
                id: 'obs-1',
                meta: {},
                encounter: { reference: 'Encounter/enc-1' },
                code: {
                    coding: [
                        {
                            system: 'http://snomed.info/sct',
                            code: '426000000',
                            display: 'Depression'
                        }
                    ]
                }
            }
        }
    ]
};

console.log('\n=== Test Bundle ===');
console.log('Input: Observation(obs-1) with depression → Encounter(enc-1) → EpisodeOfCare(episode-1) + Condition(condition-1)');

console.log('\n=== Running analysis ===');
const result = sls.analyzeResourceBundle(testBundle);

console.log('\n=== Output ===');
console.log(`Bundle entries: ${result.entry.length}`);

result.entry.forEach(entry => {
    if (!entry.resource) return;
    const res = entry.resource;
    const tags = res.meta && res.meta.security 
        ? res.meta.security.map(s => `${s.system.split('/').pop()}/${s.code}`).join(', ')
        : 'none';
    console.log(`  ${res.resourceType}/${res.id}: ${tags}`);
});

// Validate propagation
console.log('\n=== Validation ===');
let passed = 0;
let failed = 0;

const obsEntry = result.entry.find(e => e.resource && e.resource.resourceType === 'Observation');
if (obsEntry && obsEntry.resource.meta && obsEntry.resource.meta.security && obsEntry.resource.meta.security.length > 1) {
    console.log('✓ Observation tagged (expected)');
    passed++;
} else {
    console.log('✗ Observation NOT properly tagged');
    failed++;
}

const encEntry = result.entry.find(e => e.resource && e.resource.resourceType === 'Encounter');
if (encEntry && encEntry.resource.meta && encEntry.resource.meta.security && encEntry.resource.meta.security.length > 1) {
    console.log('✓ Encounter tagged via propagation (expected)');
    passed++;
} else {
    console.log('✗ Encounter NOT propagated');
    failed++;
}

const episodeEntry = result.entry.find(e => e.resource && e.resource.resourceType === 'EpisodeOfCare');
if (episodeEntry && episodeEntry.resource.meta && episodeEntry.resource.meta.security && episodeEntry.resource.meta.security.length > 1) {
    console.log('✓ EpisodeOfCare tagged via hierarchical propagation (expected)');
    passed++;
} else {
    console.log('✗ EpisodeOfCare NOT propagated');
    failed++;
}

const conditionEntry = result.entry.find(e => e.resource && e.resource.resourceType === 'Condition');
if (conditionEntry && conditionEntry.resource.meta && conditionEntry.resource.meta.security && conditionEntry.resource.meta.security.length > 1) {
    console.log('✓ Condition tagged via hierarchical propagation (expected)');
    passed++;
} else {
    console.log('✗ Condition NOT propagated');
    failed++;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
